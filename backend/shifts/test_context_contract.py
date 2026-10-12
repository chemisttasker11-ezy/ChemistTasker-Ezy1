from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from shifts.context import validate_support, validate_workload_tags
from shifts.serialization.shifts import ShiftSerializer


class ShiftContextContractTests(SimpleTestCase):
    def test_support_counts_are_whole_numbers_in_range(self):
        for count in (True, False, 1.9, '1.9', 0, 21, None):
            with self.assertRaises(ValidationError):
                validate_support([{'role': 'ASSISTANT', 'count': count}])
        self.assertEqual(validate_support([{'role': 'ASSISTANT', 'count': '2'}]),
                         [{'role': 'ASSISTANT', 'count': 2}])

    def test_shift_context_round_trips_codes(self):
        payload = {'workload_tags': ['HIGH_DAA', 'LIMITED_BREAK_COVER'],
                   'support_on_shift': [{'role': 'PHARMACIST', 'count': 1}, {'role': 'TECHNICIAN', 'count': 2}]}
        self.assertEqual(ShiftSerializer(partial=True).to_internal_value(payload), payload)

    def test_existing_workload_information_is_preserved(self):
        codes = validate_workload_tags(['Sole Pharmacist', 'High Script Load', 'Webster Packs'])
        self.assertEqual(codes, ['SOLE_PHARMACIST', 'HIGH_SCRIPT_LOAD', 'HIGH_DAA'])
        self.assertEqual(validate_workload_tags(codes), codes)
