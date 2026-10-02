from django.apps import apps
from django.test import SimpleTestCase

from client_profile.domains.onboarding import emails as legacy_emails
from client_profile.domains.onboarding import serializers as legacy_serializers
from client_profile.domains.onboarding import views as legacy_views
from onboarding import emails, serializers, views


class OnboardingFacadeContractTests(SimpleTestCase):
    def test_onboarding_is_installed_as_real_django_app(self):
        self.assertEqual(apps.get_app_config("onboarding").name, "onboarding")

    def test_facades_preserve_current_objects(self):
        self.assertIs(views.OwnerOnboardingV2MeView, legacy_views.OwnerOnboardingV2MeView)
        self.assertIs(views.RefereeSubmitResponseView, legacy_views.RefereeSubmitResponseView)
        self.assertIs(
            serializers.PharmacistOnboardingV2Serializer,
            legacy_serializers.PharmacistOnboardingV2Serializer,
        )
        self.assertIs(emails.send_referee_emails, legacy_emails.send_referee_emails)
