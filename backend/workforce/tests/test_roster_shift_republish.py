"""One shift of a published roster week: unpublish, edit, republish with a notification choice (owner decision)."""
from datetime import date, time, timedelta
from unittest import mock

from django.core.exceptions import PermissionDenied, ValidationError
from django.test import TestCase

from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from memberships.models import Membership
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment
from workforce.models import RosterActionAudit, RosterPeriod
from workforce.roster.publication import (
    get_worker_published_roster,
    republish_roster_shift,
    unpublish_roster_shift,
)


class RosterShiftRepublishTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Roster Pharmacy")
        self.week = date(2030, 1, 7)  # a Monday
        self.period = RosterPeriod.objects.create(pharmacy=self.pharmacy, week_start=self.week, created_by=self.owner)
        self.workers = [make_user("PHARMACIST"), make_user("PHARMACIST")]
        self.slots = []
        for offset, worker in enumerate(self.workers):
            Membership.objects.create(user=worker, pharmacy=self.pharmacy, role="PHARMACIST",
                                      employment_type="FULL_TIME", status=Membership.Status.ACCEPTED, is_active=True)
            shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST", created_by=self.owner)
            day = self.week + timedelta(days=offset)
            slot = ShiftSlot.objects.create(shift=shift, date=day, start_time=time(9), end_time=time(17))
            ShiftSlotAssignment.objects.create(shift=shift, slot=slot, slot_date=day, user=worker, is_rostered=True)
            self.slots.append(slot)
        RosterPeriod.objects.filter(pk=self.period.pk).update(status=RosterPeriod.Status.PUBLISHED)

    def test_unpublish_edit_republish_one_shift(self):
        slot, worker = self.slots[0], self.workers[0]
        with self.assertRaises(ValidationError):
            slot.end_time = time(18)
            slot.save()

        with self.assertRaises(PermissionDenied):
            unpublish_roster_shift(slot, worker)
        unpublish_roster_shift(slot, self.owner)
        self.assertEqual(get_worker_published_roster(worker), [], "a shift being edited is hidden from its worker")
        self.assertEqual(len(get_worker_published_roster(self.workers[1])), 1, "the rest of the week stays published")

        slot.refresh_from_db()
        slot.end_time = time(18)
        slot.save()  # editable while unpublished

        with mock.patch("notifications.services.notify_users") as notify, self.captureOnCommitCallbacks(execute=True):
            republish_roster_shift(slot, self.owner, notify="worker")
        self.assertEqual([call.args[0] for call in notify.call_args_list], [[worker.pk]])
        self.assertEqual(len(get_worker_published_roster(worker)), 1)
        with self.assertRaises(ValidationError):
            slot.refresh_from_db()
            slot.save()  # published again: locked
        self.assertEqual(
            list(RosterActionAudit.objects.values_list("action_type", flat=True).order_by("created_at")),
            ["SHIFT_UNPUBLISHED", "SHIFT_REPUBLISHED"],
        )

    def test_republish_can_notify_the_whole_team_or_nobody(self):
        slot = self.slots[0]
        unpublish_roster_shift(slot, self.owner)
        with mock.patch("notifications.services.notify_users") as notify, self.captureOnCommitCallbacks(execute=True):
            republish_roster_shift(slot, self.owner, notify="team")
        self.assertEqual({call.args[0][0] for call in notify.call_args_list}, {w.pk for w in self.workers})

        unpublish_roster_shift(slot, self.owner)
        with mock.patch("notifications.services.notify_users") as notify, self.captureOnCommitCallbacks(execute=True):
            republish_roster_shift(slot, self.owner, notify="none")
        notify.assert_not_called()
        with self.assertRaises(ValidationError):
            republish_roster_shift(slot, self.owner)
