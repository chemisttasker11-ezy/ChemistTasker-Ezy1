from datetime import timedelta
import uuid

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from client_profile.models import Organization, OwnerOnboarding, Pharmacy
from workforce.models import RosterPeriod
from workforce.models import RosterOperation, RosterRevisionState
from workforce.roster.revisions import (
    get_revision_state,
    publish_period_command,
    validate_revision,
    warning_key,
)


class RosterRevisionTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(username="roster_owner", email="roster-owner@example.invalid", role="OWNER")
        org = Organization.objects.create(name="Roster Test Org")
        profile = OwnerOnboarding.objects.create(user=self.owner, role="PHARMACIST", phone_number="0400000001", organization=org)
        self.pharmacy = Pharmacy.objects.create(name="Roster Test Pharmacy", owner=profile, organization=org, timezone="Australia/Brisbane")
        today = __import__("datetime").date.today()
        monday = today - timedelta(days=today.weekday())
        self.period = RosterPeriod.objects.create(pharmacy=self.pharmacy, week_start=monday, created_by=self.owner)

    def test_stale_revision_is_rejected(self):
        state = get_revision_state(self.period)
        state.draft_revision = 4
        state.save(update_fields=["draft_revision"])
        with self.assertRaises(ValidationError):
            validate_revision(self.period, 3)

    def test_warning_key_is_deterministic(self):
        warning = {"type": "AVAILABILITY_CONFLICT", "assignment_id": 9, "user_id": 7, "date": "2026-09-17"}
        self.assertEqual(warning_key(warning), warning_key(dict(warning)))

    def test_publish_operation_is_idempotent_for_same_request(self):
        state = get_revision_state(self.period)
        operation_id = str(uuid.uuid4())
        first = publish_period_command(
            user=self.owner,
            period=self.period,
            expected_revision=state.draft_revision,
            operation_id=operation_id,
            acknowledged_warning_keys=[],
        )
        second = publish_period_command(
            user=self.owner,
            period=self.period,
            expected_revision=state.draft_revision,
            operation_id=operation_id,
            acknowledged_warning_keys=[],
        )
        self.assertEqual(first, second)
        self.assertEqual(RosterOperation.objects.filter(operation_id=operation_id).count(), 1)

    def coverage_with_assignment(self, start, end):
        from datetime import time
        from client_profile.models import Shift, ShiftSlot, ShiftSlotAssignment
        from workforce.models import CoverageRequirement
        from workforce.roster.revisions import _coverage_for_week

        CoverageRequirement.objects.create(pharmacy=self.pharmacy, weekday=0, start_time=time(9), end_time=time(17),
                                           role="PHARMACIST", minimum_staff=1)
        worker = get_user_model().objects.create(username="cover_omar", email="omar@example.invalid", role="PHARMACIST")
        shift = Shift.objects.create(pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST")
        slot = ShiftSlot.objects.create(shift=shift, date=self.period.week_start, start_time=start, end_time=end)
        assignment = ShiftSlotAssignment.objects.create(shift=shift, slot=slot, slot_date=slot.date, user=worker)
        return _coverage_for_week(self.pharmacy, self.period.week_start, [assignment])[0]

    def test_partly_staffed_requirement_is_not_covered(self):
        # C027-N2: one hour of a pharmacist does not cover a 09:00-17:00 requirement.
        from datetime import time
        row = self.coverage_with_assignment(time(9), time(10))
        self.assertEqual((row["is_covered"], row["shortfall"]), (False, 1))

    def test_fully_staffed_requirement_is_covered(self):
        from datetime import time
        row = self.coverage_with_assignment(time(8), time(18))
        self.assertEqual((row["is_covered"], row["shortfall"], row["scheduled_staff"]), (True, 0, 1))
