"""Observed legacy cancellation exposure, pending an explicit charge-policy decision."""
from datetime import datetime, time, timedelta
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo
from django.test import override_settings
from django.utils import timezone
from billing import tests as fixtures
from client_profile.characterization_support import client_for
from shifts.models import ShiftSlot, ShiftSlotAssignment


@override_settings(TIME_ZONE='UTC')
class CancellationPolicyEvidence(fixtures.PenaltyMoneyContracts):
    # Inherited money rounding controls stay applicable; these are risk evidence,
    # not certification that the legacy charging policy is approved.
    def amount(self, now, data=None):
        with patch('django.utils.timezone.now', return_value=now), patch(
                'billing.stripe_support.stripe.checkout.Session.create', return_value=fixtures._StripeObject(url='https://checkout.example.test')) as create:
            response = client_for(self.owner).post(self.url, data or {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return create

    def test_request_timezone_changes_threshold_even_for_the_same_store_and_instant(self):
        self.assignment.unit_rate = Decimal('100')
        self.assignment.save(update_fields=['unit_rate'])
        now = timezone.make_aware(datetime.combine(self.slot.date, time(9)), ZoneInfo('Australia/Brisbane')) - timedelta(hours=20)
        self.shift.pharmacy.timezone = 'Australia/Brisbane'
        self.shift.pharmacy.save(update_fields=['timezone'])
        amounts = []
        for zone in ('UTC', 'Australia/Brisbane'):
            with timezone.override(zone):
                amounts.append(self.amount(now).call_args.kwargs['line_items'][0]['price_data']['unit_amount'])
        self.assertEqual(amounts, [500, 1000])

    def test_past_first_occurrence_still_charges_all_assignments_including_later_work(self):
        self.assignment.unit_rate = Decimal('100')
        self.assignment.save(update_fields=['unit_rate'])
        later = ShiftSlot.objects.create(shift=self.shift, date=self.slot.date + timedelta(days=14),
                                         start_time=time(9), end_time=time(17))
        ShiftSlotAssignment.objects.create(shift=self.shift, slot=later, slot_date=later.date,
                                          user=self.assignment.user, unit_rate='100')
        with timezone.override('UTC'):
            call = self.amount(self.now + timedelta(days=2), {'slot_ids': [self.slot.pk]})
        self.assertEqual(call.call_args.kwargs['line_items'][0]['price_data']['unit_amount'], 17000)

    def test_repeated_legacy_requests_can_open_two_sessions_without_obligation_identity(self):
        self.assignment.unit_rate = Decimal('100')
        self.assignment.save(update_fields=['unit_rate'])
        with patch('django.utils.timezone.now', return_value=self.now), patch(
                'billing.stripe_support.stripe.checkout.Session.create', return_value=fixtures._StripeObject(url='https://checkout.example.test')) as create:
            for _ in range(2):
                self.assertEqual(client_for(self.owner).post(self.url, {}, format='json').status_code, 200)
        self.assertEqual(create.call_count, 2)
        self.assertTrue(all('idempotency_key' not in call.kwargs for call in create.call_args_list))
