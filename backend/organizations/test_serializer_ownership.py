from django.test import SimpleTestCase

from client_profile.domains.orgs import serializers as legacy_serializers
from organizations import serializers


class OrganizationSerializerOwnershipTests(SimpleTestCase):
    def test_legacy_serializers_reexport_organization_implementations(self):
        for name in (
            "OrganizationSerializer",
            "PublicOrganizationSerializer",
            "PharmacySerializer",
            "PharmacyClaimSerializer",
            "PharmacyClaimCreateSerializer",
            "ChainSerializer",
            "PharmacyAdminSerializer",
        ):
            self.assertIs(getattr(legacy_serializers, name), getattr(serializers, name))

    def test_pharmacy_visibility_helper_is_owned_by_organizations(self):
        self.assertIs(
            legacy_serializers.user_can_view_full_pharmacy,
            serializers.user_can_view_full_pharmacy,
        )
