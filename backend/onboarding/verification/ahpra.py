"""AHPRA register lookup (ScrapingBee), parsing and persistence of the AHPRA verification result."""
import logging
import time

from bs4 import BeautifulSoup
from django.apps import apps
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from scrapingbee import ScrapingBeeClient

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

    # --- START OF FIX: Add a retry loop ---
    max_retries = 3
    for attempt in range(max_retries):
        logger.info(f"[ahpra_lookup] Requesting ScrapingBee for: {ahpra_number} (Attempt {attempt + 1}/{max_retries})")
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
