from django.test import SimpleTestCase

from client_profile.domains.shifts import limits as legacy_limits
from client_profile.domains.shifts import pricing as legacy_pricing
from client_profile.domains.shifts import travel as legacy_travel
from shifts import limits, pricing, travel


class ShiftLeafImplementationOwnershipTests(SimpleTestCase):
    def test_legacy_leaf_modules_reexport_shifts_implementations(self):
        self.assertIs(legacy_pricing.get_locked_rate_for_slot, pricing.get_locked_rate_for_slot)
        self.assertIs(legacy_pricing._resolve_shift_bounds, pricing._resolve_shift_bounds)
        self.assertIs(legacy_limits.enforce_public_shift_daily_limit, limits.enforce_public_shift_daily_limit)
        self.assertIs(legacy_travel.normalize_suburb, travel.normalize_suburb)
