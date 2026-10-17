"""D04 safety contracts: hard deletion is not paid shift cancellation."""
from datetime import date, time, timedelta
from decimal import Decimal

from django.test import TestCase
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from shifts.models import Shift, ShiftSlot, ShiftOffer, ShiftInterest


class ShiftDeletionSafetyTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Delete guard pharmacy")
        self.worker = make_user("PHARMACIST")
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            role_needed="PHARMACIST", employment_type="LOCUM",
            visibility="LOCUM_CASUAL",
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift, date=date.today() + timedelta(days=10),
            start_time=time(9, 0), end_time=time(17, 0), rate=Decimal("70.00"),
        )
        self.url = f"/api/v1/shifts/{self.shift.pk}/"

    def test_pristine_shift_can_still_be_deleted(self):
        response = client_for(self.owner).delete(self.url)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Shift.objects.filter(pk=self.shift.pk).exists())

    def test_pending_offer_blocks_hard_delete_and_slot_replacement(self):
        offer = ShiftOffer.objects.create(
            shift=self.shift, slot=self.slot, user=self.worker,
            status=ShiftOffer.Status.PENDING,
        )
        response = client_for(self.owner).delete(self.url)
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Shift.objects.filter(pk=self.shift.pk).exists())
        self.assertTrue(ShiftOffer.objects.filter(pk=offer.pk).exists())
        response = client_for(self.owner).patch(self.url, {
            "slots": [{
                "date": str(date.today() + timedelta(days=11)),
                "start_time": "09:00", "end_time": "17:00", "rate": "75.00",
            }],
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(ShiftSlot.objects.filter(pk=self.slot.pk).exists())

    def test_candidate_interest_blocks_hard_delete(self):
        interest = ShiftInterest.objects.create(
            shift=self.shift, slot=self.slot, user=self.worker,
        )
        response = client_for(self.owner).delete(self.url)
        self.assertEqual(response.status_code, 400)
        self.assertTrue(ShiftInterest.objects.filter(pk=interest.pk).exists())

    def test_pending_payment_blocks_hard_delete(self):
        self.shift.payment_status = "PENDING"
        self.shift.save(update_fields=["payment_status"])
        response = client_for(self.owner).delete(self.url)
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Shift.objects.filter(pk=self.shift.pk).exists())

    def test_unrelated_user_cannot_delete_unengaged_shift(self):
        response = client_for(self.worker).delete(self.url)
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Shift.objects.filter(pk=self.shift.pk).exists())
