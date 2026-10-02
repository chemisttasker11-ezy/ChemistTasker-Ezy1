"""Backward-compatible import facade for organization models.

Organization model source is owned by `organizations.models`. During this
phase the models retain `Meta.app_label = "client_profile"`, preserving
migration state, ContentTypes and physical table names.
"""
from organizations.models import (
    Chain,
    Organization,
    Pharmacy,
    PharmacyAdmin,
    PharmacyClaim,
    chain_logo_upload_path,
    organization_cover_upload_path,
    pharmacy_cover_upload_path,
    pharmacy_other_doc_upload_path,
    pharmacy_reg_doc_upload_path,
    pharmacy_upload_path,
)

__all__ = [
    "organization_cover_upload_path",
    "pharmacy_upload_path",
    "pharmacy_reg_doc_upload_path",
    "pharmacy_other_doc_upload_path",
    "pharmacy_cover_upload_path",
    "chain_logo_upload_path",
    "Organization",
    "Pharmacy",
    "PharmacyClaim",
    "PharmacyAdmin",
    "Chain",
]
