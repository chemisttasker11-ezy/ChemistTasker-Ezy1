"""Organisation role scope: Org Admin and Chief Admin reach every pharmacy of their organisation; Region Admin only its
assigned pharmacies."""
from django.test import TestCase

from organizations.models import Organization, Pharmacy
from users.models import OrganizationMembership, User
from users.org_roles import (
    ORG_WIDE_ADMIN_ROLES,
    ROLE_DEFINITIONS,
    membership_has_org_wide_scope,
    membership_visible_pharmacy_ids,
    role_capabilities,
)


class OrgRoleScopeTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Scope Org", slug="scope-org")
        self.north = Pharmacy.objects.create(name="North", organization=self.organization)
        self.south = Pharmacy.objects.create(name="South", organization=self.organization)
        Pharmacy.objects.create(name="Elsewhere", organization=Organization.objects.create(name="Other", slug="other"))

    def membership(self, role, pharmacies=()):
        user = User.objects.create_user(email=f"{role.lower()}@scope.test", password=None, role="ORG_STAFF")
        membership = OrganizationMembership.objects.create(user=user, organization=self.organization, role=role)
        membership.pharmacies.set(pharmacies)
        return membership

    def test_org_wide_roles(self):
        self.assertEqual(set(ORG_WIDE_ADMIN_ROLES), {"ORG_ADMIN", "CHIEF_ADMIN"})
        self.assertEqual(role_capabilities("CHIEF_ADMIN"), role_capabilities("ORG_ADMIN"))
        self.assertFalse(ROLE_DEFINITIONS["CHIEF_ADMIN"].requires_pharmacies)
        self.assertTrue(ROLE_DEFINITIONS["REGION_ADMIN"].requires_pharmacies)

    def test_visible_pharmacies_per_role(self):
        org_wide = {self.north.id, self.south.id}
        for role in ("ORG_ADMIN", "CHIEF_ADMIN"):
            with self.subTest(role=role):
                membership = self.membership(role, [self.north])
                self.assertTrue(membership_has_org_wide_scope(membership))
                self.assertEqual(set(membership_visible_pharmacy_ids(membership)), org_wide)
        region = self.membership("REGION_ADMIN", [self.north])
        self.assertFalse(membership_has_org_wide_scope(region))
        self.assertEqual(membership_visible_pharmacy_ids(region), [self.north.id])
