from django.test import SimpleTestCase

from client_profile.domains.onboarding import emails as legacy_emails
from client_profile.domains.onboarding import serializers as legacy_serializers
from client_profile.domains.onboarding import views as legacy_views
from onboarding import emails, serializers, views


class OnboardingImplementationOwnershipTests(SimpleTestCase):
    def test_legacy_modules_reexport_onboarding_implementations(self):
        self.assertIs(legacy_emails.send_referee_emails, emails.send_referee_emails)
        self.assertIs(
            legacy_serializers.PharmacistOnboardingV2Serializer,
            serializers.PharmacistOnboardingV2Serializer,
        )
        self.assertIs(
            legacy_serializers.OtherStaffOnboardingV2Serializer,
            serializers.OtherStaffOnboardingV2Serializer,
        )
        self.assertIs(legacy_views.RefereeSubmitResponseView, views.RefereeSubmitResponseView)
        self.assertIs(legacy_views.OwnerOnboardingV2MeView, views.OwnerOnboardingV2MeView)
