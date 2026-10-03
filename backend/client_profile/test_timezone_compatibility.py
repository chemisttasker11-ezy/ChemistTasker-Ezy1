from django.test import SimpleTestCase

import client_profile.timezone_utils as legacy
from client_profile.domains.orgs import timezone as org_timezone


class PharmacyTimezoneCompatibilityTests(SimpleTestCase):
    def test_legacy_timezone_helper_reexports_domain_interface(self):
        self.assertIs(legacy.get_pharmacy_timezone, org_timezone.get_pharmacy_timezone)
