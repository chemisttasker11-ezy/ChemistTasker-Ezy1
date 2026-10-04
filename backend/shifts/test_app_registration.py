from django.apps import apps
from django.test import SimpleTestCase


class ShiftAppRegistrationTests(SimpleTestCase):
    def test_shifts_is_installed_as_a_real_django_app(self):
        self.assertEqual(apps.get_app_config("shifts").name, "shifts")
