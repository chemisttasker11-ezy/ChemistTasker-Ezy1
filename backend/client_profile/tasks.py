from datetime import timedelta, datetime
from django.apps import apps
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from celery import shared_task
from core.integrations.abr import _parse_abn_html_fields, abn_lookup  # noqa: F401  (historical public import path)
from core.task_queue import async_task
from users.tasks import send_async_email
from shifts.models import ShiftSlotAssignment
from onboarding.models import OnboardingNotification
from memberships.models import MembershipApplication, Membership
from organizations.models import Pharmacy, PharmacyAdmin
from organizations.timezone import get_pharmacy_timezone
from django.contrib.contenttypes.models import ContentType
from onboarding.emails import send_referee_emails
from onboarding.tasks import (  # noqa: F401  (deployed task objects)
    run_referee_reminder,
    verify_abn_task,
    verify_ahpra_task,
    verify_filefield_task,
)
from onboarding.verification.reminders import (  # noqa: F401  (historical public import path)
    _final_evaluation_reminder_key,
    _marker_delete,
    _marker_get,
    _marker_set,
    cancel_all_referee_reminders,
    cancel_referee_reminder,
    schedule_referee_reminder,
)
from shifts.emails import build_shift_email_context
from users.navigation import get_frontend_dashboard_url
from memberships.labels import membership_role_label
import logging
import re
from django.contrib.auth import get_user_model
from django.template.defaultfilters import date as datefilter
from users.models import OrganizationMembership


logger = logging.getLogger(__name__)

User = get_user_model()


# --- ORCHESTRATOR AND FINAL EVALUATOR ---
@shared_task(name="client_profile.tasks.run_all_verifications", queue="default")
def run_all_verifications(model_name, object_pk, is_create=False):
    """
    MODIFIED: This orchestrator now also sends the initial admin notification.
    """
    from django.apps import apps
    from django.utils import timezone
    from datetime import timedelta
    from onboarding.emails import notify_superuser_on_onboarding, send_referee_emails

    Model = apps.get_model("client_profile", model_name)
    try:
        obj = Model.objects.get(pk=object_pk)
    except Model.DoesNotExist:
        logger.error(f"[ORCHESTRATOR] Cannot find {model_name} with pk={object_pk}. Aborting.")
        return

    # --- NOTIFY SUPERUSER IMMEDIATELY ON SUBMISSION ---
    if not notification_already_sent(obj, 'admin_notify'):
        logger.info(f"[ORCHESTRATOR] Sending admin notification for {model_name} pk={object_pk}.")
        notify_superuser_on_onboarding(obj)
        mark_notification_sent(obj, 'admin_notify')

    user = obj.user
    model_name_lower = model_name.lower()


    # --- 1. Trigger all automated verification tasks (ABN, AHPRA, Files) ---
    if model_name_lower == 'pharmacistonboarding':
        # NOTE: AHPRA verification is handled manually to avoid automated scraping.
        # if obj.ahpra_number:
        #     async_task('client_profile.tasks.verify_ahpra_task', model_name, object_pk, obj.ahpra_number, user.first_name, user.last_name, user.email, q_options={'timeout': 300})
        if obj.payment_preference == "ABN" and obj.abn:
            async_task('client_profile.tasks.verify_abn_task', model_name, object_pk, obj.abn, user.first_name, user.last_name, user.email, note_field='abn_verification_note')
        if obj.government_id:
            async_task('client_profile.tasks.verify_filefield_task', model_name, object_pk, 'government_id', user.first_name, user.last_name, user.email, 'gov_id_verified', note_field='gov_id_verification_note')

    elif model_name_lower == 'owneronboarding':
        # NOTE: AHPRA verification is handled manually to avoid automated scraping.
        # if obj.role == "PHARMACIST" and obj.ahpra_number:
        #     async_task('client_profile.tasks.verify_ahpra_task', model_name, object_pk, obj.ahpra_number, user.first_name, user.last_name, user.email, q_options={'timeout': 300})
        pass

    elif model_name_lower == 'otherstaffonboarding':
        if obj.government_id:
            async_task('client_profile.tasks.verify_filefield_task', model_name, object_pk, 'government_id', user.first_name, user.last_name, user.email, 'gov_id_verified', note_field='gov_id_verification_note')
        if obj.payment_preference == 'ABN' and obj.abn:
            async_task('client_profile.tasks.verify_abn_task', model_name, object_pk, obj.abn, user.first_name, user.last_name, user.email, note_field='abn_verification_note')
        # Role-specific files
        if obj.role_type == 'INTERN' and obj.ahpra_proof:
            async_task('client_profile.tasks.verify_filefield_task', model_name, object_pk, 'ahpra_proof', user.first_name, user.last_name, user.email, 'ahpra_proof_verified', note_field='ahpra_proof_verification_note')
        if obj.role_type == 'INTERN' and obj.hours_proof:
            async_task('client_profile.tasks.verify_filefield_task', model_name, object_pk, 'hours_proof', user.first_name, user.last_name, user.email, 'hours_proof_verified', note_field='hours_proof_verification_note')
        if obj.role_type in ['ASSISTANT', 'TECHNICIAN'] and obj.certificate:
            async_task('client_profile.tasks.verify_filefield_task', model_name, object_pk, 'certificate', user.first_name, user.last_name, user.email, 'certificate_verified', note_field='certificate_verification_note')
        if obj.role_type == 'STUDENT' and obj.university_id:
            async_task('client_profile.tasks.verify_filefield_task', model_name, object_pk, 'university_id', user.first_name, user.last_name, user.email, 'university_id_verified', note_field='university_id_verification_note')
        # Optional files
        if obj.cpr_certificate:
            async_task('client_profile.tasks.verify_filefield_task', model_name, object_pk, 'cpr_certificate', user.first_name, user.last_name, user.email, 'cpr_certificate_verified', note_field='cpr_certificate_verification_note')
        if obj.s8_certificate:
            async_task('client_profile.tasks.verify_filefield_task', model_name, object_pk, 's8_certificate', user.first_name, user.last_name, user.email, 's8_certificate_verified', note_field='s8_certificate_verification_note')
    elif model_name_lower == 'exploreronboarding':
        if obj.government_id:
            async_task(
                'client_profile.tasks.verify_filefield_task',
                model_name, object_pk, 'government_id',
                user.first_name, user.last_name, user.email,
                'gov_id_verified',
                note_field='gov_id_verification_note'
            )

    # --- 2. Send initial referee emails ---
    referee_models = ['pharmacistonboarding', 'otherstaffonboarding', 'exploreronboarding']
    if model_name_lower in referee_models:
        logger.info(f"[ORCHESTRATOR] Sending initial referee requests for {model_name} pk={object_pk}.")
        send_referee_emails(obj)

    # --- 3. Schedule the final evaluation ---
    logger.info(f"[ORCHESTRATOR] All tasks for {model_name} pk={object_pk} triggered. Scheduling evaluation.")
    async_task(
        'client_profile.tasks.final_evaluation',
        model_name,
        object_pk,
        q_options={'eta': timezone.now() + timedelta(minutes=3)}
    )


def notification_already_sent(obj, notif_type):
    content_type = ContentType.objects.get_for_model(obj)
    return OnboardingNotification.objects.filter(
        content_type=content_type,
        object_id=obj.pk,
        notification_type=notif_type
    ).exists()

def mark_notification_sent(obj, notif_type):
    content_type = ContentType.objects.get_for_model(obj)
    OnboardingNotification.objects.get_or_create(
        content_type=content_type,
        object_id=obj.pk,
        notification_type=notif_type
    )

@shared_task(name="client_profile.tasks.final_evaluation", queue="default")
def final_evaluation(model_name, object_pk, retry_count=0, is_reminder=False):
    """
    REVISED: This task now correctly handles all states and cleans up scheduled tasks.
    """
    from django.apps import apps
    from django.utils import timezone
    from datetime import timedelta
    from onboarding.emails import send_referee_emails
    from users.navigation import get_frontend_dashboard_url
    from django.contrib.contenttypes.models import ContentType
    from core.task_queue import async_task
    import logging

    logger = logging.getLogger("client_profile.tasks")

    Model = apps.get_model("client_profile", model_name)
    try:
        obj = Model.objects.get(pk=object_pk)
    except Model.DoesNotExist:
        logger.error(f"[FINAL EVALUATION] ERROR: No object for pk={object_pk}")
        return

    reminder_key = _final_evaluation_reminder_key(model_name, object_pk)
    if is_reminder:
        if not _marker_get(reminder_key):
            logger.info(f"[FINAL EVALUATION] Skipping cancelled reminder for pk={object_pk}.")
            return
        _marker_delete(reminder_key)

    def cancel_pending_reminders():
        _marker_delete(_final_evaluation_reminder_key(model_name, object_pk))
        logger.info(f"[FINAL EVALUATION] pk={object_pk} reached a final state. All pending reminders cancelled.")

    # Keep your retry guard
    if retry_count > 15:
        logger.error(f"[FINAL EVALUATION] Timed out waiting for automated tasks for {model_name} pk={object_pk}.")
        cancel_pending_reminders()
        return

    # Build required checks (unchanged)
    required_checks = []
    model_name_lower = model_name.lower()

    if model_name_lower == 'owneronboarding':
        if getattr(obj, 'role', None) == "PHARMACIST":
            required_checks.append('ahpra')

    elif model_name_lower == 'pharmacistonboarding':
        required_checks.extend(['gov_id', 'ahpra'])
        if obj.payment_preference == "ABN":
            if obj.abn:
                required_checks.append('abn')
        elif obj.payment_preference == "TFN":
            if obj.tfn_number:
                required_checks.append('tfn_number')

    elif model_name_lower == 'otherstaffonboarding':
        required_checks.append('gov_id')
        if obj.payment_preference == 'ABN' and obj.abn:
            required_checks.append('abn')
        if obj.payment_preference == 'TFN' and obj.tfn_number:
            required_checks.append('tfn_number')
        if getattr(obj, 'role_type', None) == 'INTERN':
            required_checks.extend(['ahpra_proof', 'hours_proof'])
        if getattr(obj, 'role_type', None) in ['ASSISTANT', 'TECHNICIAN']:
            required_checks.append('certificate')
        if getattr(obj, 'role_type', None) == 'STUDENT':
            required_checks.append('university_id')
        if getattr(obj, 'cpr_certificate', None):
            required_checks.append('cpr_certificate')
        if getattr(obj, 's8_certificate', None):
            required_checks.append('s8_certificate')

    elif model_name_lower == 'exploreronboarding':
        required_checks.append('gov_id')

    # Evaluate checks (unchanged)
    has_failed_check, is_pending_check, failure_reasons = False, False, []
    for check in required_checks:
        verified_flag = f"{check}_verified"
        note_flag = f"{check}_verification_note"
        if hasattr(obj, verified_flag):
            is_verified = getattr(obj, verified_flag)
            note = getattr(obj, note_flag, "")
            if not is_verified and note:
                has_failed_check = True
                failure_reasons.append(note)
            elif not is_verified and not note:
                is_pending_check = True

    # Referee requirements (unchanged)
    referees_needed = model_name_lower in ['pharmacistonboarding', 'otherstaffonboarding', 'exploreronboarding']
    is_pending_referee = False
    if referees_needed:
        for idx in [1, 2]:
            if getattr(obj, f"referee{idx}_rejected", False):
                has_failed_check = True
                failure_reasons.append(f"Referee {idx} has declined the request.")
            elif not getattr(obj, f"referee{idx}_confirmed", False):
                is_pending_referee = True

    # Failed state (unchanged)
    if has_failed_check:
        logger.info(f"[FINAL EVALUATION] pk={object_pk} has FAILED. Reason(s): {failure_reasons}")
        obj.verified = False
        obj.save(update_fields=['verified'])
        if not notification_already_sent(obj, 'failed'):
            async_task(
                'users.tasks.send_async_email',
                subject="Action Required: Your Profile Verification Needs Attention",
                recipient_list=[obj.user.email],
                template_name="emails/profile_verification_failed.html",
                context={
                    "user_first_name": obj.user.first_name,
                    "model_type": model_name,
                    "verification_reasons": failure_reasons,
                    "frontend_profile_link": get_frontend_dashboard_url(obj.user)
                },
                text_template="emails/profile_verification_failed.txt"
            )
            mark_notification_sent(obj, 'failed')
        cancel_pending_reminders()
        return

    # Helper: do we already have a future reminder scheduled for this profile?
    def _has_future_reminder(model_name, object_pk):
        return _marker_get(_final_evaluation_reminder_key(model_name, object_pk))

    # Debug timing: 0.1h (~6 min). Use 48 for production.
    REMINDER_DELAY = timedelta(hours=48)
    # Keep your quick re-check loop, but schedule it properly
    RECHECK_DELAY = timedelta(seconds=20)

    if is_pending_referee:
        logger.info(f"[FINAL EVALUATION] pk={object_pk} is waiting for referee confirmation.")
        obj.verified = False
        obj.save(update_fields=['verified'])

        # If this run was triggered by the scheduled reminder, send reminder emails now
        if is_reminder:
            logger.info(f"[FINAL EVALUATION] Sending referee reminder emails for pk={object_pk}.")
            send_referee_emails(obj, is_reminder=True)

        # IMPORTANT: Do NOT cancel here; only cancel in final states.
        # Ensure exactly ONE future reminder exists
        if not _has_future_reminder(model_name, object_pk):
            _marker_set(
                _final_evaluation_reminder_key(model_name, object_pk),
                timeout=int(REMINDER_DELAY.total_seconds()) + 3600,
            )
            final_evaluation.apply_async(
                args=(model_name, object_pk),
                kwargs={'is_reminder': True},
                eta=timezone.now() + REMINDER_DELAY,
                queue="default",
            )
            logger.info(f"[FINAL EVALUATION] Scheduled next referee check for pk={object_pk} at {(timezone.now() + REMINDER_DELAY).isoformat()}.")
        else:
            logger.info(f"[FINAL EVALUATION] Future referee reminder already exists for pk={object_pk}; leaving it in place.")

        # If other automated checks are also pending, keep the quick re-check loop alive (properly delayed)
        if is_pending_check:
            final_evaluation.apply_async(
                args=(model_name, object_pk),
                eta=timezone.now() + RECHECK_DELAY,
                queue="default",
            )
        return

    # Automated checks still pending (no referee pending) -> keep quick loop
    if is_pending_check:
        logger.info(f"[FINAL EVALUATION] pk={object_pk} is waiting for automated tasks. Re-checking in 20s.")
        final_evaluation.apply_async(
            args=(model_name, object_pk),
            eta=timezone.now() + RECHECK_DELAY,
            queue="default",
        )
        return

    # Success state (unchanged)
    logger.info(f"[FINAL EVALUATION] pk={object_pk} has been successfully VERIFIED.")
    obj.verified = True
    obj.save(update_fields=['verified'])
    try:
        from rewards.services import award_verified_referrals_for_user
        transaction.on_commit(lambda user_id=obj.user_id: award_verified_referrals_for_user(get_user_model().objects.get(id=user_id)))
    except Exception:
        logger.exception("[FINAL EVALUATION] Failed to schedule pill referral award for pk=%s", object_pk)

    if not notification_already_sent(obj, 'verified'):
        async_task(
            'users.tasks.send_async_email',
            subject="🎉 Your Profile is Verified! 🎉",
            recipient_list=[obj.user.email],
            template_name="emails/profile_verified.html",
            context={
                "user_first_name": obj.user.first_name,
                "model_type": model_name,
                "frontend_profile_link": get_frontend_dashboard_url(obj.user)
            },
            text_template="emails/profile_verified.txt"
        )
        mark_notification_sent(obj, 'verified')

    # Only cancel reminders in a final state
    cancel_pending_reminders()
    return

# ========== Shift Reminder (Scheduled) ==========

@shared_task(name="client_profile.tasks.send_shift_reminders", queue="notifications")
def send_shift_reminders():
    now_utc = timezone.now()
    today_utc = now_utc.date()
    date_window = [today_utc + timedelta(days=delta) for delta in (-1, 0, 1, 2)]

    assignments = (
        ShiftSlotAssignment.objects.select_related("shift", "shift__pharmacy", "slot", "user")
        .filter(Q(slot_date__in=date_window) | Q(slot_date__isnull=True))
    )

    pharmacy_assignment_map = {}
    for assignment in assignments:
        pharmacy = assignment.shift.pharmacy
        if pharmacy is None:
            continue
        pharmacy_assignment_map.setdefault(pharmacy.id, {"pharmacy": pharmacy, "assignments": []})[
            "assignments"
        ].append(assignment)

    total_sent = 0
    for entry in pharmacy_assignment_map.values():
        pharmacy = entry["pharmacy"]
        tz = get_pharmacy_timezone(pharmacy)
        local_now = now_utc.astimezone(tz)
        window_start = local_now + timedelta(hours=12)
        window_end = local_now + timedelta(hours=13)

        def _in_window(slot_date, start_time):
            if window_start.date() == window_end.date():
                return slot_date == window_start.date() and window_start.time() <= start_time < window_end.time()
            if slot_date == window_start.date():
                return start_time >= window_start.time()
            if slot_date == window_end.date():
                return start_time < window_end.time()
            return False

        for assignment in entry["assignments"]:
            slot_date = assignment.slot_date or getattr(assignment.slot, "date", None)
            start_time = getattr(assignment.slot, "start_time", None)
            if not slot_date or not start_time:
                continue
            if not _in_window(slot_date, start_time):
                continue

            shift = assignment.shift
            candidate = assignment.user
            slot = assignment.slot
            slot_time = f"{slot_date} {slot.start_time.strftime('%H:%M')}–{slot.end_time.strftime('%H:%M')}"

            async_task(
                'users.tasks.send_async_email',
                subject=f"Reminder: Your upcoming shift at {shift.pharmacy.name}",
                recipient_list=[candidate.email],
                template_name="emails/shift_reminder.html",
                context=build_shift_email_context(
                    shift,
                    user=candidate,
                    role=getattr(candidate, "role", "pharmacist").lower() if hasattr(candidate, "role") else "pharmacist",
                    extra={"slot_time": slot_time}
                ),
                text_template="emails/shift_reminder.txt"
            )
            total_sent += 1

    logger.info(f"[send_shift_reminders] Completed sending reminders. Sent {total_sent} emails.")


# ========== Magic link membership model tasks ==========

def _frontend_base_url() -> str:
    """
    Returns the FE base URL for building absolute links.
    Falls back to localhost:5174 for dev if not set.
    """
    base = getattr(settings, "FRONTEND_BASE_URL", "").rstrip("/")
    return base or "http://localhost:5174"


def _manage_path_for_role(recipient_role: str) -> str:
    """
    Map the recipient's role to the correct dashboard route.
    - Owner & Pharmacy Admin use the Owner dashboard area
    - Org Admin uses the Organization dashboard area
    """
    if recipient_role in ("OWNER", "PHARMACY_ADMIN"):
        return "/dashboard/owner/manage-pharmacies"
    if recipient_role == "ORG_ADMIN":
        return "/dashboard/organization/manage-pharmacies"
    # Fallback to owner area if something unexpected slips through
    return "/dashboard/owner/manage-pharmacies"


def _manage_detail_url_for_role(recipient_role: str, pharmacy_id: int | str) -> str:
    base_path = _manage_path_for_role(recipient_role)
    return f"{base_path}?workspace=internal&pharmacy_id={pharmacy_id}&view=detail&pharmacyId={pharmacy_id}"


@shared_task(name="client_profile.tasks.email_membership_application_submitted", queue="notifications")
def email_membership_application_submitted(app_id: int):
    """
    Notify the pharmacy Owner, Pharmacy Admins, and Organization Admins
    that a new membership application has been submitted.
    Each recipient gets a link tailored to their dashboard area.
    """
    try:
        app = (MembershipApplication.objects
               .select_related("pharmacy", "invite_link")
               .get(id=app_id))
    except MembershipApplication.DoesNotExist:
        logger.warning("Application %s not found", app_id)
        return

    pharmacy = app.pharmacy
    base = _frontend_base_url()

    # Build a mapping of recipient_email -> recipient_role
    # Priority: OWNER > PHARMACY_ADMIN > ORG_ADMIN (if a user happens to have multiple roles)
    recipients_by_role: dict[str, str] = {}

    # Owner
    owner_email = getattr(getattr(pharmacy, "owner", None), "user", None)
    owner_email = getattr(owner_email, "email", None)
    if owner_email:
        recipients_by_role[owner_email] = "OWNER"

    # Pharmacy Admins (dedicated table)
    admin_emails = list(
        PharmacyAdmin.objects
        .filter(pharmacy=pharmacy, is_active=True)
        .select_related("user")
        .values_list("user__email", flat=True)
    )
    for e in admin_emails:
        if not e:
            continue
        # don't downgrade OWNER to PHARMACY_ADMIN
        recipients_by_role.setdefault(e, "PHARMACY_ADMIN")

    # Organization Admins (if pharmacy belongs to an organization)
    if getattr(pharmacy, "organization_id", None):
        org_admin_emails = list(
            OrganizationMembership.objects
            .filter(role="ORG_ADMIN", organization_id=pharmacy.organization_id)
            .select_related("user")
            .values_list("user__email", flat=True)
        )
        for e in org_admin_emails:
            if not e:
                continue
            # don't override OWNER or PHARMACY_ADMIN with ORG_ADMIN
            recipients_by_role.setdefault(e, "ORG_ADMIN")

    if not recipients_by_role:
        logger.info("No recipients for application %s (pharmacy=%s)", app_id, pharmacy.id)
        return

    # Common context for all recipients
    ctx_common = {
        "pharmacy_name": pharmacy.name,
        "applicant_full_name": f"{app.first_name} {app.last_name}".strip(),
        "role": membership_role_label(app.role),
        "category": (
            "Full/Part-time (Pharmacy staff)"
            if app.category == "FULL_PART_TIME"
            else "Favorite (Locum/Shift Hero)"
        ),
        "submitted_at": datefilter(app.submitted_at or timezone.now(), "M d, Y H:i"),
        "mobile_number": app.mobile_number or "",
        "email": app.email or "",
    }

    # Send one email per recipient with a role-correct manage_url
    for email, r_role in recipients_by_role.items():
        manage_url = f"{base}{_manage_detail_url_for_role(r_role, pharmacy.id)}"
        ctx = {**ctx_common, "manage_url": manage_url}
        notification_payload = {
            "title": f"New membership application: {pharmacy.name}",
            "body": f"{ctx_common['applicant_full_name']} applied for {ctx_common['role']}.",
            "action_url": manage_url,
            "payload": {
                "application_id": app.id,
                "pharmacy_id": pharmacy.id,
                "category": app.category,
                "role": app.role,
            },
        }
        user_id = User.objects.filter(email=email).values_list('id', flat=True).first()
        if user_id:
            notification_payload['user_ids'] = [user_id]
        send_async_email(
            subject=f"New membership application — {pharmacy.name}",
            recipient_list=[email],
            template_name="emails/membership_application_submitted.html",
            text_template="emails/membership_application_submitted.txt",
            context=ctx,
            notification=notification_payload,
        )


@shared_task(name="client_profile.tasks.email_membership_application_review_updated", queue="notifications")
def email_membership_application_review_updated(app_id: int, changes: list[dict] | None = None):
    """Notify an applicant immediately when the pharmacy edits reviewable application fields."""
    try:
        app = (
            MembershipApplication.objects
            .select_related("pharmacy", "submitted_by")
            .get(id=app_id)
        )
    except MembershipApplication.DoesNotExist:
        logger.warning("Application %s not found", app_id)
        return

    if not app.email or app.status != "PENDING":
        return

    field_labels = {
        "role": "Role",
        "first_name": "First name",
        "last_name": "Last name",
        "job_title": "Job title",
        "pharmacist_award_level": "Pharmacist Award classification",
        "otherstaff_classification_level": "Classification level",
        "intern_half": "Intern training half",
        "student_year": "Student year",
    }
    normalized_changes = []
    for change in changes or []:
        field_name = str(change.get("field") or "")
        if not field_name:
            continue
        normalized_changes.append({
            "field": field_name,
            "label": field_labels.get(field_name, field_name.replace("_", " ").title()),
            "from": change.get("from"),
            "to": change.get("to"),
        })
    if not normalized_changes:
        return

    applicant_user = getattr(app, "submitted_by", None) or User.objects.filter(
        email__iexact=app.email
    ).first()
    dashboard_url = get_frontend_dashboard_url(applicant_user).rstrip("/")
    membership_url = f"{dashboard_url}/memberships"
    pharmacy = app.pharmacy
    labels = [item["label"] for item in normalized_changes]

    ctx = {
        "pharmacy_name": pharmacy.name,
        "applicant_full_name": f"{app.first_name} {app.last_name}".strip(),
        "changes": normalized_changes,
        "membership_url": membership_url,
    }
    notification = {
        "title": f"Application updated: {pharmacy.name}",
        "body": "The pharmacy reviewed and updated: " + ", ".join(labels) + ".",
        "action_url": membership_url,
        "payload": {
            "application_id": app.id,
            "status": app.status,
            "review_changes": normalized_changes,
        },
    }
    if applicant_user:
        notification["user_ids"] = [applicant_user.id]

    send_async_email(
        subject=f"{pharmacy.name} updated your membership application",
        recipient_list=[app.email],
        template_name="emails/membership_application_review_updated.html",
        text_template="emails/membership_application_review_updated.txt",
        context=ctx,
        notification=notification,
    )


@shared_task(name="client_profile.tasks.email_membership_application_approved", queue="notifications")
def email_membership_application_approved(app_id: int):
    """Notify the applicant with the final accepted membership and terms."""
    try:
        app = (
            MembershipApplication.objects
            .select_related("pharmacy", "submitted_by", "approved_membership")
            .get(id=app_id)
        )
    except MembershipApplication.DoesNotExist:
        logger.warning("Application %s not found", app_id)
        return

    if not app.email:
        logger.info("Application %s has no email; skipping applicant notification.", app_id)
        return

    pharmacy = app.pharmacy
    applicant_user = getattr(app, "submitted_by", None) or User.objects.filter(
        email__iexact=app.email
    ).first()
    dashboard_url = get_frontend_dashboard_url(applicant_user).rstrip("/")
    membership_url = f"{dashboard_url}/memberships"

    field_labels = {
        "role": "Role",
        "first_name": "First name",
        "last_name": "Last name",
        "job_title": "Job title",
        "pharmacist_award_level": "Pharmacist Award classification",
        "otherstaff_classification_level": "Classification level",
        "intern_half": "Intern training half",
        "student_year": "Student year",
    }
    review_changes = []
    for change in app.review_changes or []:
        field_name = str(change.get("field") or "")
        review_changes.append({
            "field": field_name,
            "label": field_labels.get(field_name, field_name.replace("_", " ").title()),
            "from": change.get("from"),
            "to": change.get("to"),
        })

    employment_terms = None
    if pharmacy.use_chemisttasker_payroll and app.approved_membership_id:
        try:
            from workforce.models import EmploymentEngagement
            engagement = (
                EmploymentEngagement.objects
                .filter(membership_id=app.approved_membership_id)
                .order_by("-effective_from", "-id")
                .first()
            )
        except Exception:
            logger.exception("Unable to load employment terms for approved application %s", app_id)
            engagement = None

        if engagement:
            employment_terms = {
                "effective_from": str(engagement.effective_from),
                "effective_to": str(engagement.effective_to) if engagement.effective_to else None,
                "employment_type": engagement.get_employment_type_display()
                    if hasattr(engagement, "get_employment_type_display") else engagement.employment_type,
                "job_title": engagement.job_title or "",
                "pay_basis": engagement.get_pay_basis_display(),
                "award_classification": str(engagement.award_classification or "").replace("_", " ").title(),
                "rate_weekday": str(engagement.rate_weekday),
                "rate_saturday": str(engagement.rate_saturday),
                "rate_sunday": str(engagement.rate_sunday),
                "rate_public_holiday": str(engagement.rate_public_holiday),
                "rate_early_morning": (
                    str(engagement.rate_early_morning)
                    if engagement.rate_early_morning is not None else None
                ),
                "rate_late_night": (
                    str(engagement.rate_late_night)
                    if engagement.rate_late_night is not None else None
                ),
                "correspondence_label": (
                    (engagement.award_rate_snapshot or {})
                    .get("correspondence", {})
                    .get("label", "")
                ),
            }

    ctx = {
        "pharmacy_name": pharmacy.name,
        "applicant_full_name": f"{app.first_name} {app.last_name}".strip(),
        "role": membership_role_label(app.role),
        "category": (
            "Pharmacy staff"
            if app.category == "FULL_PART_TIME"
            else "Favourite (Locum / Shift Hero)"
        ),
        "membership_url": membership_url,
        "review_changes": review_changes,
        "has_review_changes": bool(review_changes),
        "employment_terms": employment_terms,
        "payroll_enabled": bool(pharmacy.use_chemisttasker_payroll),
    }

    changed_labels = [item["label"] for item in review_changes]
    notification_body = f"Your application with {pharmacy.name} has been approved."
    if changed_labels:
        notification_body += " The pharmacy updated: " + ", ".join(changed_labels) + "."

    notification_payload = {
        "title": f"Application approved: {pharmacy.name}",
        "body": notification_body,
        "action_url": membership_url,
        "payload": {
            "application_id": app.id,
            "membership_id": app.approved_membership_id,
            "review_changes": review_changes,
            "payroll_enabled": bool(pharmacy.use_chemisttasker_payroll),
            "has_employment_terms": bool(employment_terms),
        },
    }
    user_ids = []
    if getattr(app, "submitted_by_id", None):
        user_ids.append(app.submitted_by_id)
    else:
        existing_id = User.objects.filter(email__iexact=app.email).values_list("id", flat=True).first()
        if existing_id:
            user_ids.append(existing_id)
    if user_ids:
        notification_payload["user_ids"] = user_ids

    send_async_email(
        subject=f"Your application to {pharmacy.name} was approved",
        recipient_list=[app.email],
        template_name="emails/membership_application_approved.html",
        text_template="emails/membership_application_approved.txt",
        context=ctx,
        notification=notification_payload,
    )


@shared_task(name="client_profile.tasks.email_membership_application_rejected", queue="notifications")
def email_membership_application_rejected(app_id: int):
    """Notify the applicant when a pharmacy declines a membership application."""
    try:
        app = MembershipApplication.objects.select_related("pharmacy", "submitted_by").get(id=app_id)
    except MembershipApplication.DoesNotExist:
        logger.warning("Application %s not found", app_id)
        return

    if not app.email:
        logger.info("Application %s has no email; skipping rejection notification.", app_id)
        return

    pharmacy = app.pharmacy
    applicant_user = getattr(app, "submitted_by", None) or User.objects.filter(
        email__iexact=app.email
    ).first()
    dashboard_url = get_frontend_dashboard_url(applicant_user).rstrip("/")
    membership_url = f"{dashboard_url}/memberships"

    ctx = {
        "pharmacy_name": pharmacy.name,
        "applicant_full_name": f"{app.first_name} {app.last_name}".strip(),
        "role": membership_role_label(app.role),
        "category": (
            "Pharmacy staff"
            if app.category == "FULL_PART_TIME"
            else "Favourite (Locum / Shift Hero)"
        ),
        "membership_url": membership_url,
    }

    notification_payload = {
        "title": f"Application update: {pharmacy.name}",
        "body": f"Your membership application with {pharmacy.name} was not approved.",
        "action_url": membership_url,
        "payload": {"application_id": app.id, "status": "REJECTED"},
    }
    if applicant_user:
        notification_payload["user_ids"] = [applicant_user.id]

    send_async_email(
        subject=f"Update on your application to {pharmacy.name}",
        recipient_list=[app.email],
        template_name="emails/membership_application_rejected.html",
        text_template="emails/membership_application_rejected.txt",
        context=ctx,
        notification=notification_payload,
    )
