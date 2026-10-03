"""Celery entry points of onboarding verification.

Every task keeps its deployed name (`client_profile.tasks.*`), queue and signature: workers, beat, routes and queued
messages address tasks by these names. `client_profile.tasks` re-exports these objects; it does not register them
again.
"""
import json
import logging
import os
import tempfile
from pathlib import Path

import dateutil.parser
from celery import shared_task
from django.apps import apps
from django.utils import timezone

from core.integrations.abr import _parse_abn_html_fields, abn_lookup
from onboarding.emails import simple_name_match
from onboarding.verification.ahpra import _update_ahpra_fields, ahpra_lookup, parse_ahpra_html
from onboarding.verification.documents import azure_ocr, get_local_file_or_download, ocr_input_path_for_file
from onboarding.verification.support import env, fetch_instance_with_retries, save_output_file

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

    # --- THIS IS THE FIX ---
    # If a verification note already exists, the task has already run.
    if note_field and getattr(obj, note_field, None):
        logger.info(f"[FILEFIELD TASK] SKIPPING: Verification for pk={object_pk}, field={file_field} already has a result.")
        return # Exit immediately
    # --- END OF FIX ---

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
            failure_note = f"Could not obtain file for OCR: {local_path}."
            logger.info(f"[verify_filefield_task] {failure_note}")
        else:
            converted_path = None
            try:
                ocr_path, converted_path = ocr_input_path_for_file(local_path)
                logger.info(f"[verify_filefield_task] Sending OCR input path to Azure: {ocr_path}")
                ocr_data = azure_ocr(ocr_path)
                lines = ocr_data.get("lines", [])
                text = " ".join(lines)
                is_name_match = simple_name_match(text, first_name, last_name)

                if is_name_match:
                    is_verified = True
                    logger.info(f"[verify_filefield_task] Name match result: {is_name_match} (first={first_name}, last={last_name})")
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


@shared_task(name="client_profile.tasks.verify_abn_task", queue="ocr")
def verify_abn_task(model_name, object_pk, abn_number, first_name, last_name, email, **kwargs):
    """
    Scrape ABR page and populate ABR fields. DOES NOT set abn_verified=True –
    that only happens when the user confirms in the UI.
    """
    note_field = kwargs.get('note_field')
    logger.info(f"[VERIFY ABN TASK] model={model_name}, pk={object_pk}, abn={abn_number}")

    Model = apps.get_model("client_profile", model_name)
    obj = fetch_instance_with_retries(Model, object_pk)

    # mark as not-verified every run (user confirmation will flip it)
    obj.abn_verified = False
    if note_field and hasattr(obj, note_field):
        setattr(obj, note_field, "")
        obj.save(update_fields=["abn_verified", note_field])
    else:
        obj.save(update_fields=["abn_verified"])

    legal_name, html = abn_lookup(abn_number)
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

    # artifacts
    out_html = save_output_file("abn_html", object_pk, "html")
    with open(out_html, "w", encoding="utf-8") as f:
        f.write(html if html else "No HTML captured.")
    out_json = save_output_file("abn", object_pk, "json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump({
            "abn_input": abn_number,
            "entity_name": obj.abn_entity_name,
            "entity_type": obj.abn_entity_type,
            "abn_status": obj.abn_status,
            "abn_gst_registered": obj.abn_gst_registered,
            "abn_gst_from": (obj.abn_gst_from.isoformat() if obj.abn_gst_from else None),
            "abn_gst_to": (obj.abn_gst_to.isoformat() if obj.abn_gst_to else None),
            "note": getattr(obj, note_field, None) if note_field else None,
        }, f, indent=2)


@shared_task(name="client_profile.tasks.verify_ahpra_task", queue="ocr")
def verify_ahpra_task(model_name, object_pk, ahpra_number, first_name, last_name, email, **kwargs):
    full_ahpra_number = f"PHA000{ahpra_number}"
    logger.info(f"[AHPRA TASK] Constructed full AHPRA number for lookup: {full_ahpra_number}")
    # --- END OF CHANGE ---

    Model = apps.get_model("client_profile", model_name)
    obj = fetch_instance_with_retries(Model, object_pk)

    # This logic correctly compares the incoming numeric-only `ahpra_number` 
    # with the numeric-only number stored on the object, so it doesn't need to change.
    if (obj.ahpra_number or '').strip().lower() == ahpra_number.strip().lower() and obj.ahpra_verification_note:
        logger.info(f"[AHPRA TASK] SKIPPING: Verification for pk={object_pk} with number {ahpra_number} already has a result.")
        return # Exit immediately

    # If we are here, it means it's a new AHPRA number or the first attempt.
    # We must clear the old result before starting.
    obj.ahpra_verified = False
    obj.ahpra_verification_note = ""
    obj.save(update_fields=['ahpra_verified', 'ahpra_verification_note'])

    output_html = save_output_file("ahpra_html", object_pk, "html")
    try:
        # Use the newly constructed full AHPRA number for the lookup
        ahpra_lookup(full_ahpra_number, output_html, api_key=env("SCRAPINGBEE_API_KEY"))
    except Exception as exc:
        # Keep traceback frames and the exception type, but redact the value because it can contain the service URL/key.
        logger.error("[verify_ahpra_task] AHPRA lookup failed for pk=%s error_type=%s", object_pk, type(exc).__name__, exc_info=(RuntimeError, RuntimeError(f"{type(exc).__name__} (details redacted)"), exc.__traceback__))
        _update_ahpra_fields(model_name, object_pk, False, "AHPRA lookup failed. Please try again later.")
        return


    ahpra_data = parse_ahpra_html(output_html)
    logger.info(f"[verify_ahpra_task] Parsed: {ahpra_data}")

    practitioner_name = ahpra_data.get("practitioner_name", "")
    registration_type = (ahpra_data.get("registration_type") or "").strip()
    registration_status = (ahpra_data.get("registration_status") or "").strip()
    expiry_date_str = ahpra_data.get("expiry_date", "")

    is_name_match = simple_name_match(practitioner_name, first_name, last_name)
    logger.info(f"[verify_ahpra_task] Name match: {is_name_match} (expected={first_name} {last_name}, found={practitioner_name})")

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
