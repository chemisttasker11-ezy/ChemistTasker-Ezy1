from datetime import date, datetime, time, timezone
from unittest.mock import patch

from django.test import TestCase, override_settings

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_staff_member
from shifts.models import Shift, ShiftSlot, WorkerShiftRequest


@override_settings(SECURE_SSL_REDIRECT=False, ALLOWED_HOSTS=['testserver'])
class SiblingPostingWindowTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy('Posting window')
        self.worker, _ = make_staff_member(self.pharmacy, role='ASSISTANT')
        self.client = client_for(self.owner)
        self.instant = datetime(2026, 1, 31, 13, 30, tzinfo=timezone.utc)

    def post_open(self, day):
        return self.client.post('/api/v1/roster-shifts/create-open-shift/', {
            'pharmacy_id': self.pharmacy.pk, 'role_needed': 'ASSISTANT',
            'slot_date': day, 'start_time': '09:00', 'end_time': '17:00',
        }, format='json')

    def approve(self, day):
        req = WorkerShiftRequest.objects.create(
            pharmacy=self.pharmacy, requested_by=self.worker, role='ASSISTANT',
            slot_date=day, start_time=time(9), end_time=time(17),
        )
        with patch('shifts.worker_requests.async_task'):
            response = self.client.post(f'/api/v1/worker-shift-requests/{req.pk}/approve/')
        req.refresh_from_db()
        return response, req

    def test_open_shift_rejects_dates_outside_window_without_creating(self):
        self.pharmacy.timezone = 'Australia/Sydney'
        self.pharmacy.save(update_fields=['timezone'])
        with patch('django.utils.timezone.now', return_value=self.instant):
            for day in ('2026-01-31', '2026-07-01'):
                with self.subTest(day=day):
                    response = self.post_open(day)
                    self.assertEqual(response.status_code, 400, response.data)
                    self.assertEqual(response.data, {'slots': ['That date has passed. Pick today or later.']})
        self.assertFalse(Shift.objects.filter(pharmacy=self.pharmacy).exists())

    def test_cover_approval_rejects_dates_outside_window_without_mutation(self):
        self.pharmacy.timezone = 'Australia/Sydney'
        self.pharmacy.save(update_fields=['timezone'])
        with patch('django.utils.timezone.now', return_value=self.instant):
            for day in (date(2026, 1, 31), date(2026, 7, 1)):
                with self.subTest(day=day):
                    response, req = self.approve(day)
                    self.assertEqual(response.status_code, 400, response.data)
                    self.assertEqual(response.data, {'slots': ['That date has passed. Pick today or later.']})
                    self.assertEqual(req.status, 'PENDING')
                    self.assertIsNone(req.resolved_at)
        self.assertFalse(Shift.objects.filter(pharmacy=self.pharmacy).exists())

    def test_open_shift_accepts_pharmacy_today(self):
        with patch('django.utils.timezone.now', return_value=self.instant):
            for zone, day in [('Australia/Perth', '2026-01-31'), ('Australia/Sydney', '2026-02-01')]:
                with self.subTest(zone=zone):
                    self.pharmacy.timezone = zone
                    self.pharmacy.save(update_fields=['timezone'])
                    response = self.post_open(day)
                    self.assertEqual(response.status_code, 201, response.data)
                    self.assertTrue(ShiftSlot.objects.filter(pk=response.data['slot_id'], date=day).exists())

    def test_cover_approval_accepts_pharmacy_today(self):
        with patch('django.utils.timezone.now', return_value=self.instant):
            for zone, day in [('Australia/Perth', date(2026, 1, 31)), ('Australia/Sydney', date(2026, 2, 1))]:
                with self.subTest(zone=zone):
                    self.pharmacy.timezone = zone
                    self.pharmacy.save(update_fields=['timezone'])
                    response, req = self.approve(day)
                    self.assertEqual(response.status_code, 200, response.data)
                    self.assertEqual(req.status, 'AUTO_PUBLISHED')
                    self.assertTrue(ShiftSlot.objects.filter(shift__pharmacy=self.pharmacy, date=day).exists())

    def test_historical_roster_slot_can_still_be_edited(self):
        shift = Shift.objects.create(pharmacy=self.pharmacy, created_by=self.owner,
                                     role_needed='ASSISTANT', is_roster_container=True)
        slot = ShiftSlot.objects.create(shift=shift, date=date(2020, 1, 1),
                                        start_time=time(9), end_time=time(17))
        with patch('django.utils.timezone.now', return_value=self.instant):
            response = self.client.patch(f'/api/v1/roster-shifts/{shift.pk}/', {
                'slots': [{'id': slot.pk, 'date': '2020-01-01',
                           'start_time': '09:00', 'end_time': '18:00'}],
            }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        slot.refresh_from_db()
        self.assertEqual(slot.end_time, time(18))
