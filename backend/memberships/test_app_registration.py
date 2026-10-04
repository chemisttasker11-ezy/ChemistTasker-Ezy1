from django.apps import apps
from django.test import SimpleTestCase


class MembershipAppRegistrationTests(SimpleTestCase):
    def test_memberships_is_installed_as_real_django_app(self):
        self.assertEqual(apps.get_app_config("memberships").name, "memberships")
