"""Backward-compatible import facade for onboarding models.

Onboarding model source is owned by `onboarding.models`. During this phase
the models retain `Meta.app_label = "client_profile"`, preserving migration
state, ContentTypes and physical table names.
"""
from onboarding.models import (
    onboarding_upload_path,
    owner_profile_photo_upload_path,
    owner_gov_id_upload_path,
    owner_secondary_id_upload_path,
    pharmacist_profile_photo_upload_path,
    pharmacist_gov_id_upload_path,
    pharmacist_secondary_id_upload_path,
    pharmacist_resume_upload_path,
    otherstaff_profile_photo_upload_path,
    otherstaff_gov_id_upload_path,
    otherstaff_secondary_id_upload_path,
    otherstaff_role_doc_upload_path,
    otherstaff_resume_upload_path,
    explorer_gov_id_upload_path,
    explorer_resume_upload_path,
    explorer_profile_photo_upload_path,
    explorer_secondary_id_upload_path,
    OnboardingNotification,
    OwnerOnboarding,
    PharmacistOnboarding,
    OtherStaffOnboarding,
    ExplorerOnboarding,
    RefereeResponse,
)

__all__ = [
    "onboarding_upload_path",
    "owner_profile_photo_upload_path",
    "owner_gov_id_upload_path",
    "owner_secondary_id_upload_path",
    "pharmacist_profile_photo_upload_path",
    "pharmacist_gov_id_upload_path",
    "pharmacist_secondary_id_upload_path",
    "pharmacist_resume_upload_path",
    "otherstaff_profile_photo_upload_path",
    "otherstaff_gov_id_upload_path",
    "otherstaff_secondary_id_upload_path",
    "otherstaff_role_doc_upload_path",
    "otherstaff_resume_upload_path",
    "explorer_gov_id_upload_path",
    "explorer_resume_upload_path",
    "explorer_profile_photo_upload_path",
    "explorer_secondary_id_upload_path",
    "OnboardingNotification",
    "OwnerOnboarding",
    "PharmacistOnboarding",
    "OtherStaffOnboarding",
    "ExplorerOnboarding",
    "RefereeResponse",
]
