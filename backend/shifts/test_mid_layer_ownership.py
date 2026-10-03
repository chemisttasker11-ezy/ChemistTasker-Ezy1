from django.test import SimpleTestCase

from client_profile.domains.shifts import engagement as legacy_engagement
from client_profile.domains.shifts import finalize as legacy_finalize
from shifts import engagement, finalize


class ShiftMidLayerOwnershipTests(SimpleTestCase):
    def test_legacy_modules_reexport_shifts_implementations(self):
        self.assertIs(legacy_engagement.staff_assignment_defaults, engagement.staff_assignment_defaults)
        self.assertIs(legacy_engagement.build_shift_engagement_terms, engagement.build_shift_engagement_terms)
        self.assertIs(legacy_finalize.finalize_shift_offer, finalize.finalize_shift_offer)
