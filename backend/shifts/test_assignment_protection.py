"""Refuse roster writes and shift deletion that would destroy booked occurrences."""
from django.test import TestCase
from client_profile.characterization_support import client_for, make_user
from shifts.models import Shift
from shifts.test_payment_edit_guards import _ShiftMixin


class AssignmentProtectionTests(_ShiftMixin, TestCase):
    def setUp(self):
        self.make_shift()

    def assignments(self, day=None):
        from shifts.models import ShiftSlotAssignment
        qs = ShiftSlotAssignment.objects.filter(slot=self.slot)
        return qs.filter(slot_date=day) if day else qs

    def staff(self, employment_type="FULL_TIME"):
        from client_profile.models import Membership
        user = make_user("PHARMACIST")
        Membership.objects.create(user=user, pharmacy=self.pharmacy, role="PHARMACIST",
                                  employment_type=employment_type, status=Membership.Status.ACCEPTED, is_active=True)
        return user

    def book(self, offer):
        from shifts.finalize import finalize_shift_offer
        finalize_shift_offer(offer)
        Shift.objects.filter(pk=self.shift.pk).update(payment_status="PAID")

    def test_i2_manual_assign_free_occurrence_control(self):
        staff = self.staff()
        r = client_for(self.owner).post(f"/api/v1/shifts/{self.shift.pk}/manual-assign/", {
            "user_id": staff.pk, "assignments": [{"slot_id": self.slot.pk, "slot_date": str(self.day)}]}, format="json")
        self.assertEqual(r.status_code, 200, r.content[:300])

    def test_i2_manual_assign_over_booked_occurrence_refused(self):
        booked = self.offer(self.day)
        self.book(booked)
        staff = self.staff()
        r = client_for(self.owner).post(f"/api/v1/shifts/{self.shift.pk}/manual-assign/", {
            "user_id": staff.pk, "assignments": [{"slot_id": self.slot.pk, "slot_date": str(self.day)}]}, format="json")
        row = self.assignments(self.day).get()
        self.assertEqual(row.user_id, booked.user_id,
                         f"manual-assign ({r.status_code}) silently replaced the paid booking's worker")
        self.assertIn(r.status_code, (400, 409))

    def test_i2_manual_assign_over_payment_pending_occurrence_refused(self):
        self.offer(self.day)
        staff = self.staff()
        r = client_for(self.owner).post(f"/api/v1/shifts/{self.shift.pk}/manual-assign/", {
            "user_id": staff.pk, "assignments": [{"slot_id": self.slot.pk, "slot_date": str(self.day)}]}, format="json")
        self.assertNotEqual(r.status_code, 200, "occurrence with a checkout in flight was rostered to someone else")
        self.assertIn(r.status_code, (400, 409))
        self.assertEqual(self.assignments().count(), 0)

    def test_i2_booked_shift_delete(self):
        self.book(self.offer(self.day))
        r = client_for(self.owner).delete(f"/api/v1/shifts/{self.shift.pk}/")
        self.assertNotEqual(r.status_code, 204, "a booked (paid) shift and its assignment were deleted silently")
        self.assertEqual(r.status_code, 409)
        self.assertTrue(Shift.objects.filter(pk=self.shift.pk).exists())
        self.assertEqual(self.assignments().count(), 1)

    def test_i2_manually_rostered_shift_delete(self):
        staff = self.staff()
        Shift.objects.filter(pk=self.shift.pk).update(payment_status="PAID")
        client_for(self.owner).post(f"/api/v1/shifts/{self.shift.pk}/manual-assign/", {
            "user_id": staff.pk, "assignments": [{"slot_id": self.slot.pk, "slot_date": str(self.day)}]}, format="json")
        self.assertEqual(self.assignments(self.day).count(), 1)
        r = client_for(self.owner).delete(f"/api/v1/shifts/{self.shift.pk}/")
        self.assertNotEqual(r.status_code, 204, "a rostered occurrence was deleted with its shift, no refusal")
        self.assertEqual(r.status_code, 409)
        self.assertTrue(Shift.objects.filter(pk=self.shift.pk).exists())
        self.assertEqual(self.assignments().count(), 1)

