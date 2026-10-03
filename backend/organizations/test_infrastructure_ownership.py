from django.test import SimpleTestCase

from client_profile.domains.orgs import access as legacy_access
from client_profile.domains.orgs import timezone as legacy_timezone
from organizations import access, timezone


class OrganizationInfrastructureOwnershipTests(SimpleTestCase):
    def test_legacy_access_reexports_organizations_contract(self):
        for name in (
            "pharmacies_user_admins",
            "has_admin_capability",
            "can_manage_roster",
            "can_manage_staff",
            "_collect_org_access_scope",
            "_get_org_pharmacies_queryset",
        ):
            self.assertIs(getattr(legacy_access, name), getattr(access, name))

    def test_legacy_timezone_reexports_organizations_contract(self):
        self.assertIs(legacy_timezone.get_pharmacy_timezone, timezone.get_pharmacy_timezone)
