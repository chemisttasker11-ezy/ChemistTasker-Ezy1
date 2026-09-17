from datetime import timedelta
import uuid

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from client_profile.models import Organization, OwnerOnboarding, Pharmacy, RosterPeriod
from workforce.models import RosterOperation, RosterRevisionState
from workforce.roster import get_revision_state, publish_period_command, validate_revision, warning_key


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
