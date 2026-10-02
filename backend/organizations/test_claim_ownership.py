from django.test import SimpleTestCase

from client_profile.domains.orgs import claims as legacy_claims
from organizations import claims


class OrganizationClaimOwnershipTests(SimpleTestCase):
    def test_legacy_claims_reexport_organization_implementations(self):
        self.assertIs(legacy_claims.OwnerOnboardingClaim, claims.OwnerOnboardingClaim)
        self.assertIs(legacy_claims.PharmacyClaimViewSet, claims.PharmacyClaimViewSet)
        self.assertIs(legacy_claims._send_pharmacy_created_email, claims._send_pharmacy_created_email)
        self.assertIs(legacy_claims._notify_org_of_claim_response, claims._notify_org_of_claim_response)
