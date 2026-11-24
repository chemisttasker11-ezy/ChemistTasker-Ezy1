from datetime import time
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from client_profile.characterization_support import client_for
from shifts.pricing import calculate_shift_rates, get_locked_rate_for_slot
from shifts.test_shift_posting_contract import DAY, ShiftPostingFixture
from shifts.models import Shift


class RateIntegrityTests(ShiftPostingFixture):
    def test_missing_fixed_rate_is_rejected_on_post_and_edit(self):
        slots = [{'date': str(DAY), 'start_time': '09:00', 'end_time': '17:00'}]
        response, _ = self.post_shift(rate_type='FIXED', slots=slots)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('fixed_rate', response.data)
        self.assertFalse(Shift.objects.exists())

        response, _ = self.post_shift(rate_type='FLEXIBLE', slots=slots)
        self.assertEqual(response.status_code, 201, response.data)
        response = client_for(self.owner).patch(f'/api/v1/shifts/{response.data["id"]}/',
                                                 {'role_needed': 'PHARMACIST', 'rate_type': 'FIXED'}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('fixed_rate', response.data)

    def test_pricing_error_preserves_rate_reason_contract(self):
        shift = SimpleNamespace(role_needed='ASSISTANT')
        slot = SimpleNamespace(date=DAY, start_time=time(9), end_time=time(17))
        with mock.patch('shifts.pricing._price_shift_segments', side_effect=KeyError('missing rate')):
            for rate, reason in (get_locked_rate_for_slot(slot, shift, None),
                                 calculate_shift_rates(shift, DAY, slot.start_time, slot.end_time)):
                self.assertEqual(rate, Decimal('0.00'))
                self.assertIn('error', reason)

    def test_zero_preview_rate_is_rejected_on_post_and_edit(self):
        slots = [{'date': str(DAY), 'start_time': '09:00', 'end_time': '17:00', 'rate': '0.00'}]
        response, _ = self.post_shift(slots=slots)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('slots', response.data)
        response, _ = self.post_shift()
        self.assertEqual(response.status_code, 201, response.data)
        shift_id = response.data['id']
        response = client_for(self.owner).patch(f'/api/v1/shifts/{shift_id}/', {'slots': slots}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('slots', response.data)

    def test_timesheet_only_zero_is_preserved(self):
        shift = SimpleNamespace(role_needed='ASSISTANT')
        slot = SimpleNamespace(date=DAY, start_time=time(9), end_time=time(17))
        rate, reason = get_locked_rate_for_slot(slot, shift, None, staff_terms={'settlement_channel': 'TIMESHEET_ONLY'})
        self.assertEqual(rate, Decimal('0.00'))
        self.assertEqual(reason['settlement_channel'], 'TIMESHEET_ONLY')
        response, _ = self.post_shift(employment_type='CASUAL', slots=[{
            'date': str(DAY), 'start_time': '09:00', 'end_time': '17:00', 'rate': '0.00',
        }])
        self.assertEqual(response.status_code, 201, response.data)

    def test_fixed_rate_still_posts(self):
        response, _ = self.post_shift(rate_type='FIXED', fixed_rate='90.00')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Shift.objects.get(pk=response.data['id']).fixed_rate, Decimal('90.00'))
