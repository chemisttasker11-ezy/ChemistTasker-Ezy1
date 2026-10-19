import datetime
import logging
import time

from bs4 import BeautifulSoup
import dateutil.parser
from django.apps import apps
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import models
from django.utils import timezone
from scrapingbee import ScrapingBeeClient

from onboarding.emails import simple_name_match
from onboarding.verification.support import fetch_instance_with_retries

logger = logging.getLogger(__name__)


def ahpra_lookup(ahpra_number, output_html_path, api_key=None):
    """
    Scrape AHPRA using ScrapingBee with retries and better error handling.
    """
    api_key = api_key or settings.SCRAPINGBEE_API_KEY
    if not api_key:
        # explicit: an assert would be stripped under `python -O`
        raise ImproperlyConfigured("SCRAPINGBEE_API_KEY is not configured")
    client = ScrapingBeeClient(api_key=api_key)

    url = "https://www.ahpra.gov.au/Registration/Registers-of-Practitioners.aspx"

    js_instructions = [
        {"fill": ["#name-reg", ahpra_number]},
        {"wait": 1500},
        {"click": {"selector": "#predictiveSearchHomeBtn", "selector_type": "css"}},
        {"wait_for": {"selector": ".search-results-table", "selector_type": "css"}},
        {"wait": 2000},
        {"click": {"selector": ".search-results-table-row .search-results-table-col .text a", "selector_type": "css"}},
        {"wait_for": {"selector": ".practitioner-detail-header .practitioner-name", "selector_type": "css"}},
        {"wait": 2000},
    ]

    params = {
        "render_js": True,
        "premium_proxy": True,
        "js_scenario": {"instructions": js_instructions},
        "wait_browser": "networkidle0",
        "window_width": 1600,
        "window_height": 1200,
    }

    # retry the provider up to three times with a growing pause
    max_retries = 3
    for attempt in range(max_retries):
        logger.info("[ahpra_lookup] Requesting ScrapingBee (attempt %s/%s)", attempt + 1, max_retries)
        try:
            response = client.get(url, params=params)
            
            # Check if the response from ScrapingBee itself is an error
            if response.status_code >= 400:
                # This is a ScrapingBee error (e.g., 500, 403)
                logger.warning("[ahpra_lookup] ScrapingBee returned error status=%s", response.status_code)
                # If it's the last attempt, raise an exception to be caught by the task
                if attempt == max_retries - 1:
                    raise Exception(f"An Error occured in during the verification of your AHPRA details")
                # Wait before retrying
                time.sleep(3 * (attempt + 1)) # Wait 3, 6 seconds
                continue

            # If the request was successful, save the HTML and exit the loop
            with open(output_html_path, "w", encoding="utf-8") as f:
                f.write(response.text)
            
            logger.info(f"[ahpra_lookup] ScrapingBee request successful.")
            return output_html_path

        except Exception as exc:
            logger.warning("[ahpra_lookup] attempt=%s/%s failed error_type=%s", attempt + 1, max_retries, type(exc).__name__, exc_info=(RuntimeError, RuntimeError(f"{type(exc).__name__} (details redacted)"), exc.__traceback__))
            if attempt == max_retries - 1:
                # If this was the last retry, re-raise the exception so the task fails gracefully
                raise
            time.sleep(3 * (attempt + 1)) # Wait before retrying


def parse_ahpra_html(html_file_path):
    with open(html_file_path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')

    header = soup.find('div', class_='practitioner-detail-header')
    name = ""
    reg_type = ""
    if header:
        name_tag = header.find('h2', class_='practitioner-name')
        name = name_tag.get_text(strip=True) if name_tag else ""
        reg_types = header.find('div', class_='reg-types')
        if reg_types:
            reg_type_tag = reg_types.find('span')
            reg_type = reg_type_tag.get_text(strip=True) if reg_type_tag else ""

    main = soup.find('div', class_='practitioner-detail-body')
    sections = main.find_all('div', class_='practitioner-detail-section') if main else []

    reg_status = ""
    expiry_date = ""
    profession = ""
    conditions = False
    undertakings = False
    reprimands = False

    for section in sections:
        rows = section.find_all('div', class_='section-row')
        for row in rows:
            label = row.find('div', class_='field-title')
            value = row.find('div', class_='field-entry')
            label_text = label.get_text(strip=True) if label else ""
            value_text = value.get_text(strip=True) if value else ""

            label_lower = label_text.lower()
            val_lower = value_text.lower()

            if "registration status" in label_lower:
                reg_status = value_text
            if "expiry date" in label_lower and not expiry_date:
                expiry_date = value_text
            if "profession" in label_lower and not profession:
                profession = value_text

            has_value = bool(val_lower) and val_lower not in ("none", "nil", "n/a")
            if "condition" in label_lower and has_value:
                conditions = True
            if "undertaking" in label_lower and has_value:
                undertakings = True
            if "reprimand" in label_lower and has_value:
                reprimands = True

    return {
        "practitioner_name": name,
        "registration_type": reg_type,
        "registration_status": reg_status,
        "expiry_date": expiry_date,
        "profession": profession,
        "conditions": conditions,
        "undertakings": undertakings,
        "reprimands": reprimands,
    }


def evaluate_ahpra_record(record: dict, *, first_name, last_name, role) -> tuple[str, str]:
    """Pure evaluation of an AHPRA record against user details and role.

    Returns (outcome, note) where outcome is in {"verified", "review", "rejected"}.
    """
    practitioner_name = (record.get("practitioner_name") or "").strip()
    if not simple_name_match(practitioner_name, first_name, last_name):
        return ("review", f"Name mismatch: '{first_name} {last_name}' vs '{practitioner_name}'")

    profession = (record.get("profession") or "").strip()
    if profession:
        p_lower = profession.lower()
        if "pharmac" not in p_lower:
            return ("rejected", f"Profession is '{profession}' (expected Pharmacy or Pharmacist)")

    status = (record.get("registration_status") or "").strip()
    status_lower = status.lower()
    if any(s in status_lower for s in ("suspended", "cancelled", "surrendered", "not registered")):
        return ("rejected", f"Registration status is '{status}'")
    if status_lower != "registered":
        return ("review", f"Registration status is '{status}' (not 'Registered')")

    role_norm = (role or "").strip().lower()
    reg_type = (record.get("registration_type") or "").strip()
    reg_type_norm = reg_type.lower()
    if role_norm in ("pharmacist", "pharmacy"):
        if reg_type_norm != "general":
            return ("review", f"Registration type is '{reg_type}' (expected 'General')")
    elif role_norm == "intern":
        if reg_type_norm not in ("provisional", "general"):
            return ("review", f"Registration type is '{reg_type}' (expected 'Provisional' or 'General')")
    else:
        return ("review", f"Registration type '{reg_type}' requires review for role '{role}'")

    flags = []
    if record.get("conditions"):
        flags.append("conditions")
    if record.get("undertakings"):
        flags.append("undertakings")
    if record.get("reprimands"):
        flags.append("reprimands")
    if flags:
        return ("review", f"Registration has {', '.join(flags)} recorded")

    expiry_val = record.get("expiry_date")
    expiry_date = None
    if isinstance(expiry_val, datetime.datetime):
        expiry_date = expiry_val.date()
    elif isinstance(expiry_val, datetime.date):
        expiry_date = expiry_val
    elif isinstance(expiry_val, str) and expiry_val.strip():
        try:
            expiry_date = dateutil.parser.parse(expiry_val.strip(), dayfirst=True).date()
        except Exception:
            return ("review", f"Could not parse expiry date: '{expiry_val}'")

    today = timezone.now().date()
    if expiry_date and expiry_date < today:
        return ("review", f"Registration expired on {expiry_date.strftime('%d/%m/%Y')}")

    return ("verified", "AHPRA registration is valid and current.")


def _update_ahpra_fields(model_name, object_pk, verified, note, reg_type=None, reg_status=None, expiry_date=None):
    note = (note or "")[:255]
    Model = apps.get_model("client_profile", model_name)
    try:
        obj = fetch_instance_with_retries(Model, object_pk)
    except Model.DoesNotExist:
        logger.info(f"[AHPRA TASK] Skipping update: record {model_name} with pk={object_pk} does not exist.")
        return
    obj.ahpra_verified = verified
    obj.ahpra_verification_note = note
    model_field_names = {f.name for f in Model._meta.get_fields()} if (isinstance(Model, type) and issubclass(Model, models.Model)) else None
    update_fields = ["ahpra_verified", "ahpra_verification_note"]
    if reg_type is not None and (model_field_names is None or "ahpra_registration_type" in model_field_names):
        obj.ahpra_registration_type = reg_type
        update_fields.append("ahpra_registration_type")
    if reg_status is not None and (model_field_names is None or "ahpra_registration_status" in model_field_names):
        obj.ahpra_registration_status = reg_status
        update_fields.append("ahpra_registration_status")
    if expiry_date is not None and (model_field_names is None or "ahpra_expiry_date" in model_field_names):
        obj.ahpra_expiry_date = expiry_date
        update_fields.append("ahpra_expiry_date")
    if model_field_names is not None:
        update_fields = [f for f in update_fields if f in model_field_names]
    obj.save(update_fields=update_fields)
    logger.info("[AHPRA TASK] Saved verification result for %s pk=%s verified=%s", model_name, object_pk, verified)

