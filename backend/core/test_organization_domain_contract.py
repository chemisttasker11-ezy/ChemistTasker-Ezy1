from django.test import SimpleTestCase
from django.urls import reverse

from client_profile.models import Chain, Organization, Pharmacy, PharmacyAdmin, PharmacyClaim
from core.client_profile_api_urls import router


class OrganizationDomainExtractionContractTests(SimpleTestCase):
    expected_tables = {
        Organization: "client_profile_organization",
        Pharmacy: "client_profile_pharmacy",
        PharmacyClaim: "client_profile_pharmacyclaim",
        PharmacyAdmin: "client_profile_pharmacyadmin",
        Chain: "client_profile_chain",
    }

    expected_router_contracts = {
        "organizations": "organization",
        "chains": "chain",
        "pharmacies": "pharmacy",
        "pharmacy-claims": "pharmacy-claim",
        "pharmacy-admins": "pharmacy-admin",
    }

    def test_physical_organization_tables_are_stable(self):
        for model, expected_table in self.expected_tables.items():
            self.assertEqual(model._meta.db_table, expected_table)

    def test_public_organization_router_contract_is_stable(self):
        actual = {
            prefix: basename
            for prefix, _viewset, basename in router.registry
            if prefix in self.expected_router_contracts
        }
        self.assertEqual(actual, self.expected_router_contracts)

    def test_fixed_organization_paths_keep_client_profile_namespace(self):
        self.assertEqual(
            reverse("client_profile:organization-public-detail", kwargs={"slug": "demo-org"}),
            "/api/client-profile/organizations/public/demo-org/",
        )
        self.assertEqual(
            reverse("client_profile:owneronboarding-claim"),
            "/api/client-profile/owner-onboarding/claim/",
        )
