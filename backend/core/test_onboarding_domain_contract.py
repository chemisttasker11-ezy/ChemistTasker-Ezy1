from django.test import SimpleTestCase
from django.urls import reverse

from client_profile.models import (
    ExplorerOnboarding,
    OnboardingNotification,
    OtherStaffOnboarding,
    OwnerOnboarding,
    PharmacistOnboarding,
    RefereeResponse,
)
from client_profile.tasks import final_evaluation, run_all_verifications, run_referee_reminder


class OnboardingDomainExtractionContractTests(SimpleTestCase):
    expected_tables = {
        OnboardingNotification: "client_profile_onboardingnotification",
        OwnerOnboarding: "client_profile_owneronboarding",
        PharmacistOnboarding: "client_profile_pharmacistonboarding",
        OtherStaffOnboarding: "client_profile_otherstaffonboarding",
        ExplorerOnboarding: "client_profile_exploreronboarding",
        RefereeResponse: "client_profile_refereeresponse",
    }

    def test_physical_onboarding_tables_are_stable(self):
        for model, expected_table in self.expected_tables.items():
            self.assertEqual(model._meta.db_table, expected_table)

    def test_public_onboarding_paths_keep_client_profile_namespace(self):
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

    def test_onboarding_celery_task_names_are_stable(self):
        self.assertEqual(run_all_verifications.name, "client_profile.tasks.run_all_verifications")
        self.assertEqual(final_evaluation.name, "client_profile.tasks.final_evaluation")
        self.assertEqual(run_referee_reminder.name, "client_profile.tasks.run_referee_reminder")
