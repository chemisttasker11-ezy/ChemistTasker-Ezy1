"""Australian Business Register (ABR) lookup.

Onboarding (verify_abn_task), organizations (pharmacy ABN checks) and worker_finance (customer ABN checks) all use
this integration, so it belongs to none of them.
"""
import logging

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


def abn_lookup(abn_number: str):
    url = f"https://abr.business.gov.au/ABN/View?id={abn_number}"
    logger.info("[abn_lookup] Fetching the ABR record")
    try:
        resp = requests.get(url, timeout=20)
        resp.raise_for_status()
    except Exception as e:
        logger.info("[abn_lookup] Error fetching the ABR record (error_type=%s)", type(e).__name__)
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
