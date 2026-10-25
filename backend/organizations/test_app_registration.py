from django.apps import apps
from django.test import SimpleTestCase


class OrganizationAppRegistrationTests(SimpleTestCase):
    def test_organizations_is_installed_as_real_django_app(self):
        self.assertEqual(apps.get_app_config("organizations").name, "organizations")
