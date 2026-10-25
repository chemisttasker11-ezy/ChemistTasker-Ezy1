"""Escalating a roster shift (POST roster-shifts/<id>/escalate/): the roster assignments are cleared only when the
escalation happens. A refused escalation (invalid target, already at that level, daily public quota, published roster)
leaves the shift and its assignments untouched."""
from datetime import datetime, time, timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import BASE, client_for, make_owner_with_pharmacy, make_user
from shifts.limits import MAX_PUBLIC_SHIFTS_PER_DAY
from client_profile.models import Shift, ShiftSlot, ShiftSlotAssignment
from workforce.models import RosterPeriod


class RosterShiftEscalationTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        today = timezone.localdate()
        self.monday = today - timedelta(days=today.weekday()) + timedelta(days=28)
        self.period = RosterPeriod.objects.create(pharmacy=self.pharmacy, week_start=self.monday, created_by=self.owner)
        self.shift = self.make_shift(visibility="FULL_PART_TIME")
        self.slot = ShiftSlot.objects.create(
            shift=self.shift, date=self.monday, start_time=time(9), end_time=time(17), roster_period=self.period)
        self.assignment = ShiftSlotAssignment.objects.create(
            shift=self.shift, slot=self.slot, slot_date=self.monday, user=make_user("PHARMACIST"), is_rostered=True)
        self.url = BASE + f"roster-shifts/{self.shift.id}/escalate/"

    def make_shift(self, **extra):
        return Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST", employment_type="LOCUM", **extra)

    def escalate(self, target):
        return client_for(self.owner).post(self.url, {"target_visibility": target}, format="json")

    def assert_untouched(self):
        self.shift.refresh_from_db()
        self.assertEqual(self.shift.visibility, "FULL_PART_TIME")
        self.assertTrue(ShiftSlotAssignment.objects.filter(pk=self.assignment.pk).exists())

    def test_a_valid_escalation_clears_the_assignments(self):
        res = self.escalate("LOCUM_CASUAL")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"detail": "Shift escalated to LOCUM_CASUAL and is now unassigned."})
        self.shift.refresh_from_db()
        self.assertEqual(self.shift.visibility, "LOCUM_CASUAL")
        self.assertFalse(ShiftSlotAssignment.objects.filter(shift=self.shift).exists())

    def test_an_invalid_or_pointless_target_keeps_the_assignments(self):
        res = self.escalate("NOWHERE")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(
            res.json(), {"detail": "Invalid target_visibility. Must be one of ['FULL_PART_TIME', 'LOCUM_CASUAL', 'PLATFORM']."})
        self.assert_untouched()
        res = self.escalate("FULL_PART_TIME")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json(), {"detail": "Shift is already at or above that visibility level."})
        self.assert_untouched()

    def test_the_daily_public_quota_keeps_the_assignments(self):
        for _ in range(MAX_PUBLIC_SHIFTS_PER_DAY):
            self.make_shift(visibility="PLATFORM")
        res = self.escalate("PLATFORM")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(
            res.json(),
            {"detail": f"Maximum of {MAX_PUBLIC_SHIFTS_PER_DAY} public shifts per day reached for {self.pharmacy.name}."})
        self.assert_untouched()

    def test_a_shift_in_a_published_roster_is_refused_with_400_and_keeps_the_assignments(self):
        RosterPeriod.objects.filter(pk=self.period.pk).update(status=RosterPeriod.Status.PUBLISHED)
        res = self.escalate("LOCUM_CASUAL")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(
            res.json(),
            {"detail": ["Cannot change a shift in a published roster. Unpublish the roster period before editing it."]})
        self.assert_untouched()

    def add_leave_history(self):
        from workforce.models import WorkforceLeaveRequest
        start = timezone.make_aware(datetime.combine(self.monday, time(9)))
        WorkforceLeaveRequest.objects.create(
            pharmacy=self.pharmacy, user=self.assignment.user, slot_assignment=self.assignment,
            leave_type="SICK", start_at=start, end_at=start + timedelta(hours=8))

    def test_escalation_and_removal_refuse_an_assignment_with_leave_history(self):
        # F02-N3: neither roster path may silently drop an assignment that carries history.
        self.add_leave_history()
        res = self.escalate("LOCUM_CASUAL")
        self.assertEqual(res.status_code, 400, res.content)
        self.assert_untouched()
        res = client_for(self.owner).delete(BASE + f"roster-owner/{self.assignment.pk}/")
        self.assertEqual(res.status_code, 400, res.content)
        self.assert_untouched()

    def test_escalation_and_removal_tell_the_worker(self):
        with mock.patch("workforce.roster.views.notify_shift_users") as notify:
            res = client_for(self.owner).delete(BASE + f"roster-owner/{self.assignment.pk}/")
        self.assertEqual(res.status_code, 204, res.content)
        self.assertEqual(notify.call_args.args[0], [self.assignment.user])
        self.assignment = ShiftSlotAssignment.objects.create(
            shift=self.shift, slot=self.slot, slot_date=self.monday, user=make_user("PHARMACIST"), is_rostered=True)
        with mock.patch("workforce.roster.views.notify_shift_users") as notify:
            res = self.escalate("LOCUM_CASUAL")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(notify.call_args.args[0], [self.assignment.user])
        self.assertEqual(notify.call_args.kwargs["kind"], "shift_unassigned")
