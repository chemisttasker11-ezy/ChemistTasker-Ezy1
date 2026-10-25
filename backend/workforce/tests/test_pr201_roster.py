"""PR201 Phase 6: B35 cross-tenant roster write regression contracts."""
from datetime import timedelta, time
from django.test import TestCase
from django.utils import timezone
from client_profile.characterization_support import (
    client_for, make_owner_with_pharmacy, make_staff_member,
)
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment


class RosterOwnerTenantWriteContracts(TestCase):
    def setUp(self):
        self.owner_a, self.pharmacy_a = make_owner_with_pharmacy("P6 Roster A")
        self.owner_b, self.pharmacy_b = make_owner_with_pharmacy("P6 Roster B")
        self.worker_b, _ = make_staff_member(self.pharmacy_b, role="ASSISTANT")
        self.worker_a, _ = make_staff_member(self.pharmacy_a, role="ASSISTANT")
        self.day = timezone.localdate() + timedelta(days=21)
        self.shift_b = Shift.objects.create(
            pharmacy=self.pharmacy_b, created_by=self.owner_b,
            role_needed="ASSISTANT", employment_type="FULL_TIME",
            min_hourly_rate=45, max_hourly_rate=60, visibility="FULL_PART_TIME",
        )
        self.shift_a = Shift.objects.create(
            pharmacy=self.pharmacy_a, created_by=self.owner_a,
            role_needed="ASSISTANT", employment_type="FULL_TIME",
            min_hourly_rate=45, max_hourly_rate=60, visibility="FULL_PART_TIME",
        )
        self.slot_b = ShiftSlot.objects.create(
            shift=self.shift_b, date=self.day,
            start_time=time(9, 0), end_time=time(17, 0),
        )
        self.slot_a = ShiftSlot.objects.create(
            shift=self.shift_a, date=self.day,
            start_time=time(9, 0), end_time=time(17, 0),
        )

    def assign(self):
        # Roster-owner has no POST (B35): assignments come from roster flows, so seed one directly.
        return ShiftSlotAssignment.objects.create(
            shift=self.shift_b, slot=self.slot_b, slot_date=self.day, user=self.worker_b, is_rostered=True,
        )

    def test_owner_cannot_create_assignments_through_roster_owner(self):
        response = client_for(self.owner_b).post("/api/v1/roster-owner/", {
            "shift": self.shift_b.pk, "slot": self.slot_b.pk,
            "slot_date": self.day.isoformat(), "user": self.worker_b.pk,
        }, format="json")
        self.assertEqual(response.status_code, 405, response.data)
        self.assertFalse(ShiftSlotAssignment.objects.exists())

    def test_foreign_owner_cannot_patch_or_delete_assignment(self):
        assignment = self.assign()
        url = f"/api/v1/roster-owner/{assignment.pk}/"
        denied = client_for(self.owner_a).patch(
            url, {"user": self.worker_a.pk}, format="json")
        self.assertIn(denied.status_code, (403, 404), denied.data)
        deleted = client_for(self.owner_a).delete(url)
        self.assertIn(deleted.status_code, (403, 404))
        assignment.refresh_from_db()
        self.assertEqual(assignment.user_id, self.worker_b.pk)

    def test_authorized_update_cannot_change_assignment_slot(self):
        assignment = self.assign()
        response = client_for(self.owner_b).patch(
            f"/api/v1/roster-owner/{assignment.pk}/",
            {"slot": self.slot_a.pk}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        assignment.refresh_from_db()
        self.assertEqual(assignment.slot_id, self.slot_b.pk)

    def test_update_rejects_date_outside_slot_occurrences(self):
        assignment = self.assign()
        response = client_for(self.owner_b).patch(
            f"/api/v1/roster-owner/{assignment.pk}/",
            {"slot_date": (self.day + timedelta(days=1)).isoformat()}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        assignment.refresh_from_db()
        self.assertEqual(assignment.slot_date, self.day)
