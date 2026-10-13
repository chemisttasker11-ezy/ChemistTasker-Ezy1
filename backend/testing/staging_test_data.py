"""Isolated, idempotent ChemistTasker staging accounts for frontend acceptance.

Never import customer data or publish passwords. The deployment feeds a private
JSON document on stdin. The module is inert unless explicitly called.
"""
import json
import os
import sys

from django.conf import settings
from django.db import connection, transaction
from django.utils import timezone

from memberships.models import Membership
from onboarding.models import (
    ExplorerOnboarding, OtherStaffOnboarding, OwnerOnboarding, PharmacistOnboarding,
)
from organizations.models import Organization, Pharmacy, PharmacyAdmin
from users.models import OrganizationMembership, User

PERSONAS = {
    "owner": ("OWNER", "Demo Owner", None),
    "organization_admin": ("ORG_STAFF", "Demo Organisation Admin", None),
    "pharmacist": ("PHARMACIST", "Demo Pharmacist", "PHARMACIST"),
    "intern": ("OTHER_STAFF", "Demo Intern", "INTERN"),
    "technician": ("OTHER_STAFF", "Demo Technician", "TECHNICIAN"),
    "assistant": ("OTHER_STAFF", "Demo Assistant", "ASSISTANT"),
    "student": ("OTHER_STAFF", "Demo Student", "STUDENT"),
    "explorer": ("EXPLORER", "Demo Explorer", None),
}
DOMAIN = "staging.chemisttasker.test"
MARKER = "STAGING DEMO"


def demo_email(persona):
    return persona + "@" + DOMAIN


def require_staging_database():
    """Fail closed before reading credentials or writing any database rows."""
    if os.environ.get("APP_ENV", "").lower() != "staging":
        raise RuntimeError("Test user seeding requires APP_ENV=staging.")
    if os.environ.get("STAGING_TEST_DATA_ENABLED") != "1":
        raise RuntimeError("Staging test data must be explicitly enabled.")
    if os.environ.get("USE_PROD_DB", "").lower() not in {"false", "0"}:
        raise RuntimeError("Production DB selection must be explicitly disabled.")
    if settings.DEBUG:
        raise RuntimeError("Staging seeding must not run in DEBUG mode.")
    db = connection.settings_dict
    if (connection.vendor != "postgresql"
            or db.get("NAME") != "chemisttasker_staging"
            or db.get("USER") != "chemisttasker_staging"
            or db.get("HOST") != "postgres"):
        raise RuntimeError("Expected only the isolated staging PostgreSQL database.")


def validate_credentials(data):
    if not isinstance(data, dict) or set(data) != set(PERSONAS):
        raise ValueError("Expected credentials for exactly eight staging personas.")
    for persona, item in data.items():
        if not isinstance(item, dict) or set(item) != {"email", "password"}:
            raise ValueError("Invalid credential record for " + persona)
        if item["email"] != demo_email(persona):
            raise ValueError("Unexpected staging account email for " + persona)
        if not isinstance(item["password"], str) or len(item["password"]) < 24:
            raise ValueError("Staging passwords must contain at least 24 characters.")
    return data


def _get_demo_user(persona, credential):
    role, name, _ = PERSONAS[persona]
    email = demo_email(persona)
    user = User.objects.filter(email=email).first()
    if user is None:
        return User.objects.create_user(
            email=email, password=credential["password"], role=role,
            first_name=name, last_name=MARKER,
            is_otp_verified=True, is_mobile_verified=True,
            accepted_terms=True, accepted_terms_at=timezone.now(),
        )
    # Do not take over a real account that happened to use the reserved address.
    if (user.role != role or user.last_name != MARKER
            or user.is_staff or user.is_superuser or not user.is_active):
        raise RuntimeError("Reserved staging account collision: " + email)
    updates = []
    if not user.check_password(credential["password"]):
        user.set_password(credential["password"])
        updates.append("password")
    if not user.is_otp_verified:
        user.is_otp_verified = True
        updates.append("is_otp_verified")
    if not user.is_mobile_verified:
        user.is_mobile_verified = True
        updates.append("is_mobile_verified")
    if not user.accepted_terms:
        user.accepted_terms = True
        user.accepted_terms_at = timezone.now()
        updates.extend(["accepted_terms", "accepted_terms_at"])
    if updates:
        user.save(update_fields=updates)
    return user


def _get_staff_membership(user, pharmacy, role):
    member, created = Membership.objects.get_or_create(
        user=user, pharmacy=pharmacy,
        defaults={"role": role, "employment_type": "CASUAL",
                  "status": Membership.Status.ACCEPTED, "is_active": True},
    )
    if not created and (member.role != role or
                        member.status != Membership.Status.ACCEPTED or
                        not member.is_active):
        raise RuntimeError("Existing staging member was modified; refusing overwrite.")
    return member


@transaction.atomic
def seed_demo_data(credentials):
    """Create eight synthetic personas and demo pharmacy relationships.

    Generic profile verification is simulated for staging only. No professional
    registration number, identity proof or certificate is ever fabricated.
    """
    validate_credentials(credentials)
    users = {key: _get_demo_user(key, credentials[key]) for key in PERSONAS}
    owner = users["owner"]
    onboarding, _ = OwnerOnboarding.objects.get_or_create(
        user=owner,
        defaults={"phone_number": "0400000000", "role": "MANAGER",
                  "number_of_pharmacies": 2,
                  "submitted_for_verification": True, "verified": True},
    )
    org, _ = Organization.objects.get_or_create(
        slug="chemisttasker-staging-demo",
        defaults={"name": "ChemistTasker STAGING DEMO Organisation"},
    )
    if org.name != "ChemistTasker STAGING DEMO Organisation":
        raise RuntimeError("Demo organisation collides with unrelated data.")
    if onboarding.organization_id not in (None, org.pk):
        raise RuntimeError("Demo owner has an unrelated organisation.")
    if onboarding.organization_id is None:
        onboarding.organization = org
        onboarding.save(update_fields=["organization"])

    pharmacies = []
    for name, suburb, postcode in (
        ("ChemistTasker STAGING DEMO Gold Coast", "Southport", "4215"),
        ("ChemistTasker STAGING DEMO Brisbane", "Brisbane City", "4000"),
    ):
        pharmacy, _ = Pharmacy.objects.get_or_create(
            name=name,
            defaults={"owner": onboarding, "organization": org,
                      "suburb": suburb, "state": "QLD",
                      "postcode": postcode, "verified": True},
        )
        if pharmacy.owner_id != onboarding.pk or pharmacy.organization_id != org.pk:
            raise RuntimeError("Demo pharmacy collides with unrelated data.")
        pharmacies.append(pharmacy)
        assignment, created = PharmacyAdmin.objects.get_or_create(
            user=owner, pharmacy=pharmacy,
            defaults={"admin_level": PharmacyAdmin.AdminLevel.OWNER, "is_active": True},
        )
        if not created and (
            assignment.admin_level != PharmacyAdmin.AdminLevel.OWNER
            or not assignment.is_active
        ):
            raise RuntimeError("Unexpected demo owner admin assignment.")

    org_member, created = OrganizationMembership.objects.get_or_create(
        user=users["organization_admin"], organization=org,
        defaults={"role": "ORG_ADMIN", "admin_level": PharmacyAdmin.AdminLevel.MANAGER},
    )
    if not created and org_member.role != "ORG_ADMIN":
        raise RuntimeError("Unexpected demo organisation role.")

    pharmacist = users["pharmacist"]
    PharmacistOnboarding.objects.get_or_create(
        user=pharmacist,
        defaults={"verified": True, "submitted_for_verification": True,
                  "short_bio": "Synthetic staging pharmacist. Not a real credential."},
    )
    _get_staff_membership(pharmacist, pharmacies[0], "PHARMACIST")

    for persona in ("intern", "technician", "assistant", "student"):
        role_type = PERSONAS[persona][2]
        profile, _ = OtherStaffOnboarding.objects.get_or_create(
            user=users[persona],
            defaults={"role_type": role_type, "verified": True,
                      "submitted_for_verification": True,
                      "classification_level": "LEVEL_2" if role_type == "ASSISTANT" else None,
                      "student_year": "YEAR_2" if role_type == "STUDENT" else None,
                      "intern_half": "FIRST_HALF" if role_type == "INTERN" else None,
                      "short_bio": "Synthetic staging-only " + role_type.lower() + "."},
        )
        if profile.role_type != role_type:
            raise RuntimeError("Unexpected other-staff subtype.")
        _get_staff_membership(users[persona], pharmacies[0], role_type)

    ExplorerOnboarding.objects.get_or_create(
        user=users["explorer"],
        defaults={"role_type": "JUNIOR", "verified": True,
                  "submitted_for_verification": True,
                  "short_bio": "Synthetic staging-only explorer."},
    )
    return users


def seed_from_stdin():
    require_staging_database()
    try:
        credentials = validate_credentials(json.load(sys.stdin))
    except (ValueError, TypeError) as exc:
        raise RuntimeError("Invalid staging credential JSON; no users were seeded.") from exc
    users = seed_demo_data(credentials)
    print("STAGING_TEST_USERS=READY (" + str(len(users)) + " synthetic accounts)")
