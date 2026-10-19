"""Celery entry points of onboarding verification.

Every task keeps its deployed name (`client_profile.tasks.*`), queue and signature: workers, beat, routes and queued
messages address tasks by these names. `client_profile.tasks` re-exports these objects; it does not register them
again.
"""
import datetime
import logging
import os
import tempfile
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlencode

import dateutil.parser
from celery import shared_task
from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.signing import TimestampSigner
from django.db import transaction
from django.utils import timezone

from core.integrations.abr import _parse_abn_html_fields, abn_lookup
from core.task_queue import async_task
from onboarding.emails import get_candidate_role, simple_name_match
from onboarding.services.work_profile import referee_profile_target
from onboarding.verification.ahpra import (
    _update_ahpra_fields,
    ahpra_lookup,
    evaluate_ahpra_record,
    parse_ahpra_html,
)
from onboarding.verification.ahpra_numbers import full_registration_number
from onboarding.verification.documents import azure_ocr, get_local_file_or_download, ocr_input_path_for_file
from onboarding.verification.orchestration import mark_notification_sent, notification_already_sent
from onboarding.verification.reminders import (
    _final_evaluation_reminder_key,
    _marker_delete,
    _marker_get,
    _marker_set,
    _referee_reminder_key,
    cancel_referee_reminder,
    schedule_referee_reminder,
)
from onboarding.verification.support import fetch_instance_with_retries
from users.normalization import sanitize_email_text as clean_email

logger = logging.getLogger(__name__)


def _document_name_check(file_obj, first_name, last_name):
    """OCR the uploaded document and look for the person's name: (verified, note shown to the user on failure)."""
    is_verified = False
    failure_note = ""

    if not file_obj:
        failure_note = "No file uploaded for this verification."
        logger.info(f"[verify_filefield_task] {failure_note} Setting as not verified.")
    else:
        local_path = get_local_file_or_download(file_obj)
        if not local_path or not os.path.exists(local_path):
            # the note is shown to the user: never a server path
            failure_note = "Could not obtain the uploaded file for OCR."
            logger.info(f"[verify_filefield_task] {failure_note}")
        else:
            converted_path = None
            try:
                ocr_path, converted_path = ocr_input_path_for_file(local_path)
                logger.info("[verify_filefield_task] Sending the document to Azure OCR")
                ocr_data = azure_ocr(ocr_path)
                lines = ocr_data.get("lines", [])
                text = " ".join(lines)
                is_name_match = simple_name_match(text, first_name, last_name)

                if is_name_match:
                    is_verified = True
                    logger.info("[verify_filefield_task] Name match result: %s", is_name_match)
                else:
                    failure_note = f"Name mismatch found in your uploaded document"
                    logger.info(f"[verify_filefield_task] {failure_note}")

            except Exception as exc:
                # Keep traceback frames for operators without re-logging a possibly sensitive service exception value.
                failure_note = "OCR processing failed."
                logger.warning("[verify_filefield_task] OCR processing failed error_type=%s", type(exc).__name__, exc_info=(RuntimeError, RuntimeError(f"{type(exc).__name__} (details redacted)"), exc.__traceback__))
            finally:
                if converted_path and os.path.exists(converted_path):
                    os.remove(converted_path)
                if local_path and os.path.exists(local_path) and Path(local_path).parent == Path(tempfile.gettempdir()):
                    os.remove(local_path)
    return is_verified, failure_note


@shared_task(name="onboarding.tasks.verify_skill_certificate_task", queue="ocr")
def verify_skill_certificate_task(model_name, object_pk, skill_code, path):
    """Name-match one skill certificate and record the result on that skill's entry, unless it was replaced since."""
    Model = apps.get_model("client_profile", model_name)
    obj = fetch_instance_with_retries(Model, object_pk)
    is_verified, note = _document_name_check(SimpleNamespace(name=path), obj.user.first_name or "", obj.user.last_name or "")
    with transaction.atomic():
        row = Model.objects.select_for_update().get(pk=object_pk)
        certificates = dict(row.skill_certificates or {})
        meta = certificates.get(skill_code)
        if not isinstance(meta, dict) or meta.get("path") != path:
            return
        certificates[skill_code] = {**meta, "verified": is_verified, "note": note[:255]}
        row.skill_certificates = certificates
        row.save(update_fields=["skill_certificates"])


@shared_task(name="client_profile.tasks.verify_filefield_task", queue="ocr")
def verify_filefield_task(
    model_name,
    object_pk,
    file_field,
    first_name=None,
    last_name=None,
    email=None,
    verification_field=None,
    **kwargs
):
    logger.info(f"[VERIFY FILEFIELD TASK] model={model_name}, pk={object_pk}, field={file_field}")
    note_field = kwargs.get('note_field')
    Model = apps.get_model("client_profile", model_name)
    obj = fetch_instance_with_retries(Model, object_pk)
    first_name = first_name or getattr(obj.user, "first_name", "") or ""
    last_name  = last_name  or getattr(obj.user, "last_name", "")  or ""
    email      = email      or getattr(obj.user, "email", "")      or ""

    # If a verification note already exists, the task has already run.
    if note_field and getattr(obj, note_field, None):
        logger.info(f"[FILEFIELD TASK] SKIPPING: Verification for pk={object_pk}, field={file_field} already has a result.")
        return # Exit immediately

    # Reset fields before running
    setattr(obj, verification_field, False)
    if note_field and hasattr(obj, note_field):
        setattr(obj, note_field, "")
        obj.save(update_fields=[verification_field, note_field])
    else:
        obj.save(update_fields=[verification_field])

    is_verified, failure_note = _document_name_check(getattr(obj, file_field), first_name, last_name)

    setattr(obj, verification_field, is_verified)
    if note_field and hasattr(obj, note_field):
        setattr(obj, note_field, failure_note[:255])
    obj.save(update_fields=[verification_field] + ([note_field] if note_field and hasattr(obj, note_field) else []))


def _fetch_instance_for_update(model, pk):
    return model.objects.select_for_update().get(pk=pk)


@shared_task(name="client_profile.tasks.verify_abn_task", queue="ocr")
def verify_abn_task(model_name, object_pk, abn_number, first_name, last_name, email, **kwargs):
    """
    Scrape ABR page and populate ABR fields. DOES NOT set abn_verified=True –
    that only happens when the user confirms in the UI.
    """
    note_field = kwargs.get('note_field')
    logger.info("[VERIFY ABN TASK] model=%s pk=%s", model_name, object_pk)

    Model = apps.get_model("client_profile", model_name)
    obj = fetch_instance_with_retries(Model, object_pk)

    expected_abn = (abn_number or "").strip()
    current_abn = (getattr(obj, "abn", "") or "").strip()
    if current_abn != expected_abn:
        logger.info(
            "[VERIFY ABN TASK] stale task skipped before lookup model=%s pk=%s",
            model_name,
            object_pk,
        )
        return

    # mark as not-verified every run (user confirmation will flip it)
    obj.abn_verified = False
    if note_field and hasattr(obj, note_field):
        setattr(obj, note_field, "")
        obj.save(update_fields=["abn_verified", note_field])
    else:
        obj.save(update_fields=["abn_verified"])

    legal_name, html = abn_lookup(abn_number)

    # Re-read under a row lock for the final write. The provider request stays
    # outside the transaction, but once this lock is acquired an ABN edit
    # cannot slip between the stale-result check and the save.
    with transaction.atomic():
        obj = _fetch_instance_for_update(Model, object_pk)
        if (getattr(obj, "abn", "") or "").strip() != expected_abn:
            logger.info(
                "[VERIFY ABN TASK] stale task result discarded model=%s pk=%s",
                model_name,
                object_pk,
            )
            return

        parsed = _parse_abn_html_fields(html or "")
        entity_name = parsed.get("entity_name") or legal_name or ""
        if not entity_name:
            # A failed lookup must not relabel or partially overwrite the previous ABN snapshot.
            obj.abn_verified = False
            updates = ["abn_verified"]
            if note_field and hasattr(obj, note_field):
                setattr(
                    obj,
                    note_field,
                    "Failed to fetch ABN details. ABN may be invalid or ABR site unavailable.",
                )
                updates.append(note_field)
            obj.save(update_fields=list({field for field in updates if hasattr(obj, field)}))
            return

        obj.abn_entity_name = entity_name
        obj.abn_entity_type = parsed.get("entity_type") or ""
        obj.abn_status = parsed.get("abn_status") or ""
        obj.abn_gst_registered = parsed.get("abn_gst_registered")
        obj.abn_gst_from = parsed.get("abn_gst_from")
        obj.abn_gst_to = parsed.get("abn_gst_to")
        obj.abn_last_checked = timezone.now()
        obj.abn_details_for = expected_abn
        if obj.abn_entity_confirmed:
            obj.abn_verified = True

        note = "ABN details fetched from ABR. Review the details below and confirm in the UI if they belong to you."
        updates = [
            "abn_entity_name",
            "abn_entity_type",
            "abn_status",
            "abn_gst_registered",
            "abn_gst_from",
            "abn_gst_to",
            "abn_last_checked",
            "abn_details_for",
            "abn_verified",
        ]
        if note_field and hasattr(obj, note_field):
            setattr(obj, note_field, note[:255])
            updates.append(note_field)
        obj.save(update_fields=list({field for field in updates if hasattr(obj, field)}))


def _resolve_ahpra_role(obj, model_name="", role_override=None) -> str:
    if role_override:
        return str(role_override).strip().lower()
    if hasattr(obj, "role_type") and obj.role_type:
        return str(obj.role_type).strip().lower()
    if hasattr(obj, "role") and obj.role:
        return str(obj.role).strip().lower()
    m = (model_name or (obj._meta.model_name if hasattr(obj, "_meta") else "")).lower()
    if "pharmacist" in m:
        return "pharmacist"
    if hasattr(obj, "user") and getattr(obj.user, "role", None):
        return str(obj.user.role).strip().lower()
    return ""


def _has_successful_lookup(obj) -> bool:
    # Not ahpra_registration_status: a number change clears verified and the note but keeps the old number's status.
    if getattr(obj, "ahpra_verified", False):
        return True
    note = getattr(obj, "ahpra_verification_note", "") or ""
    if note and (note.startswith("Needs review:") or note.startswith("Rejected:")):
        return True
    return False


@shared_task(name="client_profile.tasks.verify_ahpra_task", queue="ocr")
def verify_ahpra_task(model_name, object_pk, ahpra_number, first_name, last_name, email, **kwargs):
    logger.info("[AHPRA TASK] Starting AHPRA lookup model=%s pk=%s", model_name, object_pk)

    Model = apps.get_model("client_profile", model_name)
    obj = fetch_instance_with_retries(Model, object_pk)

    # 1. Students: register is confidential; verified through education provider
    role = _resolve_ahpra_role(obj, model_name=model_name, role_override=kwargs.get("role"))
    if "student" in role:
        logger.info("[AHPRA TASK] Student role pk=%s: register lookup not applicable", object_pk)
        note = "Students are verified through their education provider."
        _update_ahpra_fields(model_name, object_pk, False, note)
        return

    # 2. Number format: validate full registration number
    full_ahpra_number = full_registration_number(ahpra_number)
    if not full_ahpra_number:
        logger.info("[AHPRA TASK] Invalid AHPRA registration number format pk=%s", object_pk)
        note = "Invalid AHPRA registration number format."
        _update_ahpra_fields(model_name, object_pk, False, note)
        return

    # 3. Skip only when a SUCCESSFUL lookup result is already stored for this same number
    stored_number = (getattr(obj, "ahpra_number", None) or "").strip().lower()
    incoming_number = (ahpra_number or "").strip().lower()
    if stored_number == incoming_number and _has_successful_lookup(obj):
        logger.info("[AHPRA TASK] SKIPPING: verification for pk=%s already has a result for this number.", object_pk)
        return

    if settings.AHPRA_SOURCE == 'desktop':
        from onboarding.verification.desktop import enqueue_check
        enqueue_check(obj, full_ahpra_number, 'onboarding')
        return

    # Clear old results before starting (new number or retry of failed attempt)
    obj.ahpra_verified = False
    obj.ahpra_verification_note = ""
    clear_fields = ["ahpra_verified", "ahpra_verification_note"]
    if hasattr(obj, "ahpra_registration_status"):
        obj.ahpra_registration_status = None
        clear_fields.append("ahpra_registration_status")
    obj.save(update_fields=clear_fields)

    handle, output_html = tempfile.mkstemp(prefix="ahpra_", suffix=".html")
    os.close(handle)
    try:
        try:
            ahpra_lookup(full_ahpra_number, output_html, api_key=settings.SCRAPINGBEE_API_KEY)
        except Exception as exc:
            logger.error("[verify_ahpra_task] AHPRA lookup failed for pk=%s error_type=%s", object_pk, type(exc).__name__, exc_info=(RuntimeError, RuntimeError(f"{type(exc).__name__} (details redacted)"), exc.__traceback__))
            _update_ahpra_fields(model_name, object_pk, False, "AHPRA lookup failed. Please try again later.")
            return

        ahpra_data = parse_ahpra_html(output_html)
    finally:
        if os.path.exists(output_html):
            os.remove(output_html)

    logger.info(
        "[verify_ahpra_task] Parsed register page pk=%s type=%s status=%s has_expiry=%s", object_pk,
        ahpra_data.get("registration_type"), ahpra_data.get("registration_status"), bool(ahpra_data.get("expiry_date")),
    )

    if not all((ahpra_data.get(field) or '').strip() for field in ('practitioner_name', 'registration_status')):
        _update_ahpra_fields(model_name, object_pk, False, "AHPRA lookup failed. Please try again later.")
        return

    outcome, eval_note = evaluate_ahpra_record(
        ahpra_data,
        first_name=first_name,
        last_name=last_name,
        role=role,
    )
    logger.info("[verify_ahpra_task] Evaluation outcome: %s pk=%s", outcome, object_pk)

    if outcome == "verified":
        is_verified = True
        final_note = eval_note
    elif outcome == "review":
        is_verified = False
        final_note = f"Needs review: {eval_note}"
    elif outcome == "rejected":
        is_verified = False
        final_note = f"Rejected: {eval_note}"
    else:
        is_verified = False
        final_note = f"Needs review: {eval_note}"

    registration_type = (ahpra_data.get("registration_type") or "").strip()
    registration_status = (ahpra_data.get("registration_status") or "").strip()
    expiry_date_val = ahpra_data.get("expiry_date")
    expiry_date = None
    if isinstance(expiry_date_val, datetime.date):
        expiry_date = expiry_date_val
    elif isinstance(expiry_date_val, str) and expiry_date_val.strip():
        try:
            expiry_date = dateutil.parser.parse(expiry_date_val.strip(), dayfirst=True).date()
        except Exception:
            pass

    _update_ahpra_fields(
        model_name, object_pk, is_verified, final_note,
        reg_type=registration_type, reg_status=registration_status, expiry_date=expiry_date
    )


@shared_task
def alert_overdue_ahpra_checks():
    if settings.AHPRA_SOURCE != 'desktop' or not settings.ADMINS:
        return
    from django.core.mail import mail_admins
    from django.db.models import Q
    from onboarding.models import AhpraCheck
    from onboarding.verification.desktop import PROFILE_MODELS, admin_review_url
    with transaction.atomic():
        now = timezone.now()
        checks = AhpraCheck.objects.select_for_update().filter(
            Q(status__in=['pending', 'sent'], created_at__lte=now - datetime.timedelta(minutes=15))
            | Q(needs_attention=True, repair_reported_at__isnull=True,
                completed_at__lte=now - datetime.timedelta(minutes=45)),
            alerted_at__isnull=True, model_name__in=PROFILE_MODELS,
        )
        for check in checks:
            detail = 'has no repair report; please review.' if check.needs_attention else 'awaits the desktop verifier or admin review.'
            mail_admins('AHPRA check overdue', f'Check {check.pk} ({check.registration_number}) {detail}\nAdmin review: {admin_review_url(check)}')
            check.alerted_at = timezone.now()
            check.save(update_fields=['alerted_at'])


@shared_task(name="client_profile.tasks.run_referee_reminder", queue="notifications")
def run_referee_reminder(model_name: str, pk: int, ref_idx: int) -> None:
    """
    Runs for ONE referee (ref_idx). If that referee is confirmed/rejected now,
    cancel and stop. Otherwise send reminder to that referee only
    and re-schedule only that referee.
    """
    key = _referee_reminder_key(model_name, pk, ref_idx)
    if not _marker_get(key):
        return

    # The reminder's marker stays on the profile it was scheduled for; the referee and the new link follow the person.
    scheduled_model, scheduled_pk = model_name, pk
    model_name, pk = referee_profile_target(model_name, pk)
    Model = apps.get_model('client_profile', model_name)
    try:
        obj = Model.objects.get(pk=pk)
    except Model.DoesNotExist:
        # the profile was deleted after this ETA reminder was queued: nothing left to remind about
        cancel_referee_reminder(scheduled_model, scheduled_pk, ref_idx)
        logger.info("[referee-reminder] Profile gone; reminder dropped model=%s pk=%s ref_idx=%s", model_name, pk, ref_idx)
        return

    confirmed = bool(getattr(obj, f'referee{ref_idx}_confirmed', False))
    rejected = bool(getattr(obj, f'referee{ref_idx}_rejected', False))
    if confirmed or rejected:
        cancel_referee_reminder(scheduled_model, scheduled_pk, ref_idx)
        return

    # Build the single-ref reminder email
    email_raw = getattr(obj, f'referee{ref_idx}_email', None)
    name = getattr(obj, f'referee{ref_idx}_name', '')
    relation = getattr(obj, f'referee{ref_idx}_relation', '')
    workplace = getattr(obj, f'referee{ref_idx}_workplace', '')
    email = clean_email(email_raw)
    if not email:
        cancel_referee_reminder(scheduled_model, scheduled_pk, ref_idx)
        return

    signer = TimestampSigner()
    token = signer.sign(f"{model_name}:{pk}:{ref_idx}")

    query = urlencode({
        "candidate_name": obj.user.get_full_name(),
        "position_applied_for": get_candidate_role(obj),
    })
    confirm_url = f"{settings.FRONTEND_BASE_URL}/referee/questionnaire/{token}?{query}"
    reject_url = f"{settings.FRONTEND_BASE_URL}/onboarding/referee-reject/{token}"

    async_task(
        'users.tasks.send_async_email',
        subject=f"Gentle Reminder: Reference Request for {obj.user.get_full_name()}",
        recipient_list=[email],
        template_name="emails/referee_reminder.html",
        text_template="emails/referee_reminder.txt",
        context={
            "referee_name": name,
            "referee_relation": relation,
            "referee_workplace": workplace,
            "candidate_name": obj.user.get_full_name(),
            "candidate_first_name": obj.user.first_name,
            "candidate_last_name": obj.user.last_name,
            "confirm_url": confirm_url,
            "reject_url": reject_url,
            # (optional if your template wants to render it)
            "position_applied_for": get_candidate_role(obj),
        },
    )

    # Re-schedule this referee only
    _marker_delete(key)
    schedule_referee_reminder(scheduled_model, scheduled_pk, ref_idx)


@shared_task(name="client_profile.tasks.run_all_verifications", queue="default")
def run_all_verifications(model_name, object_pk, is_create=False):
    """
    Notify the admins once, dispatch the automated verifications for the profile type, send the initial referee
    requests, and schedule final_evaluation. AHPRA is verified manually, not here.
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
        # AHPRA is verified manually (no automated scraping).
        if obj.payment_preference == "ABN" and obj.abn:
            async_task('client_profile.tasks.verify_abn_task', model_name, object_pk, obj.abn, user.first_name, user.last_name, user.email, note_field='abn_verification_note')
        if obj.government_id:
            async_task('client_profile.tasks.verify_filefield_task', model_name, object_pk, 'government_id', user.first_name, user.last_name, user.email, 'gov_id_verified', note_field='gov_id_verification_note')

    elif model_name_lower == 'owneronboarding':
        # AHPRA is verified manually (no automated scraping).
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


@shared_task(name="client_profile.tasks.final_evaluation", queue="default")
def final_evaluation(model_name, object_pk, retry_count=0, is_reminder=False):
    """
    Evaluate the profile's verification state: failed or verified are final (notify once, cancel reminders);
    otherwise keep one 48-hour future evaluation and, while automated checks run, a bounded 20-second re-check.
    """
    from django.apps import apps
    from django.utils import timezone
    from datetime import timedelta
    from onboarding.emails import send_referee_emails
    from users.navigation import get_frontend_dashboard_url
    from django.contrib.contenttypes.models import ContentType
    from core.task_queue import async_task

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

    # Required checks come from the verification policy; optional evidence (ID, documents) never fails a profile.
    # Extras covered by the tightening grace period do not count yet: the same decision as the onboarding screens.
    from onboarding.verification.policy import evaluate, requirements
    if model_name.lower() != 'owneronboarding':
        grace = evaluate(obj)['grace']
        required = {check: met for check, met in requirements(obj).items() if check not in grace}
    else:
        required = {'ahpra': bool(obj.ahpra_verified)} if getattr(obj, 'role', None) == "PHARMACIST" else {}
    required_checks = [check for check in ('ahpra', 'gov_id') if check in required]

    # Evaluate checks
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
    # Email and mobile are confirmed interactively; until then the profile simply waits.
    if any(not required.get(check, True) for check in ('email', 'mobile', 'role')):
        is_pending_check = True

    # Referee requirements (only when the owner has tightened the policy)
    is_pending_referee = False
    if 'referees' in required:
        for idx in [1, 2]:
            if getattr(obj, f"referee{idx}_rejected", False):
                has_failed_check = True
                failure_reasons.append(f"Referee {idx} has declined the request.")
            elif not getattr(obj, f"referee{idx}_confirmed", False):
                is_pending_referee = True

    # Failed state
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

    REMINDER_DELAY = timedelta(hours=48)
    # Quick re-check loop for automated checks that are still running. It is bounded: a run re-checks while
    # retry_count <= MAX_QUICK_RECHECK_COUNT; past that only this loop stops. The profile is still pending, so no
    # reminder is cancelled, and a 48-hour reminder run starts a new bounded loop.
    RECHECK_DELAY = timedelta(seconds=20)
    MAX_QUICK_RECHECK_COUNT = 15

    def ensure_future_evaluation():
        if _has_future_reminder(model_name, object_pk):
            return False
        key = _final_evaluation_reminder_key(model_name, object_pk)
        _marker_set(key, timeout=int(REMINDER_DELAY.total_seconds()) + 3600)
        try:
            final_evaluation.apply_async(
                args=(model_name, object_pk),
                kwargs={'is_reminder': True},
                eta=timezone.now() + REMINDER_DELAY,
                queue="default",
            )
        except Exception:
            # the marker means "a future evaluation is queued"; without the task it would block later scheduling
            _marker_delete(key)
            logger.exception(
                "[FINAL EVALUATION] 48-hour evaluation enqueue failed; marker removed model=%s pk=%s",
                model_name, object_pk,
            )
            raise
        return True

    def schedule_quick_recheck():
        if retry_count > MAX_QUICK_RECHECK_COUNT:
            future_scheduled = ensure_future_evaluation()
            logger.warning(
                "[FINAL EVALUATION] Checks still pending after %s quick re-checks; quick loop stopped model=%s pk=%s "
                "future_evaluation=%s",
                retry_count, model_name, object_pk,
                "scheduled" if future_scheduled else "already-queued",
            )
            return
        final_evaluation.apply_async(
            args=(model_name, object_pk),
            kwargs={'retry_count': retry_count + 1},
            eta=timezone.now() + RECHECK_DELAY,
            queue="default",
        )

    if is_pending_referee:
        logger.info(f"[FINAL EVALUATION] pk={object_pk} is waiting for referee confirmation.")
        obj.verified = False
        obj.save(update_fields=['verified'])

        # If this run was triggered by the scheduled reminder, send reminder emails now
        if is_reminder:
            logger.info(f"[FINAL EVALUATION] Sending referee reminder emails for pk={object_pk}.")
            send_referee_emails(obj, is_reminder=True)

        # IMPORTANT: Do NOT cancel here; only cancel in final states.
        # Ensure exactly ONE future evaluation exists. When a referee is still pending, that future run also sends
        # the referee reminder; for manual-only pending checks it is simply the low-frequency evaluation wake-up.
        if ensure_future_evaluation():
            logger.info(f"[FINAL EVALUATION] Scheduled next referee check for pk={object_pk} at {(timezone.now() + REMINDER_DELAY).isoformat()}.")
        else:
            logger.info(f"[FINAL EVALUATION] Future evaluation already exists for pk={object_pk}; leaving it in place.")

        # If other automated checks are also pending, keep the quick re-check loop alive (bounded)
        if is_pending_check:
            schedule_quick_recheck()
        return

    # Automated checks still pending (no referee pending) -> keep quick loop
    if is_pending_check:
        logger.info(f"[FINAL EVALUATION] pk={object_pk} is waiting for automated tasks. Re-checking in 20s.")
        schedule_quick_recheck()
        return

    # Success state
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
