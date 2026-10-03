"""Skills of the pharmacist and other-staff onboarding: the shared-core skills catalog, which skills need a
certificate, and the per-skill certificate files (saved per user and skill, old ones deleted when replaced or unchecked).
"""
import json
import os

from django.core.files.storage import default_storage
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers

from core.file_validation import DOCUMENT_UPLOAD_POLICY, validate_uploaded_file

_SKILLS_CATALOG_CACHE = None


def _load_skills_catalog():
    global _SKILLS_CATALOG_CACHE
    if _SKILLS_CATALOG_CACHE is not None:
        return _SKILLS_CATALOG_CACHE
    from django.conf import settings
    base_dir = settings.BASE_DIR.parent
    catalog_path = base_dir / "shared-core" / "skills_catalog.json"
    try:
        with open(catalog_path, "r", encoding="utf-8") as f:
            _SKILLS_CATALOG_CACHE = json.load(f)
    except Exception:
        _SKILLS_CATALOG_CACHE = {}
    return _SKILLS_CATALOG_CACHE


def _required_cert_skill_codes(role_key: str) -> set[str]:
    catalog = _load_skills_catalog()
    role = (catalog or {}).get(role_key, {})
    required = set()
    for group_key in ("clinical_services", "dispense_software", "expanded_scope"):
        for item in role.get(group_key, []) or []:
            if item.get("requires_certificate"):
                required.add(item.get("code"))
    return {c for c in required if c}


def files_by_skill(request):
    """
    Accept files either as flat keys ('CBR') or nested 'skill_files[CBR]'.
    """
    req = request
    out = {}
    if not req or not hasattr(req, "FILES"):
        return out
    for key, f in req.FILES.items():
        if key.startswith("skill_files[") and key.endswith("]"):
            code = key[len("skill_files["):-1]
            out[code] = f
        else:
            out[key] = f
    return out


def save_skill_file(user_id: int, code: str, uploaded_file):
    """
    Save to: skill_certs/<user_id>/<CODE>/<base>_<CODE>_<YYYYmmddHHMMSS>.<ext>
    (keeps historical versions; no deletes)
    """
    validate_uploaded_file(uploaded_file, DOCUMENT_UPLOAD_POLICY, f"skill certificate {code}")
    base, ext = os.path.splitext(uploaded_file.name or "certificate")
    safe = slugify(base) or "certificate"
    code_up = (code or "UNKNOWN").upper()
    ts = timezone.now().strftime("%Y%m%d%H%M%S")
    rel_path = f"skill_certs/{user_id}/{code_up}/{safe}_{code_up}_{ts}{ext.lower()}"
    return default_storage.save(rel_path, uploaded_file)


def list_existing_skill_files(user_id: int, code: str):
    folder = f"skill_certs/{user_id}/{(code or 'UNKNOWN').upper()}/"
    try:
        _dirs, files = default_storage.listdir(folder)
    except Exception:
        return []
    return sorted(folder + name for name in files)


def skill_certificate_summary(obj):
    """
    Return latest file per skill (by name sort). If you want all versions, expand here.
    """
    data = []
    for code, meta in (obj.skill_certificates or {}).items():
        path = (meta or {}).get("path")
        if not path:
            continue
        try:
            url = default_storage.url(path)
        except Exception:
            url = None
        data.append({"skill_code": code, "path": path, "url": url, "uploaded_at": meta.get("uploaded_at")})
    # stable order
    return sorted(data, key=lambda r: r["skill_code"])


def apply_skills_tab(instance, vdata: dict, *, initial_data, uploads, role_key: str, missing_message: str,
                     track_years_experience: bool = False, keep_history: bool = False):
    """
    Legacy-aligned Skills tab:
    - `skills`: list of codes (string or JSON array)
    - Per-skill certificate upload (must exist if the skill is selected)
    - `years_experience`: simple string bucket stored on the model
    """
    # 1) Parse skills array (accept JSON string or list)
    raw = initial_data.get("skills", vdata.get("skills", []))
    if isinstance(raw, str):
        try:
            skills = json.loads(raw)
        except Exception:
            raise serializers.ValidationError({"skills": "Must be a JSON array or list."})
    else:
        skills = list(raw or [])

    # 2) Years of experience (optional)
    yrs = initial_data.get("years_experience", vdata.get("years_experience", None)) if track_years_experience else None
    if yrs is not None:
        # store as plain string; keep legacy buckets (e.g. '', '0-1', '1-2', '2-3', '3-5', '5+')
        instance.years_experience = (yrs or "").strip()

    cert_map = dict(instance.skill_certificates or {})  # latest file per skill
    user_id = instance.user_id

    # 3) If a skill was unchecked, remove its stored certificate (unless keeping history)
    if not keep_history:
        removed = [code for code in list(cert_map.keys()) if code not in skills]
        for code in removed:
            old_path = (cert_map.get(code) or {}).get("path")
            if old_path:
                try:
                    default_storage.delete(old_path)
                except Exception:
                    pass
            cert_map.pop(code, None)

    # 4) Save any uploaded files for checked skills
    for code, f in uploads.items():
        if code in skills and f:
            # remember old path (if any)
            old_path = (cert_map.get(code) or {}).get("path")

            # save new file (keeps historical versions if you change _save_skill_file to do so)
            saved = save_skill_file(user_id, code, f)

            # delete old file unless keeping history
            if old_path and not keep_history:
                try:
                    default_storage.delete(old_path)
                except Exception:
                    pass

            # record new pointer
            cert_map[code] = {
                "path": saved,
                "uploaded_at": timezone.now().isoformat(),
            }

    # 5) Validation: only skills that require certificates must have one
    required_codes = _required_cert_skill_codes(role_key)
    missing = [code for code in skills if code in required_codes and code not in cert_map]
    if missing:
        raise serializers.ValidationError(
            {"skills": f"{missing_message}{', '.join(missing)}"}
        )

    # 6) Persist changes
    instance.skills = skills
    instance.skill_certificates = cert_map

    # Save only the changed fields; include years_experience if we set it above
    update_fields = ["skills", "skill_certificates"]
    if yrs is not None:
        update_fields.append("years_experience")

    instance.save(update_fields=update_fields)
    return instance
