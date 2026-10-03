from django.apps import apps
from django.test import SimpleTestCase

from client_profile.domains.orgs import access as legacy_access
from client_profile.domains.orgs import serializers as legacy_serializers
from client_profile.domains.orgs import views as legacy_views
from organizations import access, serializers, views


class OrganizationFacadeContractTests(SimpleTestCase):
    def test_organizations_is_installed_as_real_django_app(self):
        self.assertEqual(apps.get_app_config("organizations").name, "organizations")

    def test_facades_preserve_key_objects(self):
        self.assertIs(access.can_manage_roster, legacy_access.can_manage_roster)
        self.assertIs(serializers.PharmacySerializer, legacy_serializers.PharmacySerializer)
        self.assertIs(views.OrganizationViewSet, legacy_views.OrganizationViewSet)
        self.assertIs(views.PharmacyViewSet, legacy_views.PharmacyViewSet)
