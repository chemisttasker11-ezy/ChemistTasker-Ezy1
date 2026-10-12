import json

from django.http import QueryDict
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from organizations.serializers import PharmacySerializer


class PharmacyProfileContractTests(SimpleTestCase):
    def test_pharmacy_context_accepts_multipart_json(self):
        form = QueryDict('', mutable=True)
        form.update({'software': json.dumps(['WinIFRED']), 'services': json.dumps(['VACCINATION', 'VACCINATION']),
                     'script_volume_weekday': 'BUSY', 'script_volume_weekend': 'QUIET'})
        attrs = PharmacySerializer(partial=True).to_internal_value(form)
        self.assertEqual(attrs['software'], ['FRED'])
        self.assertEqual(attrs['services'], ['VACCINATION'])
        self.assertEqual(attrs['script_volume_weekday'], 'BUSY')
        self.assertEqual(attrs['script_volume_weekend'], 'QUIET')

    def test_optional_pharmacy_fields_can_be_cleared(self):
        attrs = PharmacySerializer(partial=True).to_internal_value({
            'software': [], 'services': [], 'script_volume_weekday': '', 'script_volume_weekend': ''})
        self.assertEqual(attrs['services'], [])
        self.assertEqual(attrs['script_volume_weekday'], '')

    def test_invalid_services_and_script_bands_are_rejected(self):
        for payload in ({'services': ['FRED']}, {'services': {'VACCINATION': True}},
                        {'script_volume_weekend': 'unknown'}, {'software': ['VACCINATION']}):
            with self.assertRaises(ValidationError):
                PharmacySerializer(partial=True).to_internal_value(payload)
