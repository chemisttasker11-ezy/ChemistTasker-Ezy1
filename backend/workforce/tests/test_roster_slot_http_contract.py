"""F01 red-first contracts for the request actually sent by roster editors.

Unlike the older positive service tests, these exercise HTTP PATCH through
RosterShiftManageViewSet and do not manually repair assignment dates/periods.
"""
from datetime import date, time, timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from memberships.models import Membership
from shifts.models import Shift, ShiftInterest, ShiftSlot, ShiftSlotAssignment
from workforce.models import RosterPeriod
from workforce.roster.publication import republish_roster_shift, unpublish_roster_shift


class RosterSlotHTTPContractTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("F01 HTTP Pharmacy")
        self.worker = make_user("PHARMACIST")
        Membership.objects.create(
            user=self.worker, pharmacy=self.pharmacy, role="PHARMACIST",
            employment_type="FULL_TIME", status=Membership.Status.ACCEPTED,
            is_active=True,
        )
        self.week = date(2030, 1, 7)
        self.period = RosterPeriod.objects.create(
            pharmacy=self.pharmacy, week_start=self.week, created_by=self.owner,
        )
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            role_needed="PHARMACIST", employment_type="LOCUM",
            visibility="FULL_PART_TIME", rate_type="FIXED",
            fixed_rate=Decimal("60.00"), is_roster_container=True,
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift, date=self.week, start_time=time(9), end_time=time(17),
            roster_period=self.period, planned_break_minutes=30,
            rate=Decimal("59.00"),
        )
        self.accepted_at = timezone.now()
        self.assignment = ShiftSlotAssignment.objects.create(
            shift=self.shift, slot=self.slot, slot_date=self.week,
            user=self.worker, is_rostered=True, unit_rate=Decimal("57.00"),
            rate_reason={"source": "existing_locked_contract"},
            payment_preference_snapshot="TFN", settlement_channel="PAYROLL",
            engagement_kind="STAFF_EMPLOYMENT",
            engagement_terms_snapshot={"version": 1, "source": "preserve_this_snapshot"},
            engagement_terms_accepted_at=self.accepted_at,
        )
        self.interest = ShiftInterest.objects.create(
            shift=self.shift, slot=self.slot, user=self.worker,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.client.raise_request_exception = False
        self.url = f"/api/v1/roster-shifts/{self.shift.pk}/"

    def publish_fixture(self):
        # Build every slot while DRAFT, then exercise production unpublish/PATCH.
        RosterPeriod.objects.filter(pk=self.period.pk).update(status=RosterPeriod.Status.PUBLISHED)

    def payload(self, **slot_overrides):
        return {
            "role_needed": "PHARMACIST",
            "slots": [{
                "id": self.slot.pk,
                "date": self.week.isoformat(),
                "start_time": "09:00",
                "end_time": "18:00",
                **slot_overrides,
            }],
        }

    def assert_original_assignment(self, expected_date=None):
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.slot_id, self.slot.pk)
        self.assertEqual(self.assignment.user_id, self.worker.pk)
        self.assertEqual(self.assignment.slot_date, expected_date or self.week)
        self.assertEqual(self.assignment.unit_rate, Decimal("57.00"))
        self.assertEqual(self.assignment.rate_reason, {"source": "existing_locked_contract"})
        self.assertEqual(self.assignment.engagement_terms_snapshot,
                         {"version": 1, "source": "preserve_this_snapshot"})
        self.assertEqual(self.assignment.engagement_terms_accepted_at, self.accepted_at)
        self.interest.refresh_from_db()
        self.assertEqual(self.interest.slot_id, self.slot.pk)

    def test_patch_preserves_slot_assignment_and_unsubmitted_metadata(self):
        self.publish_fixture()
        unpublish_roster_shift(self.slot, self.owner)
        self.slot.refresh_from_db()
        unpublished_at = self.slot.unpublished_at
        payload = self.payload()
        # Mobile submits user_id even when the selected worker is unchanged.
        payload["user_id"] = self.worker.pk
        response = self.client.patch(self.url, payload, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.end_time, time(18))
        self.assertEqual(self.slot.unpublished_at, unpublished_at)
        self.assertEqual(self.slot.roster_period_id, self.period.pk)
        self.assertEqual(self.slot.planned_break_minutes, 30)
        self.assertEqual(self.slot.rate, Decimal("59.00"))
        self.assertEqual(list(self.shift.slots.values_list("pk", flat=True)), [self.slot.pk])
        self.assert_original_assignment()

    def test_one_slot_can_be_edited_while_its_sibling_stays_published(self):
        sibling = ShiftSlot.objects.create(
            shift=self.shift, date=self.week + timedelta(days=1),
            start_time=time(10), end_time=time(16), roster_period=self.period,
        )
        sibling_assignment = ShiftSlotAssignment.objects.create(
            shift=self.shift, slot=sibling, slot_date=sibling.date,
            user=self.worker, is_rostered=True,
        )
        self.publish_fixture()
        unpublish_roster_shift(self.slot, self.owner)
        before = (sibling.date, sibling.start_time, sibling.end_time, sibling.roster_period_id)
        response = self.client.patch(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, 200, response.content)
        sibling.refresh_from_db()
        sibling_assignment.refresh_from_db()
        self.assertIsNone(sibling.unpublished_at)
        self.assertEqual((sibling.date, sibling.start_time, sibling.end_time, sibling.roster_period_id), before)
        self.assertEqual(sibling_assignment.slot_id, sibling.pk)
        self.assertEqual(set(self.shift.slots.values_list("pk", flat=True)), {self.slot.pk, sibling.pk})
        self.assert_original_assignment()

    def test_http_cross_week_move_synchronizes_period_and_assignment(self):
        destination = RosterPeriod.objects.create(
            pharmacy=self.pharmacy, week_start=self.week + timedelta(days=7),
            created_by=self.owner, status=RosterPeriod.Status.PUBLISHED,
        )
        self.publish_fixture()
        unpublish_roster_shift(self.slot, self.owner)
        response = self.client.patch(
            self.url, self.payload(date=destination.week_start.isoformat()), format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.roster_period_id, destination.pk)
        self.assertIsNotNone(self.slot.unpublished_at)
        self.assert_original_assignment(expected_date=destination.week_start)
        republish_roster_shift(self.slot, self.owner, notify="none")
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.roster_period_id, destination.pk)
        self.assertIsNone(self.slot.unpublished_at)
        self.period.refresh_from_db()
        self.assertEqual(self.period.status, RosterPeriod.Status.PUBLISHED)

    def test_edit_does_not_announce_before_explicit_republish(self):
        self.publish_fixture()
        unpublish_roster_shift(self.slot, self.owner)
        with mock.patch("shifts.posting.send_shift_updated_notifications") as announcement:
            with mock.patch("notifications.services.notify_users") as notify:
                with self.captureOnCommitCallbacks(execute=True):
                    response = self.client.patch(self.url, self.payload(), format="json")
                self.assertEqual(response.status_code, 200, response.content)
                announcement.assert_not_called()
                notify.assert_not_called()
                self.slot.refresh_from_db()
                with self.captureOnCommitCallbacks(execute=True):
                    republish_roster_shift(self.slot, self.owner, notify="none")
                announcement.assert_not_called()
                notify.assert_not_called()

    def test_foreign_slot_id_is_rejected_without_mutating_either_shift(self):
        foreign_shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST",
        )
        foreign_slot = ShiftSlot.objects.create(
            shift=foreign_shift, date=self.week, start_time=time(7), end_time=time(8),
        )
        self.publish_fixture()
        unpublish_roster_shift(self.slot, self.owner)
        response = self.client.patch(self.url, self.payload(id=foreign_slot.pk), format="json")
        self.assertIn(response.status_code, (400, 404), response.content)
        self.slot.refresh_from_db()
        foreign_slot.refresh_from_db()
        self.assertEqual(self.slot.end_time, time(17))
        self.assertEqual(foreign_slot.shift_id, foreign_shift.pk)
        self.assertEqual(foreign_slot.end_time, time(8))
        self.assert_original_assignment()

    def test_invalid_time_is_a_validation_error_and_atomic(self):
        self.publish_fixture()
        unpublish_roster_shift(self.slot, self.owner)
        response = self.client.patch(self.url, self.payload(end_time="25:99"), format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.end_time, time(17))
        self.assertIsNotNone(self.slot.unpublished_at)
        self.assert_original_assignment()

    def test_worker_cannot_edit_an_unpublished_manager_slot(self):
        self.publish_fixture()
        unpublish_roster_shift(self.slot, self.owner)
        self.client.force_authenticate(self.worker)
        response = self.client.patch(self.url, self.payload(), format="json")
        self.assertIn(response.status_code, (403, 404), response.content)
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.end_time, time(17))
        self.assert_original_assignment()

    def test_published_slot_is_still_immutable(self):
        self.publish_fixture()
        response = self.client.patch(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.end_time, time(17))
        self.assertIsNone(self.slot.unpublished_at)
        self.assert_original_assignment()

    def test_partial_slot_fields_preserve_date_period_and_contract(self):
        self.publish_fixture()
        unpublish_roster_shift(self.slot, self.owner)
        response = self.client.patch(
            self.url, {"slots": [{"id": self.slot.pk, "end_time": "18:30"}]}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.end_time, time(18, 30))
        self.assertEqual(self.slot.date, self.week)
        self.assertEqual(self.slot.roster_period_id, self.period.pk)
        self.assertIsNotNone(self.slot.unpublished_at)
        self.assert_original_assignment()

    def test_slot_identity_and_server_owned_fields_are_strict(self):
        self.publish_fixture()
        unpublish_roster_shift(self.slot, self.owner)
        attempts = [
            {"slots": []},
            {"slots": [{"end_time": "18:00"}]},
            {"slots": [{"id": self.slot.pk}, {"id": self.slot.pk}]},
            {"slots": [{"id": self.slot.pk, "unpublished_at": None}]},
            {"slots": [{"id": self.slot.pk, "roster_period": self.period.pk}]},
            {"slots": [{"id": self.slot.pk}], "pharmacy": self.pharmacy.pk},
        ]
        for payload in attempts:
            with self.subTest(payload=payload):
                response = self.client.patch(self.url, payload, format="json")
                self.assertEqual(response.status_code, 400, response.content)
                self.slot.refresh_from_db()
                self.assertEqual(self.slot.end_time, time(17))
                self.assertIsNotNone(self.slot.unpublished_at)
                self.assert_original_assignment()

    def test_shift_wide_role_change_cannot_mutate_a_published_sibling(self):
        sibling = ShiftSlot.objects.create(
            shift=self.shift, date=self.week + timedelta(days=1),
            start_time=time(10), end_time=time(16), roster_period=self.period,
        )
        self.publish_fixture()
        unpublish_roster_shift(self.slot, self.owner)
        payload = self.payload()
        payload["role_needed"] = "ASSISTANT"
        response = self.client.patch(self.url, payload, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.shift.refresh_from_db()
        self.slot.refresh_from_db()
        sibling.refresh_from_db()
        self.assertEqual(self.shift.role_needed, "PHARMACIST")
        self.assertEqual(self.slot.end_time, time(17))
        self.assertIsNone(sibling.unpublished_at)
        self.assert_original_assignment()

    def test_late_model_validation_failure_rolls_back_every_selected_slot(self):
        sibling = ShiftSlot.objects.create(
            shift=self.shift, date=self.week + timedelta(days=1),
            start_time=time(10), end_time=time(16), roster_period=self.period,
        )
        self.publish_fixture()
        unpublish_roster_shift(self.slot, self.owner)
        unpublish_roster_shift(sibling, self.owner)
        payload = self.payload()
        payload["slots"].append({"id": sibling.pk, "planned_break_minutes": 900})
        response = self.client.patch(self.url, payload, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.slot.refresh_from_db()
        sibling.refresh_from_db()
        self.assertEqual(self.slot.end_time, time(17))
        self.assertEqual(sibling.planned_break_minutes, 0)
        self.assertIsNotNone(self.slot.unpublished_at)
        self.assertIsNotNone(sibling.unpublished_at)
        self.assert_original_assignment()

    def test_ineligible_replacement_rolls_back_slot_and_accepted_terms(self):
        replacement = make_user("OTHER_STAFF")
        Membership.objects.create(
            user=replacement, pharmacy=self.pharmacy, role="ASSISTANT",
            employment_type="FULL_TIME", status=Membership.Status.ACCEPTED, is_active=True,
        )
        self.publish_fixture()
        unpublish_roster_shift(self.slot, self.owner)
        payload = self.payload()
        payload["user_id"] = replacement.pk
        response = self.client.patch(self.url, payload, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.end_time, time(17))
        self.assert_original_assignment()

    def test_overlap_rejection_is_atomic(self):
        other_shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        other_slot = ShiftSlot.objects.create(
            shift=other_shift, date=self.week, start_time=time(17, 30), end_time=time(19),
            roster_period=self.period,
        )
        ShiftSlotAssignment.objects.create(
            shift=other_shift, slot=other_slot, slot_date=self.week, user=self.worker, is_rostered=True,
        )
        self.publish_fixture()
        unpublish_roster_shift(self.slot, self.owner)
        response = self.client.patch(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.end_time, time(17))
        self.assert_original_assignment()

    def test_reassignment_does_not_retarget_an_existing_invoice(self):
        from invoicing.models import Invoice, InvoiceLineItem

        invoice = Invoice.objects.create(user=self.worker, pharmacy=self.pharmacy)
        item = InvoiceLineItem.objects.create(
            invoice=invoice, source_assignment=self.assignment, shift=self.shift,
            description="Frozen prior service", quantity=1, unit_price=57, total=57,
        )
        replacement = make_user("PHARMACIST")
        Membership.objects.create(
            user=replacement, pharmacy=self.pharmacy, role="PHARMACIST",
            employment_type="FULL_TIME", status=Membership.Status.ACCEPTED, is_active=True,
        )
        self.publish_fixture()
        unpublish_roster_shift(self.slot, self.owner)
        payload = self.payload()
        payload["user_id"] = replacement.pk
        response = self.client.patch(self.url, payload, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.slot.refresh_from_db()
        item.refresh_from_db()
        self.assertEqual(self.slot.end_time, time(17))
        self.assertEqual(item.source_assignment_id, self.assignment.pk)
        self.assert_original_assignment()

    def test_republish_rechecks_worker_eligibility(self):
        from django.core.exceptions import ValidationError

        self.publish_fixture()
        unpublish_roster_shift(self.slot, self.owner)
        Membership.objects.filter(user=self.worker, pharmacy=self.pharmacy).update(is_active=False)
        with self.assertRaises(ValidationError):
            republish_roster_shift(self.slot, self.owner, notify="none")
        self.slot.refresh_from_db()
        self.assertIsNotNone(self.slot.unpublished_at)
        self.assert_original_assignment()

    def test_publication_audit_uses_existing_rows_and_records_before_after(self):
        from workforce.models import RosterActionAudit

        self.publish_fixture()
        unpublish_roster_shift(self.slot, self.owner)
        before = RosterActionAudit.objects.get(action_type="SHIFT_UNPUBLISHED")
        self.assertEqual(before.details["slot_before"]["end_time"], "17:00:00")
        response = self.client.patch(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.slot.refresh_from_db()
        republish_roster_shift(self.slot, self.owner, notify="none")
        after = RosterActionAudit.objects.get(action_type="SHIFT_REPUBLISHED")
        self.assertEqual(after.details["slot_after"]["end_time"], "18:00:00")
        self.assertEqual(before.details["slot_id"], after.details["slot_id"])
        self.assertEqual(RosterActionAudit.objects.count(), 2)

    def test_generic_shift_endpoint_cannot_replace_roster_slots(self):
        self.publish_fixture()
        unpublish_roster_shift(self.slot, self.owner)
        with mock.patch("shifts.posting.send_shift_updated_notifications") as announce:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.patch(
                    f"/api/v1/shifts/{self.shift.pk}/", self.payload(), format="json",
                )
        self.assertEqual(response.status_code, 400, response.content)
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.end_time, time(17))
        self.assertIsNotNone(self.slot.unpublished_at)
        self.assert_original_assignment()
        announce.assert_not_called()
