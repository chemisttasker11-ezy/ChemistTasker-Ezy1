from django.apps import apps
from django.test import SimpleTestCase


class OnboardingAppRegistrationTests(SimpleTestCase):
    def test_onboarding_is_installed_as_real_django_app(self):
        self.assertEqual(apps.get_app_config("onboarding").name, "onboarding")
