"""Celery entry points of onboarding verification.

Every task keeps its deployed name (`client_profile.tasks.*`), queue and signature: workers, beat, routes and queued
messages address tasks by these names. `client_profile.tasks` re-exports these objects; it does not register them
again.
"""
import logging
import os
import tempfile
from pathlib import Path
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
from onboarding.verification.ahpra import _update_ahpra_fields, ahpra_lookup, parse_ahpra_html
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

    file_obj = getattr(obj, file_field)
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
                logger.info("[verify_filefield_task] Sending the document to Azure OCR pk=%s field=%s", object_pk, file_field)
                ocr_data = azure_ocr(ocr_path)
                lines = ocr_data.get("lines", [])
                text = " ".join(lines)
                is_name_match = simple_name_match(text, first_name, last_name)

                if is_name_match:
                    is_verified = True
                    logger.info("[verify_filefield_task] Name match result: %s pk=%s field=%s", is_name_match, object_pk, file_field)
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

        obj.abn_entity_name  = parsed.get("entity_name") or legal_name or ""
        obj.abn_entity_type  = parsed.get("entity_type") or ""
        obj.abn_status       = parsed.get("abn_status") or ""
        if "abn_gst_registered" in parsed:
            obj.abn_gst_registered = parsed["abn_gst_registered"]
        if "abn_gst_from" in parsed:
            obj.abn_gst_from = parsed["abn_gst_from"]
        if "abn_gst_to" in parsed:
            obj.abn_gst_to = parsed["abn_gst_to"]
        obj.abn_last_checked = timezone.now()
        if obj.abn_entity_confirmed:
            obj.abn_verified = True

        # note is informational only; final verification depends on user confirmation in the UI
        if not legal_name:
            note = "Failed to fetch ABN details. ABN may be invalid or ABR site unavailable."
        else:
            note = "ABN details fetched from ABR. Review the details below and confirm in the UI if they belong to you."
        updates = ["abn_entity_name","abn_entity_type","abn_status","abn_gst_registered","abn_gst_from","abn_gst_to","abn_last_checked", "abn_verified"]
        if note_field and hasattr(obj, note_field):
            setattr(obj, note_field, note[:255]); updates.append(note_field)
        obj.save(update_fields=list({f for f in updates if hasattr(obj, f)}))


@shared_task(name="client_profile.tasks.verify_ahpra_task", queue="ocr")
def verify_ahpra_task(model_name, object_pk, ahpra_number, first_name, last_name, email, **kwargs):
    full_ahpra_number = f"PHA000{ahpra_number}"
    logger.info("[AHPRA TASK] Starting AHPRA lookup model=%s pk=%s", model_name, object_pk)

    Model = apps.get_model("client_profile", model_name)
    obj = fetch_instance_with_retries(Model, object_pk)

    # This logic correctly compares the incoming numeric-only `ahpra_number` 
    # with the numeric-only number stored on the object, so it doesn't need to change.
    if (obj.ahpra_number or '').strip().lower() == ahpra_number.strip().lower() and obj.ahpra_verification_note:
        logger.info("[AHPRA TASK] SKIPPING: verification for pk=%s already has a result for this number.", object_pk)
        return # Exit immediately

    # If we are here, it means it's a new AHPRA number or the first attempt.
    # We must clear the old result before starting.
    obj.ahpra_verified = False
    obj.ahpra_verification_note = ""
    obj.save(update_fields=['ahpra_verified', 'ahpra_verification_note'])

    # The provider page is only needed between the fetch and the parse: a temporary file, removed in every case.
    handle, output_html = tempfile.mkstemp(prefix="ahpra_", suffix=".html")
    os.close(handle)
    try:
        try:
            # Use the newly constructed full AHPRA number for the lookup
            ahpra_lookup(full_ahpra_number, output_html, api_key=settings.SCRAPINGBEE_API_KEY)
        except Exception as exc:
            # Keep traceback frames and the exception type, but redact the value because it can contain the service URL/key.
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

    practitioner_name = ahpra_data.get("practitioner_name", "")
    registration_type = (ahpra_data.get("registration_type") or "").strip()
    registration_status = (ahpra_data.get("registration_status") or "").strip()
    expiry_date_str = ahpra_data.get("expiry_date", "")

    is_name_match = simple_name_match(practitioner_name, first_name, last_name)
    logger.info("[verify_ahpra_task] Name match: %s pk=%s", is_name_match, object_pk)

    note = ""
    expiry_date = None
    if not is_name_match:
        note = f"AHPRA name mismatch: '{first_name} {last_name}' vs '{practitioner_name}'"
        _update_ahpra_fields(
            model_name, object_pk, False, note,
            reg_type=registration_type, reg_status=registration_status, expiry_date=None
        )
        return

    if expiry_date_str:
        try:
            expiry_date = dateutil.parser.parse(expiry_date_str, dayfirst=True).date()
        except Exception:
            note = f"Could not parse expiry date: {expiry_date_str}"

    today = timezone.now().date()
    is_valid_type = registration_type.strip().lower() == "general"
    is_valid_status = registration_status.strip().lower() == "registered"
    expiry_ok = expiry_date and expiry_date > today

    is_verified = False
    fail_reasons = []
    
    if not expiry_ok:
        fail_reasons.append("Registration expired.")
    if not is_valid_type:
        fail_reasons.append(f"Registration type is '{registration_type}' (not 'General').")
    if not is_valid_status:
        fail_reasons.append(f"Registration status is '{registration_status}' (not 'Registered').")

    if expiry_ok and is_valid_type and is_valid_status:
        is_verified = True
        note = "AHPRA registration is valid and current."
    else:
        is_verified = False
        note = " / ".join(fail_reasons) or "AHPRA registration not valid."

    note = (note or "")[:255]
    _update_ahpra_fields(
        model_name, object_pk, is_verified, note,
        reg_type=registration_type, reg_status=registration_status, expiry_date=expiry_date
    )


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

    Model = apps.get_model('client_profile', model_name)
    try:
        obj = Model.objects.get(pk=pk)
    except Model.DoesNotExist:
        # the profile was deleted after this ETA reminder was queued: nothing left to remind about
        cancel_referee_reminder(model_name, pk, ref_idx)
        logger.info("[referee-reminder] Profile gone; reminder dropped model=%s pk=%s ref_idx=%s", model_name, pk, ref_idx)
        return

    confirmed = bool(getattr(obj, f'referee{ref_idx}_confirmed', False))
    rejected = bool(getattr(obj, f'referee{ref_idx}_rejected', False))
    if confirmed or rejected:
        cancel_referee_reminder(model_name, pk, ref_idx)
        return

    # Build the single-ref reminder email
    email_raw = getattr(obj, f'referee{ref_idx}_email', None)
    name = getattr(obj, f'referee{ref_idx}_name', '')
    relation = getattr(obj, f'referee{ref_idx}_relation', '')
    workplace = getattr(obj, f'referee{ref_idx}_workplace', '')
    email = clean_email(email_raw)
    if not email:
        cancel_referee_reminder(model_name, pk, ref_idx)
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
    schedule_referee_reminder(model_name, pk, ref_idx)


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

    # Build required checks
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

    # Referee requirements
    referees_needed = model_name_lower in ['pharmacistonboarding', 'otherstaffonboarding', 'exploreronboarding']
    is_pending_referee = False
    if referees_needed:
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
