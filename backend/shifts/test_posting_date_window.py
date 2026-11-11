from datetime import datetime, timezone
from unittest.mock import patch
from django.test import override_settings
from client_profile.characterization_support import client_for
from shifts.test_shift_posting_contract import ShiftPostingFixture


@override_settings(SECURE_SSL_REDIRECT=False, ALLOWED_HOSTS=['testserver'])
class PostingDateWindowTests(ShiftPostingFixture):
    def test_create_window_for_both_routes_and_pharmacy_zones(self):
        instant = datetime(2026, 1, 31, 13, 30, tzinfo=timezone.utc)
        for zone, day, last in [('Australia/Perth', '2026-01-31', '2026-05-31'), ('Australia/Sydney', '2026-02-01', '2026-06-30')]:
            self.pharmacy.timezone = zone
            self.pharmacy.save(update_fields=['timezone'])
            for route in ('shifts', 'community-shifts'):
                for value, expected in [(day, 201), (last, 201), ('2026-01-30', 400), ('2026-07-01', 400)]:
                    with self.subTest(zone=zone, route=route, date=value), patch('django.utils.timezone.now', return_value=instant):
                        payload = self.payload(slots=[{'date': value, 'start_time': '09:00', 'end_time': '17:00'}])
                        response = client_for(self.owner).post(f'/api/v1/{route}/', payload, format='json')
                        self.assertEqual(response.status_code, expected, response.data)
                        if expected == 400:
                            self.assertIn('slots', response.data)

    def test_existing_shift_can_be_edited_with_historical_slots(self):
        shift_response, _ = self.post_shift()
        self.assertEqual(shift_response.status_code, 201, shift_response.data)
        payload = {'slots': [{'date': '2020-01-01', 'start_time': '09:00', 'end_time': '17:00'}]}
        response = client_for(self.owner).patch(f"/api/v1/shifts/{shift_response.data['id']}/", payload, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def test_recurrence_end_is_also_in_window(self):
        self.pharmacy.timezone = 'Australia/Perth'
        self.pharmacy.save(update_fields=['timezone'])
        slot = {'date': '2026-02-01', 'start_time': '09:00', 'end_time': '17:00', 'is_recurring': True, 'recurring_days': [1], 'recurring_end_date': '2026-06-01'}
        with patch('django.utils.timezone.now', return_value=datetime(2026, 1, 31, 13, 30, tzinfo=timezone.utc)):
            response = client_for(self.owner).post('/api/v1/shifts/', self.payload(slots=[slot]), format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('slots', response.data)
from django.test import SimpleTestCase
from organizations.serializers import anonymize_pharmacy_detail

class AnonymousPharmacyClockTests(SimpleTestCase):
    def test_anonymous_detail_keeps_pharmacy_timezone(self):
        detail = anonymize_pharmacy_detail({'id': 1, 'name': 'Store', 'timezone': 'Australia/Perth', 'state': 'NSW'})
        self.assertEqual(detail['timezone'], 'Australia/Perth')
