from django.test import SimpleTestCase

from client_profile.domains.common import access as common_access
from client_profile.domains.orgs import access as org_access


class OrganizationScopeCompatibilityTests(SimpleTestCase):
    def test_common_access_reexports_organization_scope_helpers(self):
        self.assertIs(common_access._collect_org_access_scope, org_access._collect_org_access_scope)
        self.assertIs(common_access._get_org_pharmacies_queryset, org_access._get_org_pharmacies_queryset)
