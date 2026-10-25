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


class ReplacementTermsContracts(TestCase):
    """C027-N1: an approved replacement is paid on their own terms, not the departing worker's."""

    def setUp(self):
        from memberships.models import Membership
        from workforce.roster.worker_actions import submit_cover_request

        self.owner, self.pharmacy = make_owner_with_pharmacy("Replacement Terms")
        self.omar, self.omar_membership = make_staff_member(self.pharmacy, role="ASSISTANT")
        Membership.objects.filter(pk=self.omar_membership.pk).update(employment_type="FULL_TIME")
        self.ben, ben_membership = make_staff_member(self.pharmacy, role="ASSISTANT")
        Membership.objects.filter(pk=ben_membership.pk).update(employment_type="LOCUM")
        self.sara, self.sara_membership = make_staff_member(self.pharmacy, role="ASSISTANT")
        Membership.objects.filter(pk=self.sara_membership.pk).update(employment_type="PART_TIME")
        day = timezone.localdate() + timedelta(days=21)
        shift = Shift.objects.create(pharmacy=self.pharmacy, created_by=self.owner, role_needed="ASSISTANT",
                                     employment_type="FULL_TIME", visibility="FULL_PART_TIME",
                                     min_hourly_rate=45, max_hourly_rate=60)
        slot = ShiftSlot.objects.create(shift=shift, date=day, start_time=time(9), end_time=time(17))
        self.assignment = ShiftSlotAssignment.objects.create(
            shift=shift, slot=slot, slot_date=day, user=self.omar, is_rostered=True,
            settlement_channel="TIMESHEET_ONLY", engagement_kind="STAFF_EMPLOYMENT",
            engagement_terms_snapshot={"membership_id": self.omar_membership.pk, "employment_type": "FULL_TIME"},
        )
        self.req, _ = submit_cover_request(self.assignment, self.omar)

    def test_locum_member_cannot_inherit_the_departing_staff_terms(self):
        from django.core.exceptions import ValidationError
        from workforce.roster.worker_actions import approve_cover_replacement

        with self.assertRaisesMessage(ValidationError, "Only direct full-time, part-time or casual pharmacy staff"):
            approve_cover_replacement(self.req, self.ben, self.owner)
        self.assignment.refresh_from_db()
        self.req.refresh_from_db()
        self.assertEqual(self.assignment.user_id, self.omar.pk)
        self.assertEqual(self.assignment.engagement_terms_snapshot["membership_id"], self.omar_membership.pk)
        self.assertEqual(self.req.status, "PENDING")

    def test_staff_replacement_gets_their_own_terms(self):
        from workforce.roster.worker_actions import approve_cover_replacement

        approve_cover_replacement(self.req, self.sara, self.owner)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.user_id, self.sara.pk)
        self.assertEqual(self.assignment.engagement_terms_snapshot["membership_id"], self.sara_membership.pk)
        self.assertEqual(self.assignment.engagement_terms_snapshot["employment_type"], "PART_TIME")


class WorkerRosterDisclosureContracts(TestCase):
    """B37 / C045-N2: coworkers see who works when, never pay, email or leave details."""

    def setUp(self):
        from memberships.models import Membership
        from workforce.models import WorkforceLeaveRequest

        self.owner, self.pharmacy = make_owner_with_pharmacy("Roster Disclosure")
        self.omar, membership = make_staff_member(self.pharmacy, role="ASSISTANT")
        self.ali, _ = make_staff_member(self.pharmacy, role="ASSISTANT")
        self.pending, _ = make_staff_member(self.pharmacy, role="ASSISTANT", status=Membership.Status.PENDING)
        self.contact, _ = make_staff_member(self.pharmacy, role="CONTACT")
        day = timezone.localdate() + timedelta(days=21)
        shift = Shift.objects.create(pharmacy=self.pharmacy, created_by=self.owner, role_needed="ASSISTANT",
                                     employment_type="FULL_TIME", visibility="FULL_PART_TIME",
                                     min_hourly_rate=45, max_hourly_rate=60)
        slot = ShiftSlot.objects.create(shift=shift, date=day, start_time=time(9), end_time=time(17))
        self.assignment = ShiftSlotAssignment.objects.create(
            shift=shift, slot=slot, slot_date=day, user=self.omar, is_rostered=True, unit_rate=42)
        start = timezone.now() + timedelta(days=21)
        WorkforceLeaveRequest.objects.create(
            pharmacy=self.pharmacy, membership=membership, user=self.omar, slot_assignment=self.assignment,
            leave_type="COMPASSIONATE", start_at=start, end_at=start + timedelta(hours=8), note="Private family matter")

    def rows(self, user):
        response = client_for(user).get(f"/api/v1/roster-worker/?pharmacy={self.pharmacy.pk}")
        self.assertEqual(response.status_code, 200, response.data)
        data = response.data["results"] if isinstance(response.data, dict) else response.data
        return [row for row in data if row["id"] == self.assignment.pk]

    def test_coworker_sees_only_that_omar_is_on_leave(self):
        [row] = self.rows(self.ali)
        self.assertEqual(row["leave_request"], {"status": "PENDING"})
        self.assertIsNone(row["unit_rate"])
        self.assertEqual(row["user_detail"]["email"], "")

    def test_pending_and_contact_memberships_see_no_roster(self):
        self.assertEqual(self.rows(self.pending), [])
        self.assertEqual(self.rows(self.contact), [])

    def test_omar_sees_his_own_leave_details(self):
        [row] = self.rows(self.omar)
        self.assertEqual(row["leave_request"]["note"], "Private family matter")
        self.assertEqual(row["user_detail"]["email"], self.omar.email)
