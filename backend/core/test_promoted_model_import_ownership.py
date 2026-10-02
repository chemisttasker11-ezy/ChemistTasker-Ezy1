from django.test import SimpleTestCase

from chat import serializers as chat_serializers
from memberships import models as membership_models
from organizations import models as organization_models
from pharmacy_hub import serializers as hub_serializers
from shifts import models as shift_models


class PromotedModelImportOwnershipTests(SimpleTestCase):
    def test_chat_uses_membership_owned_model(self):
        self.assertIs(chat_serializers.Membership, membership_models.Membership)

    def test_hub_uses_domain_owned_models(self):
        self.assertIs(hub_serializers.Membership, membership_models.Membership)
        self.assertIs(hub_serializers.Pharmacy, organization_models.Pharmacy)
        self.assertIs(hub_serializers.Organization, organization_models.Organization)

    def test_shift_domain_models_remain_authoritative(self):
        self.assertEqual(shift_models.Shift._meta.app_label, "client_profile")
        self.assertEqual(shift_models.ShiftSlotAssignment._meta.app_label, "client_profile")
