"""Turn the scoped Chief Admins created by pharmacy email onboarding into pharmacy managers: DATA ONLY.

Chief Admin is now an organisation-wide role. Email onboarding (organizations.claims) used to give the invited contact a
Chief Admin organisation membership scoped to the one new pharmacy (job title "Pharmacy Onboarding Admin") next to an
active PharmacyAdmin assignment for that pharmacy. Left alone, every such contact would now reach the whole organisation.

For each membership that is exactly that shape this migration:

* keeps the contact's PharmacyAdmin assignments (an OWNER level on a pharmacy they do not own becomes MANAGER, which has
  the same capabilities; OWNER is reserved for the pharmacy owner);
* deletes the Chief Admin organisation membership (its pharmacy links go with it);
* moves an ORG_STAFF account with no other organisation membership to the PHARMACY_MANAGER account type, the type
  email onboarding now creates (admin dashboard first, own profile type chosen later).

A Chief Admin membership with another job title, no pharmacies, or a pharmacy without an active assignment for the same
user is not touched; a warning names it so an operator can decide. Reversing is a no-op.
"""
import logging

from django.db import migrations

logger = logging.getLogger(__name__)

ONBOARDING_JOB_TITLE = "Pharmacy Onboarding Admin"


def convert_onboarded_chief_admins(apps, schema_editor):
    OrganizationMembership = apps.get_model("users", "OrganizationMembership")
    PharmacyAdmin = apps.get_model("client_profile", "PharmacyAdmin")
    Membership = apps.get_model("client_profile", "Membership")
    User = apps.get_model("users", "User")
    db = schema_editor.connection.alias

    candidates = OrganizationMembership.objects.using(db).filter(
        role="CHIEF_ADMIN",
        job_title=ONBOARDING_JOB_TITLE,
    )
    for membership in candidates:
        pharmacy_ids = set(membership.pharmacies.values_list("id", flat=True))
        assignments = list(
            PharmacyAdmin.objects.using(db)
            .filter(user_id=membership.user_id, pharmacy_id__in=pharmacy_ids, is_active=True)
            .select_related("pharmacy__owner")
        )
        if not pharmacy_ids or {assignment.pharmacy_id for assignment in assignments} != pharmacy_ids:
            logger.warning(
                "Onboarding Chief Admin membership %s kept: its pharmacies do not all have an active admin assignment",
                membership.pk,
            )
            continue

        for assignment in assignments:
            if assignment.membership_id:
                Membership.objects.using(db).filter(
                    pk=assignment.membership_id,
                    role="OWNER",
                ).update(role="CONTACT")
            owner = assignment.pharmacy.owner
            if assignment.admin_level == "OWNER" and getattr(owner, "user_id", None) != membership.user_id:
                assignment.admin_level = "MANAGER"
                assignment.save(update_fields=["admin_level"])

        user_id = membership.user_id
        membership.delete()
        if not OrganizationMembership.objects.using(db).filter(user_id=user_id).exists():
            User.objects.using(db).filter(pk=user_id, role="ORG_STAFF").update(role="PHARMACY_MANAGER")


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0001_squashed_baseline"),
        ("client_profile", "0070_move_roster_out"),
    ]

    operations = [
        migrations.RunPython(convert_onboarded_chief_admins, migrations.RunPython.noop),
    ]
