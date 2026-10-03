from datetime import datetime
from django.conf import settings
from django.utils import timezone
from celery import shared_task
from core.integrations.abr import _parse_abn_html_fields, abn_lookup  # noqa: F401  (historical public import path)
from users.tasks import send_async_email
from memberships.models import MembershipApplication, Membership
from organizations.models import Pharmacy, PharmacyAdmin
from onboarding.tasks import (  # noqa: F401  (deployed task objects)
    final_evaluation,
    run_all_verifications,
    run_referee_reminder,
    verify_abn_task,
    verify_ahpra_task,
    verify_filefield_task,
)
from shifts.tasks import send_shift_reminders  # noqa: F401  (deployed task object)
from onboarding.verification.reminders import (  # noqa: F401  (historical public import path)
    cancel_all_referee_reminders,
    cancel_referee_reminder,
    schedule_referee_reminder,
)
from users.navigation import get_frontend_dashboard_url
from memberships.labels import membership_role_label
import logging
import re
from django.contrib.auth import get_user_model
from django.template.defaultfilters import date as datefilter
from users.models import OrganizationMembership


logger = logging.getLogger(__name__)

User = get_user_model()


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
