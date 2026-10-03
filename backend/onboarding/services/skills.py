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

    Storage mutations happen only after certificate validation. Superseded files
    are deleted only after the new DB pointer is saved.
    """
    raw = initial_data.get("skills", vdata.get("skills", []))
    if isinstance(raw, str):
        try:
            skills = json.loads(raw)
        except Exception:
            raise serializers.ValidationError({"skills": "Must be a JSON array or list."})
    else:
        skills = list(raw or [])

    yrs = initial_data.get("years_experience", vdata.get("years_experience", None)) if track_years_experience else None
    if yrs is not None:
        instance.years_experience = (yrs or "").strip()

    original_cert_map = dict(instance.skill_certificates or {})
    cert_map = dict(original_cert_map)
    user_id = instance.user_id

    # Work out which persisted certificates remain logically available without
    # mutating storage. An upload for a selected skill also satisfies the
    # certificate requirement before it is written.
    if not keep_history:
        for code in list(cert_map):
            if code not in skills:
                cert_map.pop(code, None)

    uploaded_codes = {code for code, file_obj in uploads.items() if code in skills and file_obj}
    required_codes = _required_cert_skill_codes(role_key)
    missing = [
        code for code in skills
        if code in required_codes and code not in cert_map and code not in uploaded_codes
    ]
    if missing:
        raise serializers.ValidationError(
            {"skills": f"{missing_message}{', '.join(missing)}"}
        )

    newly_saved_paths = []
    old_paths_to_delete = []
    try:
        # Persist replacement uploads only after validation has succeeded.
        for code, file_obj in uploads.items():
            if code not in skills or not file_obj:
                continue
            old_path = (cert_map.get(code) or {}).get("path")
            saved = save_skill_file(user_id, code, file_obj)
            newly_saved_paths.append(saved)
            cert_map[code] = {
                "path": saved,
                "uploaded_at": timezone.now().isoformat(),
            }
            if old_path and not keep_history and old_path != saved:
                old_paths_to_delete.append(old_path)

        if not keep_history:
            for code, meta in original_cert_map.items():
                if code not in skills:
                    old_path = (meta or {}).get("path")
                    if old_path:
                        old_paths_to_delete.append(old_path)

        instance.skills = skills
        instance.skill_certificates = cert_map
        update_fields = ["skills", "skill_certificates"]
        if yrs is not None:
            update_fields.append("years_experience")
        instance.save(update_fields=update_fields)
    except Exception:
        # The old DB pointers remain authoritative if persistence failed.
        for path in newly_saved_paths:
            try:
                default_storage.delete(path)
            except Exception:
                pass
        raise

    for path in dict.fromkeys(old_paths_to_delete):
        try:
            default_storage.delete(path)
        except Exception:
            pass

    return instance
