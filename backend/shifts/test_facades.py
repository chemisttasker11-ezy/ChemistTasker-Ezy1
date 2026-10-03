from django.apps import apps
from django.test import SimpleTestCase

from client_profile.domains.shifts import base as legacy_base
from client_profile.domains.shifts import pricing as legacy_pricing
from client_profile.domains.shifts import serializers as legacy_serializers
from shifts import base, pricing, serializers


class ShiftFacadeContractTests(SimpleTestCase):
    def test_shifts_is_installed_as_a_real_django_app(self):
        self.assertEqual(apps.get_app_config("shifts").name, "shifts")

    def test_facade_preserves_core_shift_objects(self):
        self.assertIs(base.BaseShiftViewSet, legacy_base.BaseShiftViewSet)
        self.assertIs(base.PUBLIC_LEVEL, legacy_base.PUBLIC_LEVEL)
        self.assertIs(pricing.get_locked_rate_for_slot, legacy_pricing.get_locked_rate_for_slot)
        self.assertIs(pricing._decimal_hours, legacy_pricing._decimal_hours)
        self.assertIs(serializers.ShiftSerializer, legacy_serializers.ShiftSerializer)
