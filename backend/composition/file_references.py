"""Application-owned file references; configured after every domain's models load.

Keep the model imports explicit. This registry is application composition, not generic infrastructure.
"""
from infrastructure.serializer_lifecycle import configure_file_references
from chat.models import Message
from onboarding.models import ExplorerOnboarding, OtherStaffOnboarding, OwnerOnboarding, PharmacistOnboarding
from organizations.models import Chain, Organization, Pharmacy
from pharmacy_hub.models import PharmacyHubAttachment


FILE_REFERENCES = (
    (OwnerOnboarding, "profile_photo"),
    (PharmacistOnboarding, "profile_photo"),
    (PharmacistOnboarding, "government_id"),
    (PharmacistOnboarding, "identity_secondary_file"),
    (PharmacistOnboarding, "resume"),
    (OtherStaffOnboarding, "profile_photo"),
    (OtherStaffOnboarding, "government_id"),
    (OtherStaffOnboarding, "identity_secondary_file"),
    (OtherStaffOnboarding, "ahpra_proof"),
    (OtherStaffOnboarding, "hours_proof"),
    (OtherStaffOnboarding, "certificate"),
    (OtherStaffOnboarding, "university_id"),
    (OtherStaffOnboarding, "cpr_certificate"),
    (OtherStaffOnboarding, "s8_certificate"),
    (OtherStaffOnboarding, "resume"),
    (ExplorerOnboarding, "profile_photo"),
    (ExplorerOnboarding, "government_id"),
    (ExplorerOnboarding, "identity_secondary_file"),
    (ExplorerOnboarding, "resume"),
    (Organization, "cover_image"),
    (Pharmacy, "methadone_s8_protocols"),
    (Pharmacy, "qld_sump_docs"),
    (Pharmacy, "sops"),
    (Pharmacy, "induction_guides"),
    (Pharmacy, "cover_image"),
    (Chain, "logo"),
    (Message, "attachment"),
    (PharmacyHubAttachment, "file"),
)


def configure_file_cleanup():
    configure_file_references(FILE_REFERENCES)
