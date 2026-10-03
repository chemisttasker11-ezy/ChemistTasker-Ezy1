from django.test import SimpleTestCase

from client_profile import models as legacy_models
from client_profile.models import memberships as legacy_membership_module
from memberships import models as membership_models


class MembershipModelCodeOwnershipTests(SimpleTestCase):
    model_names = (
        "Membership",
        "MembershipInviteLink",
        "MembershipApplication",
    )

    def test_membership_model_source_is_owned_by_memberships_module(self):
        for name in self.model_names:
            model = getattr(membership_models, name)
            self.assertEqual(model.__module__, "memberships.models")
            self.assertEqual(model._meta.app_label, "client_profile")
            self.assertIs(getattr(legacy_models, name), model)
            self.assertIs(getattr(legacy_membership_module, name), model)

    def test_django_labels_remain_client_profile_in_code_ownership_phase(self):
        self.assertEqual(membership_models.Membership._meta.label, "client_profile.Membership")
        self.assertEqual(
            membership_models.MembershipApplication._meta.label,
            "client_profile.MembershipApplication",
        )
