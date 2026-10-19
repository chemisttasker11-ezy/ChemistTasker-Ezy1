from django.test import SimpleTestCase

from client_profile import models as legacy_models
from client_profile.models import onboarding as legacy_onboarding_module
from onboarding import models as onboarding_models


class OnboardingModelCodeOwnershipTests(SimpleTestCase):
    model_names = (
        "OnboardingNotification",
        "OwnerOnboarding",
        "PharmacistOnboarding",
        "OtherStaffOnboarding",
        "ExplorerOnboarding",
        "RefereeResponse",
    )

    def test_onboarding_model_source_is_owned_by_onboarding_module(self):
        for name in self.model_names:
            model = getattr(onboarding_models, name)
            self.assertEqual(model.__module__, "onboarding.models")
            self.assertEqual(model._meta.app_label, "client_profile")
            self.assertIs(getattr(legacy_models, name), model)
            self.assertIs(getattr(legacy_onboarding_module, name), model)

    def test_django_labels_remain_client_profile_in_code_ownership_phase(self):
        self.assertEqual(
            onboarding_models.OwnerOnboarding._meta.label,
            "client_profile.OwnerOnboarding",
        )
        self.assertEqual(
            onboarding_models.RefereeResponse._meta.label,
            "client_profile.RefereeResponse",
        )
