from django.test import SimpleTestCase

from client_profile.domains.orgs import views as legacy_views
from organizations import views


class OrganizationViewOwnershipTests(SimpleTestCase):
    def test_legacy_views_reexport_organization_implementations(self):
        for name in (
            "OrganizationViewSet",
            "PharmacyViewSet",
            "PharmacyAdminViewSet",
            "ChainViewSet",
            "PublicOrganizationDetailView",
        ):
            self.assertIs(getattr(legacy_views, name), getattr(views, name))
