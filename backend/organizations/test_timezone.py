from types import SimpleNamespace

from django.test import SimpleTestCase, override_settings
from django.utils import timezone

from organizations.timezone import get_pharmacy_timezone


@override_settings(TIME_ZONE="UTC")
class PharmacyTimezoneTests(SimpleTestCase):
    def test_all_states_accept_abbreviations_and_full_names_in_any_case(self):
        for abbreviation, name, expected in (
            ("NSW", "New South Wales", "Australia/Sydney"),
            ("VIC", "Victoria", "Australia/Melbourne"),
            ("QLD", "Queensland", "Australia/Brisbane"),
            ("WA", "Western Australia", "Australia/Perth"),
            ("SA", "South Australia", "Australia/Adelaide"),
            ("TAS", "Tasmania", "Australia/Hobart"),
            ("ACT", "Australian Capital Territory", "Australia/Sydney"),
            ("NT", "Northern Territory", "Australia/Darwin"),
        ):
            for state in (abbreviation, abbreviation.lower(), name, f"  {name.swapcase().replace(' ', '  ')} \t"):
                with self.subTest(state=state):
                    pharmacy = SimpleNamespace(timezone=None, state=state, postcode=None)
                    self.assertEqual(str(get_pharmacy_timezone(pharmacy)), expected)

    def test_valid_explicit_zone_wins_over_state_and_broken_hill_postcode(self):
        for explicit in ("Australia/Perth", "UTC", "  Australia/Brisbane  "):
            with self.subTest(explicit=explicit):
                pharmacy = SimpleNamespace(timezone=explicit, state="NSW", postcode="2880")
                self.assertEqual(str(get_pharmacy_timezone(pharmacy)), explicit.strip())
                self.assertEqual(pharmacy.timezone, explicit)

    def test_missing_and_invalid_explicit_zones_use_state_without_mutating_it(self):
        for explicit in (None, "", "  ", "invalid-zone", "../invalid-zone"):
            with self.subTest(explicit=explicit):
                pharmacy = SimpleNamespace(timezone=explicit, state=" qld ", postcode=None)
                self.assertEqual(str(get_pharmacy_timezone(pharmacy)), "Australia/Brisbane")
                self.assertEqual(pharmacy.timezone, explicit)

    def test_broken_hill_postcode_takes_precedence_over_state(self):
        for state in ("NSW", "New South Wales", "QLD", None, "unknown"):
            for postcode in ("2880", " 2880 ", 2880):
                with self.subTest(state=state, postcode=postcode):
                    pharmacy = SimpleNamespace(timezone="invalid-zone", state=state, postcode=postcode)
                    self.assertEqual(str(get_pharmacy_timezone(pharmacy)), "Australia/Broken_Hill")

    def test_other_postcodes_keep_state_timezone(self):
        for postcode in (None, "", "2000", "28800"):
            with self.subTest(postcode=postcode):
                pharmacy = SimpleNamespace(timezone=None, state="NSW", postcode=postcode)
                self.assertEqual(str(get_pharmacy_timezone(pharmacy)), "Australia/Sydney")

    @override_settings(TIME_ZONE="Australia/Perth")
    def test_unknown_and_null_locations_use_settings_not_the_active_timezone(self):
        with timezone.override("Australia/Sydney"):
            for pharmacy in (None, SimpleNamespace(), *(
                SimpleNamespace(timezone="invalid-zone", state=state, postcode=None)
                for state in (None, "", "  ", "unknown")
            )):
                with self.subTest(pharmacy=pharmacy):
                    self.assertEqual(str(get_pharmacy_timezone(pharmacy)), "Australia/Perth")
