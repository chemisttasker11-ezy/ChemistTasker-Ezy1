"""Domain boundary: workforce roster vs shifts distribution/escalation."""
from datetime import date, time, timedelta

from django.test import TestCase
from django.utils import timezone
from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from shifts.distribution import (
    is_roster_owned_for_marketplace, marketplace_escalation_block_reason,
    shift_distribution,
)
from shifts.escalation import auto_escalate_due_shifts, allowed_tiers, escalate_shift
from shifts.access import ShiftActionRefused
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment
from workforce.models import RosterActionAudit, RosterPeriod


class ShiftDistributionBoundaryTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Ownership boundary")
        self.day = date.today() + timedelta(days=21)
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            role_needed="PHARMACIST", employment_type="LOCUM",
            visibility="FULL_PART_TIME", is_roster_container=True,
        )
        monday = self.day - timedelta(days=self.day.weekday())
        self.period = RosterPeriod.objects.create(
            pharmacy=self.pharmacy, week_start=monday, created_by=self.owner,
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift, roster_period=self.period, date=self.day,
            start_time=time(9), end_time=time(17),
        )

    def test_roster_period_not_marketplace_published(self):
        self.assertEqual(shift_distribution(self.shift), "ROSTER")
        self.assertTrue(marketplace_escalation_block_reason(self.shift))
        with self.assertRaises(ShiftActionRefused):
            escalate_shift(self.shift, allowed_tiers=allowed_tiers(self.pharmacy),
                           target_visibility="PLATFORM")

    def test_roster_automatic_escalation_does_not_change_audience(self):
        Shift.objects.filter(pk=self.shift.pk).update(
            escalate_to_locum_casual=timezone.now() - timedelta(minutes=5),
        )
        auto_escalate_due_shifts(timezone.now())
        self.shift.refresh_from_db()
        self.assertEqual(self.shift.visibility, "FULL_PART_TIME")

    def test_explicit_manager_release_handoff_retains_same_shift_slot(self):
        worker = make_user("PHARMACIST")
        assn = ShiftSlotAssignment.objects.create(
            shift=self.shift, slot=self.slot, slot_date=self.day,
            user=worker, is_rostered=True,
        )
        # Simulate only the *documented state* of an authorised release; real
        # release command/permission is covered in workforce roster tests.
        assn.delete()
        ShiftSlot.objects.filter(pk=self.slot.pk).update(roster_period=None)
        RosterActionAudit.objects.create(
            pharmacy=self.pharmacy,
            action_type=RosterActionAudit.ActionType.WORKER_RELEASED,
            performed_by=self.owner, target_user=worker,
            details={"shift_id": self.shift.pk},
        )
        self.assertFalse(is_roster_owned_for_marketplace(self.shift))
        self.assertEqual(shift_distribution(self.shift), "INTERNAL_COMMUNITY")
        self.assertEqual(Shift.objects.filter(pk=self.shift.pk).count(), 1)
        self.assertEqual(ShiftSlot.objects.filter(pk=self.slot.pk).count(), 1)

    def test_published_roster_is_never_marked_released_without_handoff(self):
        RosterPeriod.objects.filter(pk=self.period.pk).update(
            status=RosterPeriod.Status.PUBLISHED,
        )
        self.assertTrue(is_roster_owned_for_marketplace(self.shift))

    def test_direct_booking_must_remain_private(self):
        target = make_user("PHARMACIST")
        self.shift.dedicated_user = target
        self.shift.is_roster_container = False
        self.shift.save(update_fields=["dedicated_user", "is_roster_container"])
        ShiftSlot.objects.filter(pk=self.slot.pk).update(roster_period=None)
        self.assertEqual(shift_distribution(self.shift), "DEDICATED")
        with self.assertRaises(ShiftActionRefused):
            escalate_shift(self.shift, allowed_tiers=allowed_tiers(self.pharmacy),
                           target_visibility="PLATFORM")

    def test_favourites_not_visibility_tier(self):
        self.assertNotIn("FAVORITES", allowed_tiers(self.pharmacy))
        self.assertNotIn("FAVOURITES", allowed_tiers(self.pharmacy))
