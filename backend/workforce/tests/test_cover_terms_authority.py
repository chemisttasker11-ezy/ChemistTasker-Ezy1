"""E17 manager authority and existing roster positive controls, on PostgreSQL."""
from copy import deepcopy
from datetime import timedelta
from decimal import Decimal
from unittest import skipUnless
from unittest.mock import patch

from django.db import connection
from django.test import TestCase

from attendance.test_cover_terms_acceptance import CoverTermsFixture
from client_profile.characterization_support import client_for, make_user
from memberships.models import Membership
from shifts.models import Shift, ShiftSlotAssignment
from workforce.models import RosterPeriod
from workforce.roster.assignment_rates import refresh_assignment_rate
from workforce.roster.serializers import RosterAssignmentSerializer


# Skip before TestCase opens its class transaction; the fixture requires PostgreSQL.
@skipUnless(connection.vendor == "postgresql", "Cover terms authority contracts require PostgreSQL.")
class CoverTermsAuthorityTests(CoverTermsFixture, TestCase):
    def test_manager_patch_cannot_forge_worker_consent_or_routing(self):
        assignment = self.cover().backfill_assignment
        original = (
            assignment.payment_preference_snapshot, assignment.settlement_channel,
            assignment.engagement_kind, assignment.engagement_terms_accepted_at,
        )
        response = client_for(self.manager).patch(f"/api/v1/roster-owner/{assignment.pk}/", {
            "payment_preference_snapshot": "TFN", "settlement_channel": "PAYROLL",
            "engagement_kind": "STAFF_EMPLOYMENT",
            "engagement_terms_accepted_at": self.now.isoformat(),
        }, format="json")
        self.assertEqual(response.status_code, 200, response.content[:300])
        assignment.refresh_from_db()
        self.assertEqual((
            assignment.payment_preference_snapshot, assignment.settlement_channel,
            assignment.engagement_kind, assignment.engagement_terms_accepted_at,
        ), original)
        self.assert_sources(assignment, False)

    def test_manager_cannot_promote_incomplete_cover_to_invoice_source(self):
        self.profile.abn_verified = False
        self.profile.save(update_fields=["abn_verified"])
        assignment = self.cover().backfill_assignment
        response = client_for(self.owner).patch(f"/api/v1/roster-owner/{assignment.pk}/", {
            "settlement_channel": "INVOICE", "engagement_kind": "INDEPENDENT_CONTRACTOR",
            "payment_preference_snapshot": "ABN", "engagement_terms_accepted_at": self.now.isoformat(),
        }, format="json")
        self.assertEqual(response.status_code, 200, response.content[:300])
        assignment.refresh_from_db()
        self.assertEqual(assignment.settlement_channel, "TIMESHEET_ONLY")
        self.assert_unaccepted(assignment)

    def test_consent_and_routing_serializer_fields_are_read_only_for_all_assignments(self):
        serializer = RosterAssignmentSerializer()
        for field in ("payment_preference_snapshot", "settlement_channel", "engagement_kind", "engagement_terms_accepted_at"):
            with self.subTest(field=field):
                self.assertTrue(serializer.fields[field].read_only, field)

    def test_manager_cannot_transfer_an_accepted_assignment_to_another_worker(self):
        assignment = self.cover().backfill_assignment
        # Independently seed valid consent so missing POST does not hide this bypass.
        assignment.engagement_terms_accepted_at = self.now
        assignment.engagement_terms_snapshot = {"accepted_by_user_id": self.worker.pk, "accepted_at": self.now.isoformat()}
        assignment.save(update_fields=["engagement_terms_accepted_at", "engagement_terms_snapshot"])
        original = deepcopy(assignment.engagement_terms_snapshot)
        response = client_for(self.manager).patch(f"/api/v1/roster-owner/{assignment.pk}/", {
            "user": make_user("PHARMACIST").pk,
        }, format="json")
        self.assertEqual(response.status_code, 400, response.content[:300])
        assignment.refresh_from_db()
        self.assertEqual(assignment.user_id, self.worker.pk)
        self.assertEqual(assignment.engagement_terms_snapshot, original)

    def test_accepted_contractor_cover_rate_survives_roster_refresh(self):
        assignment = self.cover().backfill_assignment
        assignment.engagement_kind = "INDEPENDENT_CONTRACTOR"
        assignment.engagement_terms_accepted_at = self.now
        assignment.save(update_fields=["engagement_kind", "engagement_terms_accepted_at"])
        original = (assignment.unit_rate, deepcopy(assignment.rate_reason))
        with patch("shifts.pricing.get_locked_rate_for_slot", return_value=(Decimal("110"), {"source": "LaterPricing"})) as price:
            refresh_assignment_rate(assignment)
        assignment.refresh_from_db()
        self.assertEqual((assignment.unit_rate, assignment.rate_reason), original)
        price.assert_not_called()

    def test_ordinary_unaccepted_cover_rate_edit_remains_available(self):
        assignment = self.cover().backfill_assignment
        response = client_for(self.manager).patch(f"/api/v1/roster-owner/{assignment.pk}/", {
            "unit_rate": "82.25", "rate_reason": {"source": "ManagerConfigured"},
        }, format="json")
        self.assertEqual(response.status_code, 200, response.content[:300])
        assignment.refresh_from_db()
        self.assertEqual(assignment.unit_rate, Decimal("82.25"))
        self.assert_unaccepted(assignment)

    def test_unaccepted_assignment_still_refreshes_its_rate(self):
        assignment = self.cover().backfill_assignment
        with patch("shifts.pricing.get_locked_rate_for_slot", return_value=(Decimal("82.25"), {"source": "CurrentPricing"})) as price:
            refresh_assignment_rate(assignment)
        assignment.refresh_from_db()
        self.assertEqual(assignment.unit_rate, Decimal("82.25"))
        price.assert_called_once()
        self.assert_unaccepted(assignment)


@skipUnless(connection.vendor == "postgresql", "Cover terms authority contracts require PostgreSQL.")
class CoverTermsRosterReviewTests(CoverTermsFixture, TestCase):
    def prepare(self, *, accepted=True, rostered=False):
        review = self.cover()
        assignment = review.backfill_assignment
        if accepted:
            response = self.accept(assignment)
            self.assertEqual(response.status_code, 200, response.content[:300])
        # The direct staff relationship starts AFTER the external cover was accepted.
        self.member()
        if rostered:
            response = client_for(self.manager).patch(f"/api/v1/roster-owner/{assignment.pk}/", {
                "is_rostered": True,
            }, format="json")
            self.assertEqual(response.status_code, 200, response.content[:300])
        assignment.refresh_from_db()
        self.original = self.frozen(assignment)
        self.review = review
        return assignment

    @staticmethod
    def frozen(assignment):
        return (assignment.user_id, assignment.engagement_terms_accepted_at,
                deepcopy(assignment.engagement_terms_snapshot), assignment.settlement_channel,
                assignment.engagement_kind, assignment.unit_rate, deepcopy(assignment.rate_reason))

    def assert_history_kept(self, assignment):
        self.assertTrue(ShiftSlotAssignment.objects.filter(pk=assignment.pk).exists(), "Accepted assignment was deleted")
        assignment.refresh_from_db()
        self.assertEqual(self.frozen(assignment), self.original, "Roster operation overwrote accepted terms/rate")
        self.review.refresh_from_db()
        self.review.session.refresh_from_db()
        self.assertEqual(self.review.backfill_assignment_id, assignment.pk)
        self.assertEqual(self.review.session.assignment_id, assignment.pk)
        self.assertEqual(self.review.backfill_shift_id, assignment.shift_id)
        self.assert_sources(assignment, True)

    def roster_request(self, route, assignment, *, worker=None):
        worker = worker or self.worker
        api = client_for(self.owner)
        if route == "legacy_shift_patch":
            return api.patch(f"/api/v1/roster-shifts/{assignment.shift_id}/", {"user_id": worker.pk}, format="json")
        if route == "manual_assign":
            return api.post(f"/api/v1/shifts/{assignment.shift_id}/manual-assign/", {
                "user_id": worker.pk,
                "assignments": [{"slot_id": assignment.slot_id, "slot_date": str(assignment.slot_date)}],
            }, format="json")
        if route == "slot_edit":
            return api.patch(f"/api/v1/roster-shifts/{assignment.shift_id}/", {
                "slots": [{"id": assignment.slot_id}], "user_id": worker.pk,
            }, format="json")
        monday = assignment.slot_date - timedelta(days=assignment.slot_date.weekday())
        period, _ = RosterPeriod.objects.get_or_create(
            pharmacy=self.pharmacy, week_start=monday, defaults={"created_by": self.owner},
        )
        slot = assignment.slot
        slot.roster_period = period
        slot.save(update_fields=["roster_period"])
        operation = {"action": route, "slot_id": slot.pk}
        operation["target_user_id" if route == "move_shift" else "user_id"] = worker.pk
        return api.post("/api/v1/attendance/roster/bulk-edit/", {
            "period_id": period.pk, "operations": [operation],
        }, format="json")

    def test_a4_roster_shift_delete_refuses_and_keeps_acceptance_and_attendance_links(self):
        assignment = self.prepare()
        response = client_for(self.owner).delete(f"/api/v1/roster-shifts/{assignment.shift_id}/")
        self.assertIn(response.status_code, (400, 409), response.content[:300])
        self.assert_history_kept(assignment)

    def test_a4_control_plain_draft_staff_shift_can_still_be_deleted(self):
        from client_profile.characterization_support import make_assignment
        _, _, assignment = make_assignment(self.pharmacy, self.owner, self.worker, self.now.date())
        response = client_for(self.owner).delete(f"/api/v1/roster-shifts/{assignment.shift_id}/")
        self.assertEqual(response.status_code, 204, response.content[:300])
        self.assertFalse(Shift.objects.filter(pk=assignment.shift_id).exists())

    def test_archiving_period_preserves_accepted_cover_and_invoice_sources(self):
        from invoicing.services import generate_preview_invoice_lines
        from worker_finance.services import internal_invoice_sources

        assignment = self.prepare(rostered=True)
        self.assertIsNone(assignment.source_offer_id)
        self.assert_accepted(assignment, self.review)
        period = RosterPeriod.objects.create(
            pharmacy=self.pharmacy,
            week_start=assignment.slot_date - timedelta(days=assignment.slot_date.weekday()),
            created_by=self.owner,
        )
        slot = assignment.slot
        slot.roster_period = period
        slot.save(update_fields=["roster_period"])
        period.status = RosterPeriod.Status.PUBLISHED
        period.save(update_fields=["status"])
        sources = internal_invoice_sources(self.worker)
        preview = generate_preview_invoice_lines(assignment.shift, self.worker)

        response = client_for(self.owner).post("/api/v1/attendance/roster/archive/", {
            "period_id": period.pk,
        }, format="json")

        self.assertEqual(response.status_code, 200, response.content[:300])
        period.refresh_from_db()
        slot.refresh_from_db()
        self.assertEqual(period.status, RosterPeriod.Status.ARCHIVED)
        self.assertEqual(slot.roster_period_id, period.pk)
        self.assert_history_kept(assignment)
        self.assertEqual(internal_invoice_sources(self.worker), sources)
        self.assertEqual(generate_preview_invoice_lines(assignment.shift, self.worker), preview)
        self.assert_no_payment()


def same_worker_operation(route, accepted):
    def test(self):
        assignment = self.prepare(accepted=accepted, rostered=route in ("assign_worker", "move_shift", "slot_edit"))
        response = self.roster_request(route, assignment)
        self.assertEqual(response.status_code, 200, response.content[:400])
        if accepted:
            self.assert_history_kept(assignment)
        else:
            assignment.refresh_from_db()
            self.assertEqual(assignment.user_id, self.worker.pk)
            self.assertIsNone(assignment.engagement_terms_accepted_at)
            self.assertTrue(assignment.is_rostered)
            if route != "slot_edit":  # slot_edit retains unchanged-worker rows; it does not apply defaults.
                self.assertEqual((assignment.settlement_channel, assignment.engagement_kind,
                                  assignment.payment_preference_snapshot),
                                 ("TIMESHEET_ONLY", "STAFF_EMPLOYMENT", "TFN"))
                self.assertNotEqual(assignment.engagement_terms_snapshot, self.original[2])
                self.assertEqual(assignment.engagement_terms_snapshot["membership_id"],
                                 Membership.objects.get(user=self.worker, pharmacy=self.pharmacy).pk)
    return test


def replacement_operation(route):
    def test(self):
        assignment = self.prepare(rostered=route in ("assign_worker", "move_shift", "slot_edit"))
        other = make_user("PHARMACIST")
        Membership.objects.create(user=other, pharmacy=self.pharmacy, role="PHARMACIST",
                                  employment_type="FULL_TIME", status="ACCEPTED", is_active=True)
        response = self.roster_request(route, assignment, worker=other)
        self.assertIn(response.status_code, (400, 409), response.content[:400])
        self.assert_history_kept(assignment)
    return test


for _route in ("legacy_shift_patch", "manual_assign", "assign_worker", "move_shift", "slot_edit"):
    setattr(CoverTermsRosterReviewTests, f"test_a2_{_route}_same_worker_preserves_accepted_cover", same_worker_operation(_route, True))
    setattr(CoverTermsRosterReviewTests, f"test_a2_control_{_route}_unaccepted_same_worker_still_allowed", same_worker_operation(_route, False))
    setattr(CoverTermsRosterReviewTests, f"test_a2_{_route}_replacement_refused", replacement_operation(_route))

