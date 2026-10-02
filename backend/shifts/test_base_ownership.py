from django.test import SimpleTestCase

from client_profile.domains.shifts import base as legacy_base
from shifts import base


class ShiftBaseOwnershipTests(SimpleTestCase):
    def test_legacy_base_reexports_shifts_implementation(self):
        self.assertIs(legacy_base.BaseShiftViewSet, base.BaseShiftViewSet)
        self.assertIs(legacy_base._shift_roles_visible_to_user, base._shift_roles_visible_to_user)
        self.assertEqual(legacy_base.PUBLIC_LEVEL, base.PUBLIC_LEVEL)
        self.assertEqual(legacy_base.COMMUNITY_LEVELS, base.COMMUNITY_LEVELS)
