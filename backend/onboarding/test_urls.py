from django.test import SimpleTestCase
from django.urls import reverse


class OnboardingUrlOwnershipTests(SimpleTestCase):
    def test_onboarding_paths_keep_legacy_reverse_contract(self):
        expected = {
            "owner-onboarding-me": "/api/client-profile/owner/onboarding/me/",
            "pharmacist-onboarding-me": "/api/client-profile/pharmacist/onboarding/me/",
            "otherstaff-onboarding-me": "/api/client-profile/otherstaff/onboarding/me/",
            "explorer-onboarding-me": "/api/client-profile/explorer/onboarding/me/",
        }
        for name, path in expected.items():
            self.assertEqual(reverse(f"client_profile:{name}"), path)

        self.assertEqual(
            reverse("client_profile:submit-referee-response", kwargs={"token": "abc"}),
            "/api/client-profile/onboarding/submit-reference/abc/",
        )
        self.assertEqual(
            reverse("client_profile:referee-reject", kwargs={"token": "abc"}),
            "/api/client-profile/onboarding/referee-reject/abc/",
        )
