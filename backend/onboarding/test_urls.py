from django.test import SimpleTestCase
from django.urls import reverse


class OnboardingUrlOwnershipTests(SimpleTestCase):
    def test_onboarding_paths_keep_legacy_reverse_contract(self):
        expected = {
            "owner-onboarding-me": "/api/v1/owner/onboarding/me/",
            "pharmacist-onboarding-me": "/api/v1/pharmacist/onboarding/me/",
            "otherstaff-onboarding-me": "/api/v1/otherstaff/onboarding/me/",
            "explorer-onboarding-me": "/api/v1/explorer/onboarding/me/",
        }
        for name, path in expected.items():
            self.assertEqual(reverse(f"api_v1:{name}"), path)

        self.assertEqual(
            reverse("api_v1:submit-referee-response", kwargs={"token": "abc"}),
            "/api/v1/onboarding/submit-reference/abc/",
        )
        self.assertEqual(
            reverse("api_v1:referee-reject", kwargs={"token": "abc"}),
            "/api/v1/onboarding/referee-reject/abc/",
        )
