from django.test import SimpleTestCase

from client_profile.domains.shifts import serializers as legacy_serializers
from shifts import serializers


class ShiftSerializerOwnershipTests(SimpleTestCase):
    def test_legacy_serializers_reexport_shifts_implementations(self):
        for name in (
            "ShiftSerializer",
            "ShiftSlotSerializer",
            "ShiftInterestSerializer",
            "ShiftCounterOfferSerializer",
            "WorkerShiftRequestSerializer",
        ):
            self.assertIs(getattr(legacy_serializers, name), getattr(serializers, name))
