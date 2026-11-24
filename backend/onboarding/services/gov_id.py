"""Record government ID decisions and remove the documents those decisions cover."""
import logging

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from onboarding.models import ExplorerOnboarding, GovIdCheckMethod, OtherStaffOnboarding, OwnerOnboarding, PharmacistOnboarding

logger = logging.getLogger(__name__)

ID_MODELS = (OwnerOnboarding, PharmacistOnboarding, OtherStaffOnboarding, ExplorerOnboarding)
ID_FILES = ("government_id", "identity_secondary_file")
ID_EVIDENCE = (*ID_FILES, "government_id_type", "identity_meta")
RESULT_FIELDS = (
    "gov_id_verified", "gov_id_verification_note", "gov_id_checked_at", "gov_id_check_method", "gov_id_checked_by_id",
)
# Before timestamps, the OCR task wrote a nonblank note on rejection and a true flag on approval.
RECORDED = Q(gov_id_checked_at__isnull=False) | Q(gov_id_verified=True) | Q(gov_id_verification_note__regex=r"\S")


def has_gov_id_result(profile):
    return bool(
        getattr(profile, "gov_id_checked_at", None)
        or getattr(profile, "gov_id_verified", False)
        or (getattr(profile, "gov_id_verification_note", "") or "").strip()
    )


def reset_gov_id_result(profile):
    for field, value in zip(RESULT_FIELDS, (False, "", None, "", None)):
        setattr(profile, field, value)
    return RESULT_FIELDS


def _id_files(profile):
    files = []
    for field in ID_FILES:
        file = getattr(profile, field)
        if file:
            files.append((field, file.storage, file.name))
    return files


def _purge_id_files(profile, files, using):
    deleted = failed = 0
    for field, storage, name in files:
        # Legacy role upgrades can share a storage key across two profiles.
        references = [model.objects.using(using).filter(**{field: name}) for model in ID_MODELS]
        if not any(rows.exclude(RECORDED).exists() for rows in references):
            try:
                storage.delete(name)
            except Exception:
                logger.warning("Could not delete a stored government ID document.")
                failed += 1
                continue
            deleted += 1
        for rows in references:
            rows.filter(RECORDED).update(**{field: None})
        if getattr(profile, field).name == name:
            setattr(profile, field, None)
    return deleted, failed


def record_gov_id_result(profile, verified, method, checked_by=None, note="", *, only_if_pending=False):
    """A null checker with the automatic OCR method represents the system."""
    using = profile._state.db
    files = _id_files(profile)
    if method == GovIdCheckMethod.ADMIN_REVIEW and not verified and not (note or "").strip():
        note = "Government ID rejected during admin review."
    result = {
        "gov_id_verified": verified,
        "gov_id_verification_note": (note or "")[:255],
        "gov_id_checked_at": timezone.now(),
        "gov_id_check_method": method,
        "gov_id_checked_by_id": checked_by.pk if checked_by is not None else None,
    }
    rows = type(profile).objects.using(using).filter(pk=profile.pk)
    if only_if_pending:
        # OCR runs outside the transaction. Discard its result if the document or decision changed meanwhile.
        evidence = {field: getattr(profile, field).name for field in ID_FILES}
        evidence.update(government_id_type=profile.government_id_type, identity_meta=profile.identity_meta)
        rows = rows.exclude(RECORDED).filter(**evidence)
    if rows.update(**result):
        for field, value in result.items():
            setattr(profile, field, value)
        transaction.on_commit(lambda: _purge_id_files(profile, files, using), using=using)


def purge_recorded_gov_id_files(*, apply=False):
    candidates = deleted = failed = 0
    for model in ID_MODELS:
        with_files = Q()
        for field in ID_FILES:
            with_files |= Q(**{f"{field}__isnull": False}) & ~Q(**{field: ""})
        rows = model.objects.filter(RECORDED, with_files)
        for pk in rows.values_list("pk", flat=True).iterator():
            profile = rows.filter(pk=pk).first()
            if profile is not None:
                files = _id_files(profile)
                candidates += len(files)
                if apply:
                    removed, errors = _purge_id_files(profile, files, rows.db)
                    deleted += removed
                    failed += errors
    return candidates, deleted, failed
