import sys
import os
import json
import tempfile
import shutil
from pathlib import Path
from datetime import timedelta, datetime
from django_q.models import Schedule
from urllib.parse import urlencode
from django.apps import apps
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.core.exceptions import ObjectDoesNotExist
from django.core.files.storage import default_storage
from django_q.tasks import async_task
import time
import requests
import dateutil.parser
from bs4 import BeautifulSoup
from scrapingbee import ScrapingBeeClient
from users.tasks import send_async_email
from client_profile.models import ShiftSlotAssignment, OnboardingNotification, MembershipApplication, Membership, Pharmacy, PharmacyAdmin
from client_profile.timezone_utils import get_pharmacy_timezone
from django.contrib.contenttypes.models import ContentType
from client_profile.utils import build_shift_email_context, simple_name_match,clean_email,get_candidate_role, send_referee_emails, get_frontend_dashboard_url 
import logging
import re
from django.core.signing import TimestampSigner
from django.contrib.auth import get_user_model
from django.template.defaultfilters import date as datefilter
from users.models import OrganizationMembership


logger = logging.getLogger(__name__)
from environ import Env

User = get_user_model()

# ==== ENV SETUP ====
BASE_DIR = Path(getattr(settings, "BASE_DIR", Path(__file__).resolve().parent.parent))
ENV_PATH = BASE_DIR / "core" / ".env"
env = Env()
if ENV_PATH.exists():
    env.read_env(str(ENV_PATH))
    logger.info(f"[ENV] Loaded environment variables from {ENV_PATH}")
else:
    logger.info(f"[ENV] No .env file at {ENV_PATH}, using system environment.")

# ==== OUTPUTS DIRECTORY ====
OUTPUT_DIR = BASE_DIR / "verification_outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)
logger.info(f"[SETUP] Output files will be saved to {OUTPUT_DIR}")


def fetch_instance_with_retries(model, pk, max_retries=10, sleep_sec=0.4):
    for i in range(max_retries):
        try:
            return model.objects.get(pk=pk)
        except ObjectDoesNotExist:
            logger.error(f"[fetch_instance_with_retries] Not found pk={pk}, try {i+1}/{max_retries}", file=sys.stderr)
            time.sleep(sleep_sec)
    raise model.DoesNotExist(f"Object with pk={pk} not found after {max_retries} tries")

def get_local_file_or_download(filefield):
    if not filefield:
        logger.info("[get_local_file_or_download] filefield is empty.")
        return None
    try:
        if hasattr(filefield, "path") and os.path.exists(filefield.path):
            logger.info(f"[get_local_file_or_download] Using local path: {filefield.path}")
            return filefield.path
    except Exception as e:
        logger.info(f"[get_local_file_or_download] Could not access .path: {e}")
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=Path(filefield.name).suffix)
    with default_storage.open(filefield.name, "rb") as remote_file:
        shutil.copyfileobj(remote_file, temp_file)
    temp_file.close()
    logger.info(f"[get_local_file_or_download] Downloaded to temp: {temp_file.name}")
    return temp_file.name

def save_output_file(task_name, object_pk, extension="json"):
    out_path = OUTPUT_DIR / f"{task_name}_{object_pk}_{timezone.now().strftime('%Y%m%d_%H%M%S')}.{extension}"
    logger.info(f"[save_output_file] Will write output to: {out_path}")
    return str(out_path)

def pdf_first_page_to_png(pdf_path):
    """
    Convert the first PDF page to a temporary PNG so Azure Image Analysis can OCR it.
    Works after get_local_file_or_download(), so the source can be local media or Azure Blob.
    """
    import fitz  # PyMuPDF

    doc = fitz.open(pdf_path)
    try:
        if doc.page_count < 1:
            raise Exception("PDF has no pages.")
        page = doc.load_page(0)
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
        temp_file.close()
        pix.save(temp_file.name)
        logger.info(f"[pdf_first_page_to_png] Converted first PDF page to: {temp_file.name}")
        return temp_file.name
    finally:
        doc.close()

def is_pdf_file(local_path):
    try:
        with open(local_path, "rb") as f:
            header = f.read(5)
        if header == b"%PDF-":
            return True
    except Exception as e:
        logger.info(f"[is_pdf_file] Could not inspect file header for {local_path}: {e}")
    return str(local_path).lower().endswith(".pdf")

def ocr_input_path_for_file(local_path):
    if is_pdf_file(local_path):
        logger.info(f"[ocr_input_path_for_file] PDF detected, converting before OCR: {local_path}")
        converted_path = pdf_first_page_to_png(local_path)
        return converted_path, converted_path
    logger.info(f"[ocr_input_path_for_file] Image input detected, sending directly to OCR: {local_path}")
    return local_path, None

# --- Inline OCR with Azure (direct call, not subprocess!) ---
def azure_ocr(file_path):
    """Run OCR using Azure Vision, returns lines of text."""
    from azure.ai.vision.imageanalysis import ImageAnalysisClient
    from azure.ai.vision.imageanalysis.models import VisualFeatures
    from azure.core.credentials import AzureKeyCredential
    # Assumes env has already been loaded
    endpoint = env("AZURE_OCR_ENDPOINT")
    key = env("AZURE_OCR_KEY")
    if not endpoint or not key:
        raise Exception("Missing AZURE_OCR_ENDPOINT or AZURE_OCR_KEY in env")
    client = ImageAnalysisClient(
        endpoint=endpoint,
        credential=AzureKeyCredential(key)
    )
    with open(file_path, "rb") as image_stream:
        result = client.analyze(
            image_data=image_stream,
            visual_features=[VisualFeatures.READ]
        )
    lines = []
    if result.read and result.read.blocks:
        for block in result.read.blocks:
            for line in block.lines:
                lines.append(line.text)
    logger.info(f"[azure_ocr] OCR done for {file_path}, found {len(lines)} lines.")
    return {"lines": lines}

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
                output_json = save_output_file("ocr", object_pk, "json")
                with open(output_json, "w", encoding="utf-8") as f:
                    json.dump(ocr_data, f, indent=2, ensure_ascii=False)

                lines = ocr_data.get("lines", [])
                text = " ".join(lines)
                is_name_match = simple_name_match(text, first_name, last_name)

                if is_name_match:
                    is_verified = True
                    logger.info(f"[verify_filefield_task] Name match result: {is_name_match} (first={first_name}, last={last_name})")
                else:
                    failure_note = f"Name mismatch found in your uploaded document"
                    logger.info(f"[verify_filefield_task] {failure_note}")

            except Exception as e:
                failure_note = f"OCR processing failed: {e}."
                logger.info(f"[verify_filefield_task] {failure_note}")
            finally:
                if converted_path and os.path.exists(converted_path):
                    os.remove(converted_path)
                if local_path and os.path.exists(local_path) and Path(local_path).parent == Path(tempfile.gettempdir()):
                    os.remove(local_path)

    setattr(obj, verification_field, is_verified)
    if note_field and hasattr(obj, note_field):
        setattr(obj, note_field, failure_note[:255])
    obj.save(update_fields=[verification_field] + ([note_field] if note_field and hasattr(obj, note_field) else []))

# --- ABN lookup and verification -------------------------------------------------
def abn_lookup(abn_number: str):
    url = f"https://abr.business.gov.au/ABN/View?id={abn_number}"
    logger.info(f"[abn_lookup] Fetching {url}")
    try:
        resp = requests.get(url, timeout=20)
        resp.raise_for_status()
    except Exception as e:
        logger.info(f"[abn_lookup] Error fetching ABN: {e}")
        return "", None

    soup = BeautifulSoup(resp.text, "html.parser")
    tag = soup.find("span", {"itemprop": "legalName"})
    return (tag.get_text(strip=True) if tag else ""), resp.text

def _parse_abn_html_fields(html_text: str) -> dict:
    """
    Parse ABR HTML to lift:
      - entity_name (legalName)
      - entity_type
      - abn_status  (raw line e.g. 'Active from 18 Aug 2020')
      - abn_gst_registered (bool)
      - abn_gst_from, abn_gst_to (date or None)
    """
    out = {}
    if not html_text:
        return out

    soup = BeautifulSoup(html_text, "html.parser")
    rows = soup.select('div[itemtype="http://schema.org/LocalBusiness"] table tbody tr')

    def _clean(s: str) -> str:
        # normalise non-breaking spaces etc.
        return (s or "").replace("\xa0", " ").strip()

    for r in rows:
        th_el = r.find('th')
        td_el = r.find('td')
        th = _clean(th_el.get_text(" ", strip=True) if th_el else "")
        td = _clean(td_el.get_text(" ", strip=True) if td_el else "")

        if th.startswith("Entity name:"):
            span = td_el.find('span', {"itemprop": "legalName"}) if td_el else None
            out["entity_name"] = _clean(span.get_text(" ", strip=True) if span else td)

        elif th.startswith("Entity type:"):
            out["entity_type"] = td

        elif th.startswith("ABN status:"):
            out["abn_status"] = td

        elif th.startswith("Goods") and "GST" in th:
            # Examples seen:
            #   'Not currently registered for GST'
            #   'Registered from 19 May 2025'
            #   'Registered from 1 September 2023 to 30 June 2024'
            txt = td
            out["gst_text"] = txt

            low = txt.lower()
            if "not currently" in low:
                out["abn_gst_registered"] = False
                out["abn_gst_from"] = None
                out["abn_gst_to"] = None
            else:
                out["abn_gst_registered"] = True

                # allow full or abbreviated month names, and optional "to ..."
                # normalise multiples spaces
                import re, datetime
                txt_norm = re.sub(r"\s+", " ", txt)

                # try to capture "from <date>"
                m_from = re.search(
                    r"\bfrom\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})",
                    txt_norm,
                    flags=re.IGNORECASE,
                )
                # try to capture "to <date>" (rare)
                m_to = re.search(
                    r"\bto\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})",
                    txt_norm,
                    flags=re.IGNORECASE,
                )

                def _parse_date(s: str):
                    for fmt in ("%d %b %Y", "%d %B %Y"):
                        try:
                            return datetime.datetime.strptime(s, fmt).date()
                        except Exception:
                            pass
                    return None

                out["abn_gst_from"] = _parse_date(m_from.group(1)) if m_from else None
                out["abn_gst_to"]   = _parse_date(m_to.group(1)) if m_to else None

    return out

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

# --- Inline AHPRA scraping and parsing ---
def ahpra_lookup(ahpra_number, output_html_path, api_key=None):
    """
    Scrape AHPRA using ScrapingBee with retries and better error handling.
    """
    api_key = api_key or os.environ.get("SCRAPINGBEE_API_KEY")
    assert api_key, "SCRAPINGBEE_API_KEY must be set in environment or passed in"
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

    # --- START OF FIX: Add a retry loop ---
    max_retries = 3
    for attempt in range(max_retries):
        logger.info(f"[ahpra_lookup] Requesting ScrapingBee for: {ahpra_number} (Attempt {attempt + 1}/{max_retries})")
        try:
            response = client.get(url, params=params)
            
            # Check if the response from ScrapingBee itself is an error
            if response.status_code >= 400:
                # This is a ScrapingBee error (e.g., 500, 403)
                logger.info(f"[ahpra_lookup] ScrapingBee returned an error status: {response.status_code}. Content: {response.text[:200]}")
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

        except Exception as e:
            logger.info(f"[ahpra_lookup] An exception occurred on attempt {attempt + 1}: {e}")
            if attempt == max_retries - 1:
                # If this was the last retry, re-raise the exception so the task fails gracefully
                raise e
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
    for section in sections:
        rows = section.find_all('div', class_='section-row')
        for row in rows:
            label = row.find('div', class_='field-title')
            value = row.find('div', class_='field-entry')
            label_text = label.get_text(strip=True) if label else ""
            value_text = value.get_text(strip=True) if value else ""
            if "Registration status" in label_text:
                reg_status = value_text
            if "Expiry Date" in label_text and not expiry_date:
                expiry_date = value_text

    return {
        "practitioner_name": name,
        "registration_type": reg_type,
        "registration_status": reg_status,
        "expiry_date": expiry_date
    }

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
    except Exception as e:
        note = f"AHPRA lookup failed: {e}"
        _update_ahpra_fields(model_name, object_pk, False, note)
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
    if reg_type is not None:
        obj.ahpra_registration_type = reg_type
    if reg_status is not None:
        obj.ahpra_registration_status = reg_status
    if expiry_date is not None:
        obj.ahpra_expiry_date = expiry_date
    obj.save(update_fields=[
        "ahpra_verified", "ahpra_verification_note",
        "ahpra_registration_type", "ahpra_registration_status", "ahpra_expiry_date"
    ])
    logger.info(f"[AHPRA TASK] Saved verification note for {model_name} pk={object_pk}: {note}")


# --- ORCHESTRATOR AND FINAL EVALUATOR ---
def run_all_verifications(model_name, object_pk, is_create=False):
    """
    MODIFIED: This orchestrator now also sends the initial admin notification.
    """
    from django.apps import apps
    from django.utils import timezone
    from datetime import timedelta
    from client_profile.utils import send_referee_emails, notify_superuser_on_onboarding

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
        if obj.payment_preference == "TFN" and obj.tfn_declaration:
            async_task('client_profile.tasks.verify_filefield_task', model_name, object_pk, 'tfn_declaration', user.first_name, user.last_name, user.email, 'tfn_declaration_verified', note_field='tfn_declaration_verification_note')
        if obj.gst_registered and obj.gst_file:
            async_task('client_profile.tasks.verify_filefield_task', model_name, object_pk, 'gst_file', user.first_name, user.last_name, user.email, 'gst_file_verified', note_field='gst_file_verification_note')

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
        if obj.payment_preference == 'TFN' and obj.tfn_declaration:
            async_task('client_profile.tasks.verify_filefield_task', model_name, object_pk, 'tfn_declaration', user.first_name, user.last_name, user.email, 'tfn_declaration_verified', note_field='tfn_declaration_verification_note')
        if obj.gst_registered and obj.gst_file:
            async_task('client_profile.tasks.verify_filefield_task', model_name, object_pk, 'gst_file', user.first_name, user.last_name, user.email, 'gst_file_verified', note_field='gst_file_verification_note')
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

def final_evaluation(model_name, object_pk, retry_count=0, is_reminder=False):
    """
    REVISED: This task now correctly handles all states and cleans up scheduled tasks.
    """
    from django.apps import apps
    from django.utils import timezone
    from datetime import timedelta
    from django_q.models import Schedule
    from client_profile.utils import get_frontend_dashboard_url, send_referee_emails
    from django.contrib.contenttypes.models import ContentType
    from django_q.tasks import async_task
    import logging

    logger = logging.getLogger("client_profile.tasks")

    Model = apps.get_model("client_profile", model_name)
    try:
        obj = Model.objects.get(pk=object_pk)
    except Model.DoesNotExist:
        logger.error(f"[FINAL EVALUATION] ERROR: No object for pk={object_pk}")
        return

    def cancel_pending_reminders():
        Schedule.objects.filter(
            func='client_profile.tasks.final_evaluation',
            args=f"'{model_name}',{object_pk}"
        ).delete()
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
            if obj.gst_registered:
                required_checks.append('gst_file')
        elif obj.payment_preference == "TFN":
            required_checks.append('tfn_declaration')

    elif model_name_lower == 'otherstaffonboarding':
        required_checks.append('gov_id')
        if obj.payment_preference == 'ABN' and obj.abn:
            required_checks.append('abn')
        if obj.payment_preference == 'TFN' and obj.tfn_declaration:
            required_checks.append('tfn_declaration')
        if obj.gst_registered and obj.gst_file:
            required_checks.append('gst_file')
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
        return Schedule.objects.filter(
            func='client_profile.tasks.final_evaluation',
            args=f"'{model_name}',{object_pk}",
            next_run__gt=timezone.now()
        ).exists()

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
            Schedule.objects.create(
                func='client_profile.tasks.final_evaluation',
                args=f"'{model_name}',{object_pk}",
                kwargs={'is_reminder': True},
                schedule_type=Schedule.ONCE,
                next_run=timezone.now() + REMINDER_DELAY,
            )
            logger.info(f"[FINAL EVALUATION] Scheduled next referee check for pk={object_pk} at {(timezone.now() + REMINDER_DELAY).isoformat()}.")
        else:
            logger.info(f"[FINAL EVALUATION] Future referee reminder already exists for pk={object_pk}; leaving it in place.")

        # If other automated checks are also pending, keep the quick re-check loop alive (properly delayed)
        if is_pending_check:
            Schedule.objects.create(
                func='client_profile.tasks.final_evaluation',
                args=f"'{model_name}',{object_pk}",
                schedule_type=Schedule.ONCE,
                next_run=timezone.now() + RECHECK_DELAY,
            )
        return

    # Automated checks still pending (no referee pending) -> keep quick loop
    if is_pending_check:
        logger.info(f"[FINAL EVALUATION] pk={object_pk} is waiting for automated tasks. Re-checking in 20s.")
        Schedule.objects.create(
            func='client_profile.tasks.final_evaluation',
            args=f"'{model_name}',{object_pk}",
            schedule_type=Schedule.ONCE,
            next_run=timezone.now() + RECHECK_DELAY,
        )
        return

    # Success state (unchanged)
    logger.info(f"[FINAL EVALUATION] pk={object_pk} has been successfully VERIFIED.")
    obj.verified = True
    obj.save(update_fields=['verified'])
    try:
        from client_profile.rewards import award_verified_referrals_for_user
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



# ========== Referee Reminder (Scheduled) ==========
REFEREE_REMINDER_HOURS: float = float(getattr(settings, "REFEREE_REMINDER_HOURS", 48))

# The function path Django-Q will call
REMINDER_FUNC = 'client_profile.tasks.run_referee_reminder'


def _rem_args(model_name: str, pk: int, ref_idx: int) -> str:
    # Keep a stable args string for Django-Q to de-duplicate
    return f"'{model_name}',{pk},{ref_idx}"


def schedule_referee_reminder(model_name: str, pk: int, ref_idx: int, hours: float | None = None) -> None:
    """
    Create a ONE-OFF schedule for a single referee.
    To test, pass hours=0.1 etc.
    """
    args = _rem_args(model_name, pk, ref_idx)
    if Schedule.objects.filter(func=REMINDER_FUNC, args=args, next_run__gt=timezone.now()).exists():
        return
    delay = REFEREE_REMINDER_HOURS if hours is None else float(hours)
    Schedule.objects.create(
        func=REMINDER_FUNC,
        args=args,
        schedule_type=Schedule.ONCE,
        next_run=timezone.now() + timedelta(hours=delay),
        name=f"referee-reminder-{model_name}-{pk}-{ref_idx}",
    )


def cancel_referee_reminder(model_name: str, pk: int, ref_idx: int) -> int:
    args = _rem_args(model_name, pk, ref_idx)
    return Schedule.objects.filter(func=REMINDER_FUNC, args=args).delete()[0]


def cancel_all_referee_reminders(model_name: str, pk: int) -> int:
    # Only used if you want to wipe all reminders for a profile (e.g., both confirmed)
    prefix = f"'{model_name}',{pk},"
    return Schedule.objects.filter(func=REMINDER_FUNC, args__startswith=prefix).delete()[0]

def run_referee_reminder(model_name: str, pk: int, ref_idx: int) -> None:
    """
    Runs for ONE referee (ref_idx). If that referee is confirmed/rejected now,
    cancel and stop. Otherwise send reminder to that referee only
    and re-schedule only that referee.
    """
    Model = apps.get_model('client_profile', model_name)
    obj = Model.objects.get(pk=pk)

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

    # ✅ NEW: include role in the querystring
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

    # Re-schedule this referee only (keep your dev interval)
    schedule_referee_reminder(model_name, pk, ref_idx)


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
        return "/dashboard/owner/manage-pharmacies/my-pharmacies"
    if recipient_role == "ORG_ADMIN":
        return "/dashboard/organization/manage-pharmacies/my-pharmacies"
    # Fallback to owner area if something unexpected slips through
    return "/dashboard/owner/manage-pharmacies/my-pharmacies"


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
        "role": app.role,
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
        manage_url = f"{base}{_manage_path_for_role(r_role)}"
        ctx = {**ctx_common, "manage_url": manage_url}
        notification_payload = {
            "title": f"New membership application: {pharmacy.name}",
            "body": f"{ctx_common['applicant_full_name']} applied for {app.role}.",
            "action_url": manage_url,
            "payload": {"application_id": app.id},
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


def email_membership_application_approved(app_id: int):
    """
    Notify the applicant that their application was approved.
    (This is in addition to your existing invite/login email.)
    """
    try:
        app = (MembershipApplication.objects
               .select_related("pharmacy")
               .get(id=app_id))
    except MembershipApplication.DoesNotExist:
        logger.warning("Application %s not found", app_id)
        return

    if not app.email:
        logger.info("Application %s has no email; skipping applicant notification.", app_id)
        return

    base = _frontend_base_url()
    pharmacy = app.pharmacy

    ctx = {
        "pharmacy_name": pharmacy.name,
        "applicant_full_name": f"{app.first_name} {app.last_name}".strip(),
        "role": app.role,
        "category": (
            "Full/Part-time (Pharmacy staff)"
            if app.category == "FULL_PART_TIME"
            else "Favorite (Locum/Shift Hero)"
        ),
        # Your existing invite helper still sends a login/reset link as needed;
        # this is a friendly confirmation with a generic login entry point.
        "login_url": f"{base}/login",
    }

    notification_payload = {
        "title": f"Application approved: {pharmacy.name}",
        "body": f"Your application with {pharmacy.name} has been approved.",
        "action_url": ctx["login_url"],
        "payload": {"application_id": app.id},
    }
    user_ids = []
    if getattr(app, "submitted_by_id", None):
        user_ids.append(app.submitted_by_id)
    else:
        existing_id = User.objects.filter(email=app.email).values_list('id', flat=True).first()
        if existing_id:
            user_ids.append(existing_id)
    if user_ids:
        notification_payload['user_ids'] = user_ids
    send_async_email(
        subject=f"Your application to {pharmacy.name} was approved",
        recipient_list=[app.email],
        template_name="emails/membership_application_approved.html",
        text_template="emails/membership_application_approved.txt",
        context=ctx,
        notification=notification_payload,
    )
