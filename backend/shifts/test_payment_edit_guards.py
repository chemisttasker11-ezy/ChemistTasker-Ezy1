from datetime import time, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from client_profile.models import Shift

RATE = patch("shifts.finalize.get_locked_rate_for_slot", return_value=(Decimal("70"), {}))


class _ShiftMixin:
    def make_shift(self):
        from shifts.models import ShiftSlot
        self.owner, self.pharmacy = make_owner_with_pharmacy("Repro204")
        self.day = timezone.localdate() + timedelta(days=3)
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST",
            employment_type="LOCUM", single_user_only=False, payment_status="PENDING",
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift, date=self.day, start_time=time(9), end_time=time(17), rate=Decimal("70"),
            is_recurring=True, recurring_days=list(range(7)), recurring_end_date=self.day + timedelta(days=7),
        )
        RATE.start()
        self.addCleanup(RATE.stop)

    def offer(self, day, status=None):
        from shifts.models import ShiftOffer
        return ShiftOffer.objects.create(shift=self.shift, slot=self.slot, user=make_user("PHARMACIST"),
                                         status=status or ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
                                         offered_slot_date=day)


class Claim3BookedShiftPharmacyMove(_ShiftMixin, TestCase):
    def setUp(self):
        from onboarding.models import OwnerOnboarding
        from organizations.models import Pharmacy
        self.make_shift()
        self.other = Pharmacy.objects.create(name="Repro204 B", abn="51824753556",
                                             owner=OwnerOnboarding.objects.get(user=self.owner))
        self.booked = self.offer(self.day)

    def book(self):
        from shifts.finalize import finalize_shift_offer
        finalize_shift_offer(self.booked)
        self.shift.payment_status = "PAID"
        self.shift.save(update_fields=["payment_status"])

    def patch_pharmacy(self, pharmacy, user=None):
        return client_for(user or self.owner).patch(f"/api/v1/shifts/{self.shift.pk}/",
                                                    {"pharmacy": pharmacy.pk}, format="json")

    def test_claim3_booked_shift_pharmacy_cannot_move_bug(self):
        from shifts.models import ShiftSlotAssignment
        self.book()
        assignment = ShiftSlotAssignment.objects.get(shift=self.shift)
        r = self.patch_pharmacy(self.other)
        self.assertEqual(r.status_code, 400, r.data)
        assignment.refresh_from_db()
        self.assertEqual(assignment.shift.pharmacy_id, self.pharmacy.pk,
                         f"booked assignment moved to another pharmacy (PATCH {r.status_code})")

    def test_claim3_unmanaged_target_refused_control(self):
        stranger_owner, stranger_pharmacy = make_owner_with_pharmacy("Repro204 Stranger")
        self.book()
        r = self.patch_pharmacy(stranger_pharmacy)
        self.assertEqual(r.status_code, 400, r.data)
        self.shift.refresh_from_db()
        self.assertEqual(self.shift.pharmacy_id, self.pharmacy.pk)

    def test_payment_pending_shift_cannot_move(self):
        r = self.patch_pharmacy(self.other)
        self.assertEqual(r.status_code, 400, r.data)
        self.shift.refresh_from_db()
        self.assertEqual(self.shift.pharmacy_id, self.pharmacy.pk)

    def test_unbooked_shift_can_move_to_managed_pharmacy(self):
        from shifts.models import ShiftOffer
        self.booked.status = ShiftOffer.Status.EXPIRED
        self.booked.save(update_fields=['status'])
        r = self.patch_pharmacy(self.other)
        self.assertEqual(r.status_code, 200, r.data)
        self.shift.refresh_from_db()
        self.assertEqual(self.shift.pharmacy_id, self.other.pk)
