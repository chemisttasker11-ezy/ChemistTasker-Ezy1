"""Skills of the pharmacist and other-staff onboarding: the shared-core skills catalog, which skills need a
certificate, and the per-skill certificate files (saved per user and skill, old ones deleted when replaced or unchecked).
"""
import json
import os

from django.core.files.storage import default_storage
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers

from infrastructure.file_validation import DOCUMENT_UPLOAD_POLICY, validate_uploaded_file
from core.task_queue import async_task
from onboarding.services.skill_identity import canonical_skill, registry

def _load_skills_catalog():
    return registry()


def _required_cert_skill_codes(role_key: str) -> set[str]:
    catalog = _load_skills_catalog()
    if "skills" not in catalog:
        role = catalog.get(role_key, {})
        return {
            item.get("code")
            for group in ("clinical_services", "dispense_software", "expanded_scope")
            for item in role.get(group, [])
            if item.get("requires_certificate") and item.get("code")
        }
    return {skill["code"] for skill in catalog.get("skills", []) if skill.get("certificate")}


def _role_for_skills(instance, role_key: str):
    if role_key == "pharmacist":
        return "PHARMACIST"
    return str(getattr(instance, "role_type", "") or "").upper()


def _canonical_skills(instance, requested: list[str], role_key: str) -> list[str]:
    catalog = _load_skills_catalog()
    if not isinstance(catalog.get('skills'), list):
        from django.core.exceptions import ImproperlyConfigured
        raise ImproperlyConfigured('Canonical skills registry is required for onboarding claims')
    skills = {item["code"]: item for item in catalog.get("skills", [])}
    allowed = {"PHARMACIST", "INTERN", "TECHNICIAN", "ASSISTANT", "STUDENT"}
    role = _role_for_skills(instance, role_key)
    if role not in allowed:
        if requested:
            raise serializers.ValidationError({"skills": "Select your valid professional role before claiming skills."})
        return requested

    result = []
    # Previously saved codes remain readable, but do not grant new professional claims.
    previous = set(instance.skills or [])
    previous_codes = {canonical_skill(value) or value for value in previous}
    deprecated = set(catalog.get("legacy_evidence_only", []))
    for raw in requested:
        code = canonical_skill(raw) or raw
        item = skills.get(code)
        if raw in deprecated and raw in previous:
            # Insurance documents were historically stored among skills.
            result.append(raw)
            continue
        if not item:
            raise serializers.ValidationError({'skills': f'Unknown skill: {raw}.'})
        if not item or item.get("eligibility", {}).get(role, 'none') == "none":
            # Prevent previously saved stale options from being used as new claims.
            if code in previous_codes:
                if code not in result:
                    result.append(code)
                continue
            raise serializers.ValidationError({"skills": f"Skill {raw} cannot be claimed for role {role}."})
        if code not in result:
            result.append(code)
    return result


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


def apply_skills_tab(instance, vdata: dict, *, initial_data, uploads, role_key: str,
                     track_years_experience: bool = False, keep_history: bool = False):
    """
    Legacy-aligned Skills tab:
    - `skills`: list of codes (string or JSON array)
    - Per-skill certificate upload (optional evidence: earns the skill's badge once checked)
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
        skills = raw if raw is not None else []

    if not isinstance(skills, list) or not all(isinstance(value, str) for value in skills):
        raise serializers.ValidationError({'skills': 'Skills must be a list of strings.'})

    skills = _canonical_skills(instance, skills, role_key)
    # Upload paths must use the same canonical key as a selected skill.
    # This also accepts historic code aliases without losing the attached proof.
    uploads = {canonical_skill(code) or code: file_obj for code, file_obj in uploads.items()}

    yrs = initial_data.get("years_experience", vdata.get("years_experience", None)) if track_years_experience else None
    if yrs is not None:
        instance.years_experience = (yrs or "").strip()

    original_cert_map = dict(instance.skill_certificates or {})
    # Re-key historic proof alongside its historic claim. Prefer a canonical
    # entry if both canonical and alias paths exist; do not delete retained proof.
    cert_map = {}
    for code, meta in sorted(original_cert_map.items(), key=lambda entry: canonical_skill(entry[0]) == entry[0]):
        cert_map[canonical_skill(code) or code] = meta
    user_id = instance.user_id

    # Work out which persisted certificates remain logically available without
    # mutating storage. An upload for a selected skill also satisfies the
    # certificate requirement before it is written.
    if not keep_history:
        for code in list(cert_map):
            if code not in skills:
                cert_map.pop(code, None)

    # A role-eligible skill may be claimed without evidence. Certificate absence
    # affects its verification signal, never whether the claim can be saved.

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
                if (canonical_skill(code) or code) not in skills:
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

    # A new upload is "check pending" until the document check (or admin) records a result on its entry.
    for code, meta in cert_map.items():
        if meta.get("path") in newly_saved_paths:
            async_task("onboarding.tasks.verify_skill_certificate_task", instance._meta.model_name, instance.pk, code, meta["path"])

    return instance
