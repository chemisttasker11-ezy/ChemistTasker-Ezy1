"""E17: only explicit worker consent makes approved INVOICE cover billable.

Run on core.postgres_test_settings. New endpoint names remain strings so the
missing implementation fails HTTP/behaviour assertions rather than imports.
"""
from copy import deepcopy
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError as FinanceValidationError

from attendance.models import ProvisionalAttendance
from attendance.test_unbooked_locum_cover import LocumCoverFixture
from client_profile.characterization_support import client_for, make_assignment, make_user
from invoicing.models import Invoice, InvoiceLineItem
from invoicing.services import (
    _invoice_routed_assignments, generate_invoice_from_shifts, generate_preview_invoice_lines,
)
from shifts.models import ShiftOffer, ShiftSlotAssignment
from worker_finance.models import Payment
from worker_finance.services import (
    _assignment_queryset, internal_invoice_prefill, internal_invoice_sources, save_draft,
)


LIST = "/api/v1/attendance/worker/cover-terms/"
CONSENT = {"engagement_terms_accepted": True, "independent_contractor_status_confirmed": True}
TIERS = ("FAVOURITE_COVER", "UNBOOKED_LOCUM_COVER", "UNROSTERED_LOCAL", "CROSS_SITE_CHAIN", "CROSS_SITE_ORG")


class CoverTermsFixture(LocumCoverFixture):
    def setUp(self):
        super().setUp()
        self.complete_abn()

    def complete_abn(self):
        self.profile.payment_preference = "ABN"
        self.profile.abn = "51824753556"
        self.profile.abn_verified = True
        self.profile.abn_entity_confirmed = True
        self.profile.abn_entity_name = "Cover Provider"
        self.profile.gst_registered = True
        self.profile.save()

    def decide_review(self, review, *, decision="approve", actor=None):
        # Also usable by TransactionTestCase: its callbacks execute immediately.
        with TestCase.captureOnCommitCallbacks(execute=True):
            return client_for(actor or self.manager).post(
                f"/api/v1/attendance/manager/{decision}/",
                {"provisional_id": review.pk, "reason": "Checked emergency cover."}, format="json",
            )

    def cover(self, tier="UNBOOKED_LOCUM_COVER", *, approve=True, configure_rate=True):
        review = self.seed_review()
        review.cover_type = tier
        review.save(update_fields=["cover_type"])
        if approve:
            response = self.decide_review(review)
            self.assertEqual(response.status_code, 200, response.content[:300])
            review.refresh_from_db()
            assignment = review.backfill_assignment
            # The existing assignment-rate edit is the source, never the accept payload.
            if configure_rate:
                assignment.unit_rate = Decimal("73.50")
                assignment.rate_reason = {"source": "ManagerConfigured"}
                assignment.save(update_fields=["unit_rate", "rate_reason"])
        return review

    def accept(self, assignment, *, actor=None, payload=None):
        with TestCase.captureOnCommitCallbacks(execute=True):
            return client_for(actor or self.worker).post(
                LIST + f"{assignment.pk}/accept/", CONSENT if payload is None else payload,
                format="json",
            )

    def discover(self, actor=None):
        response = client_for(actor or self.worker).get(LIST)
        self.assertEqual(response.status_code, 200, response.content[:300])
        self.assertIsInstance(response.data, list)
        return response.data

    def assert_sources(self, assignment, present):
        self.assertEqual(_assignment_queryset(self.worker).filter(pk=assignment.pk).exists(), present)
        self.assertEqual(_invoice_routed_assignments(self.worker).filter(pk=assignment.pk).exists(), present)

    def assert_unaccepted(self, assignment):
        assignment.refresh_from_db()
        self.assertIsNone(assignment.engagement_terms_accepted_at)
        self.assertFalse((assignment.engagement_terms_snapshot or {}).get("accepted_at"))
        self.assert_sources(assignment, False)

    def assert_no_payment(self):
        self.assertEqual(Payment.objects.count(), 0)
        self.assertFalse(Invoice.objects.filter(status="paid").exists())
        self.assertFalse(Invoice.objects.exclude(review_status="NONE").exists())
        self.assertFalse(ShiftSlotAssignment.objects.filter(shift__payment_status="PAID").exists())

    def assert_accepted(self, assignment, review):
        assignment.refresh_from_db()
        self.assertIsNotNone(assignment.engagement_terms_accepted_at)
        self.assertEqual(assignment.settlement_channel, "INVOICE")
        self.assertEqual(assignment.engagement_kind, "INDEPENDENT_CONTRACTOR")
        snapshot = assignment.engagement_terms_snapshot
        self.assertEqual(snapshot["accepted_by_user_id"], self.worker.pk)
        self.assertEqual(snapshot["accepted_at"], assignment.engagement_terms_accepted_at.isoformat())
        self.assertEqual(snapshot["worker_id"], self.worker.pk)
        self.assertEqual(snapshot["provider_abn"].replace(" ", ""), self.profile.abn)
        self.assertEqual(snapshot["provider_entity_name"], "Cover Provider")
        self.assertTrue(snapshot["gst_registered"])
        self.assertTrue(snapshot["relationship_notice"])
        self.assertTrue(snapshot["super_notice"])
        occurrence = next(row for row in snapshot["occurrences"] if row["slot_id"] == assignment.slot_id)
        self.assertEqual(occurrence["date"], str(assignment.slot_date))
        self.assertEqual(occurrence["start_time"], str(assignment.slot.start_time))
        self.assertEqual(occurrence["end_time"], str(assignment.slot.end_time))
        self.assertEqual(Decimal(occurrence["agreed_rate"]), Decimal("73.50"))
        # Consent must retain enough provenance to identify this reviewed cover.
        self.assertEqual(snapshot["provisional_id"], review.pk)
        self.assertEqual(snapshot["cover_type"], review.cover_type)
        self.assert_sources(assignment, True)
        self.assert_no_payment()

    def assert_legacy_invoice_is_unpaid(self, assignment):
        self.assertEqual(internal_invoice_sources(self.worker)[0]["assignment_id"], assignment.pk)
        self.assertEqual(generate_preview_invoice_lines(assignment.shift, self.worker)[0]["unit_price"], 73.5)
        invoice = generate_invoice_from_shifts(
            self.worker, pharmacy_id=self.pharmacy.pk, shift_ids=[assignment.shift_id],
            billing_data={"bank_account_name": "Provider", "bsb": "123456", "account_number": "12345678", "super_rate_snapshot": "0"},
        )
        self.assertEqual(invoice.status, "draft")
        self.assertEqual(invoice.review_status, "NONE")
        self.assertEqual(InvoiceLineItem.objects.filter(source_assignment=assignment).count(), 1)
        self.assert_no_payment()
        self.assertEqual(internal_invoice_sources(self.worker), [])
        with self.assertRaises(FinanceValidationError):
            internal_invoice_prefill(self.worker, [assignment.pk])
        with self.assertRaises(ValidationError):
            generate_invoice_from_shifts(self.worker, pharmacy_id=self.pharmacy.pk, shift_ids=[assignment.shift_id])

    def assert_finance_draft_is_unpaid(self, assignment):
        payload = internal_invoice_prefill(self.worker, [assignment.pk])
        invoice = save_draft(self.worker, payload, source="internal")
        self.assertEqual(invoice.status, "draft")
        self.assert_no_payment()
        self.assertEqual(internal_invoice_sources(self.worker), [])


class CoverTermsAcceptanceTests(CoverTermsFixture, TestCase):
    def test_discovery_after_clock_out_without_membership_or_published_roster(self):
        review = self.cover()
        assignment = review.backfill_assignment
        rows = self.discover()
        row = next(row for row in rows if row["assignment_id"] == assignment.pk)
        self.assertEqual(row["session_id"], review.session_id)
        self.assertEqual(row["status"], "APPROVED")
        self.assertEqual(row["cover_type"], "UNBOOKED_LOCUM_COVER")
        terms = row["engagement_terms_preview"]
        self.assertEqual(terms["settlement_channel"], "INVOICE")
        self.assertIsNone(terms["accepted_at"])
        self.assertEqual(Decimal(terms["occurrences"][0]["agreed_rate"]), Decimal("73.50"))
        self.assert_unaccepted(assignment)

    def test_discovery_is_worker_scoped_and_excludes_pending_rejected_and_bookings(self):
        approved = self.cover()
        pending = self.cover(approve=False)
        rejected = self.cover(approve=False)
        self.assertEqual(self.decide_review(rejected, decision="reject").status_code, 200)
        make_assignment(self.pharmacy, self.owner, self.worker, self.now.date())
        self.assertEqual([row["assignment_id"] for row in self.discover()], [approved.backfill_assignment_id])
        self.assertEqual(self.discover(make_user("PHARMACIST")), [])
        pending.refresh_from_db()
        self.assertIsNone(pending.backfill_assignment_id)

    def test_anonymous_discovery_requires_authentication(self):
        response = client_for().get(LIST)
        self.assertEqual(response.status_code, 401, response.content[:300])

    def test_wrong_worker_cannot_accept(self):
        assignment = self.cover().backfill_assignment
        response = self.accept(assignment, actor=make_user("PHARMACIST"))
        self.assertEqual(response.status_code, 403, response.content[:300])
        self.assert_unaccepted(assignment)

    def test_manager_cannot_accept_for_worker(self):
        assignment = self.cover().backfill_assignment
        response = self.accept(assignment, actor=self.manager)
        self.assertEqual(response.status_code, 403, response.content[:300])
        self.assert_unaccepted(assignment)

    def test_before_approval_cannot_accept_even_with_assignment_links(self):
        review = self.cover()
        ProvisionalAttendance.objects.filter(pk=review.pk).update(status="PENDING", decided_at=None, decided_by=None)
        response = self.accept(review.backfill_assignment)
        self.assertEqual(response.status_code, 400, response.content[:300])
        self.assert_unaccepted(review.backfill_assignment)

    def test_after_rejection_cannot_accept_even_with_assignment_links(self):
        review = self.cover()
        ProvisionalAttendance.objects.filter(pk=review.pk).update(status="REJECTED")
        response = self.accept(review.backfill_assignment)
        self.assertEqual(response.status_code, 400, response.content[:300])
        self.assert_unaccepted(review.backfill_assignment)

    def test_unrelated_booking_cannot_use_cover_endpoint(self):
        _, _, assignment = make_assignment(self.pharmacy, self.owner, self.worker, self.now.date())
        response = self.accept(assignment)
        self.assertEqual(response.status_code, 400, response.content[:300])
        self.assert_unaccepted(assignment)

    def test_mismatched_session_worker_is_refused(self):
        review = self.cover()
        session = review.session
        session.user = make_user("PHARMACIST")
        session.save(update_fields=["user"])
        response = self.accept(review.backfill_assignment)
        self.assertEqual(response.status_code, 400, response.content[:300])
        self.assert_unaccepted(review.backfill_assignment)

    def test_mismatched_session_assignment_is_refused(self):
        review = self.cover()
        session = review.session
        session.assignment = None
        session.save(update_fields=["assignment"])
        response = self.accept(review.backfill_assignment)
        self.assertEqual(response.status_code, 400, response.content[:300])
        self.assert_unaccepted(review.backfill_assignment)

    def test_open_session_is_refused(self):
        review = self.cover()
        session = review.session
        session.ended_at = None
        session.save(update_fields=["ended_at"])
        response = self.accept(review.backfill_assignment)
        self.assertEqual(response.status_code, 400, response.content[:300])
        self.assert_unaccepted(review.backfill_assignment)

    def test_both_explicit_json_consents_are_required(self):
        assignment = self.cover().backfill_assignment
        for payload in ({}, {"engagement_terms_accepted": True},
                        {"independent_contractor_status_confirmed": True},
                        {**CONSENT, "engagement_terms_accepted": False},
                        {**CONSENT, "independent_contractor_status_confirmed": False},
                        {**CONSENT, "engagement_terms_accepted": "true"}):
            with self.subTest(payload=payload):
                response = self.accept(assignment, payload=payload)
                self.assertEqual(response.status_code, 400, response.content[:300])
                self.assert_unaccepted(assignment)

    def test_client_cannot_choose_rate_routing_timestamp_or_accepting_identity(self):
        review = self.cover()
        response = self.accept(review.backfill_assignment, payload={
            **CONSENT, "unit_rate": "9999", "settlement_channel": "PAYROLL",
            "engagement_terms_accepted_at": "2000-01-01T00:00:00Z",
            "engagement_terms_snapshot": {"accepted_by_user_id": self.manager.pk},
        })
        self.assertEqual(response.status_code, 200, response.content[:300])
        self.assert_accepted(review.backfill_assignment, review)

    def test_replay_preserves_original_timestamp_and_snapshot_after_profile_changes(self):
        review = self.cover()
        first = self.accept(review.backfill_assignment)
        self.assertEqual(first.status_code, 200, first.content[:300])
        assignment = ShiftSlotAssignment.objects.get(pk=review.backfill_assignment_id)
        original = (assignment.engagement_terms_accepted_at, deepcopy(assignment.engagement_terms_snapshot))
        self.now += timedelta(hours=1)
        self.profile.abn_entity_name = "Later business name"
        self.profile.save(update_fields=["abn_entity_name"])
        replay = self.accept(assignment)
        self.assertEqual(replay.status_code, 200, replay.content[:300])
        self.assertEqual(replay.data, first.data)
        assignment.refresh_from_db()
        self.assertEqual((assignment.engagement_terms_accepted_at, assignment.engagement_terms_snapshot), original)
        self.assertEqual(ShiftSlotAssignment.objects.count(), 1)
        self.assert_no_payment()

    def test_replay_still_checks_worker_ownership_and_approval(self):
        review = self.cover()
        assignment = review.backfill_assignment
        first = self.accept(assignment)
        self.assertEqual(first.status_code, 200, first.content[:300])
        denied = self.accept(assignment, actor=self.manager)
        self.assertEqual(denied.status_code, 403, denied.content[:300])
        ProvisionalAttendance.objects.filter(pk=review.pk).update(status="REJECTED")
        denied = self.accept(assignment)
        self.assertEqual(denied.status_code, 400, denied.content[:300])

    def test_incomplete_abn_is_discoverable_with_notice_but_cannot_accept(self):
        self.profile.abn_verified = False
        self.profile.save(update_fields=["abn_verified"])
        assignment = self.cover().backfill_assignment
        row = self.discover()[0]
        self.assertEqual(row["assignment_id"], assignment.pk)
        self.assertTrue(row["engagement_terms_preview"]["blocked"])
        self.assertTrue(row["engagement_terms_preview"]["notice"])
        response = self.accept(assignment)
        self.assertEqual(response.status_code, 400, response.content[:300])
        assignment.refresh_from_db()
        self.assertEqual(assignment.settlement_channel, "TIMESHEET_ONLY")
        self.assert_unaccepted(assignment)

    def test_completing_abn_profile_requires_subsequent_explicit_acceptance(self):
        self.profile.abn_verified = False
        self.profile.save(update_fields=["abn_verified"])
        review = self.cover()
        assignment = review.backfill_assignment
        self.complete_abn()
        self.assert_unaccepted(assignment)
        self.assertEqual(assignment.settlement_channel, "TIMESHEET_ONLY")
        row = self.discover()[0]
        self.assertEqual(row["engagement_terms_preview"]["settlement_channel"], "INVOICE")
        self.assert_unaccepted(assignment)  # preview alone must not promote the assignment
        response = self.accept(assignment)
        self.assertEqual(response.status_code, 200, response.content[:300])
        self.assert_accepted(assignment, review)

    def test_tfn_cover_cannot_be_promoted_to_invoice_by_acceptance(self):
        self.profile.payment_preference = "TFN"
        self.profile.save(update_fields=["payment_preference"])
        assignment = self.cover().backfill_assignment
        response = self.accept(assignment)
        self.assertEqual(response.status_code, 400, response.content[:300])
        assignment.refresh_from_db()
        self.assertNotEqual(assignment.settlement_channel, "INVOICE")
        self.assert_unaccepted(assignment)

    def test_abn_preference_does_not_override_local_staff_employment(self):
        self.member()
        assignment = self.cover("UNROSTERED_LOCAL").backfill_assignment
        response = self.accept(assignment)
        self.assertEqual(response.status_code, 400, response.content[:300])
        assignment.refresh_from_db()
        self.assertEqual(assignment.engagement_kind, "STAFF_EMPLOYMENT")
        self.assertNotEqual(assignment.settlement_channel, "INVOICE")
        self.assert_unaccepted(assignment)

    def test_accepted_cover_generates_unpaid_invoice_and_cannot_be_billed_twice(self):
        review = self.cover()
        assignment = review.backfill_assignment
        response = self.accept(assignment)
        self.assertEqual(response.status_code, 200, response.content[:300])
        self.assert_accepted(assignment, review)
        self.assert_legacy_invoice_is_unpaid(assignment)

    def test_accepted_cover_generates_worker_finance_draft_without_payment(self):
        review = self.cover("FAVOURITE_COVER")
        assignment = review.backfill_assignment
        response = self.accept(assignment)
        self.assertEqual(response.status_code, 200, response.content[:300])
        self.assert_accepted(assignment, review)
        self.assert_finance_draft_is_unpaid(assignment)


def acceptance_for(tier):
    def test(self):
        review = self.cover(tier)
        assignment = review.backfill_assignment
        self.assert_unaccepted(assignment)
        response = self.accept(assignment)
        self.assertEqual(response.status_code, 200, response.content[:300])
        self.assert_accepted(assignment, review)
    return test


for _tier in TIERS:
    setattr(CoverTermsAcceptanceTests, f"test_worker_accepts_{_tier.lower()}_into_both_invoice_sources", acceptance_for(_tier))


class CoverTermsExistingControls(CoverTermsFixture, TestCase):
    def seed_existing_accepted_assignment(self):
        assignment = self.cover().backfill_assignment
        assignment.engagement_terms_accepted_at = self.now
        assignment.engagement_terms_snapshot = {
            **assignment.engagement_terms_snapshot,
            "accepted_at": self.now.isoformat(), "accepted_by_user_id": self.worker.pk,
            "occurrences": [{"slot_id": assignment.slot_id, "date": str(assignment.slot_date),
                             "start_time": str(assignment.slot.start_time), "end_time": str(assignment.slot.end_time),
                             "agreed_rate": "73.50"}],
        }
        assignment.save(update_fields=["engagement_terms_accepted_at", "engagement_terms_snapshot"])
        self.assert_sources(assignment, True)
        return assignment

    def test_existing_accepted_source_generates_legacy_unpaid_invoice_and_refuses_duplicate(self):
        self.assert_legacy_invoice_is_unpaid(self.seed_existing_accepted_assignment())

    def test_existing_accepted_source_generates_finance_draft_without_payment(self):
        self.assert_finance_draft_is_unpaid(self.seed_existing_accepted_assignment())

    def test_manager_approval_never_stamps_worker_acceptance(self):
        for tier in TIERS:
            with self.subTest(tier=tier):
                self.assert_unaccepted(self.cover(tier).backfill_assignment)
        self.assert_no_payment()

    def test_incomplete_abn_approval_keeps_timesheet_only_and_notice(self):
        self.profile.abn_verified = False
        self.profile.save(update_fields=["abn_verified"])
        assignment = self.cover().backfill_assignment
        self.assertEqual(assignment.settlement_channel, "TIMESHEET_ONLY")
        self.assertTrue(assignment.engagement_terms_snapshot["payment_profile_incomplete"])
        self.assertIn("incomplete", assignment.engagement_terms_snapshot["notice"])
        self.assert_unaccepted(assignment)

    def test_existing_staff_precedence_keeps_abn_worker_off_invoice_routing(self):
        from shifts.engagement import build_shift_engagement_terms
        self.member()
        assignment = self.cover("UNROSTERED_LOCAL").backfill_assignment
        terms = build_shift_engagement_terms(shift=assignment.shift, user=self.worker)
        self.assertEqual(terms["engagement_kind"], "STAFF_EMPLOYMENT")
        self.assertEqual(terms["payment_preference"], "TFN")
        self.assertFalse(terms["acceptance_required"])
        self.assertNotEqual(terms["settlement_channel"], "INVOICE")

    def test_existing_tfn_cover_is_not_invoice_routed(self):
        self.profile.payment_preference = "TFN"
        self.profile.save(update_fields=["payment_preference"])
        assignment = self.cover().backfill_assignment
        self.assertEqual(assignment.payment_preference_snapshot, "TFN")
        self.assertNotEqual(assignment.settlement_channel, "INVOICE")
        self.assert_unaccepted(assignment)

    @override_settings(AHPRA_ENFORCEMENT_ENABLED=True)
    def test_booked_abn_offer_acceptance_still_records_consent_and_invoice_sources(self):
        shift, slot, assignment = make_assignment(self.pharmacy, self.owner, self.worker, self.now.date() + timedelta(days=2))
        assignment.delete()
        shift.role_needed = "PHARMACIST"
        shift.fixed_rate = Decimal("73.50")
        shift.save(update_fields=["role_needed", "fixed_rate"])
        offer = ShiftOffer.objects.create(shift=shift, slot=slot, user=self.worker, offered_rate=Decimal("73.50"))
        # Attendance evaluates live evidence; posted shifts also require the persisted public-profile decision.
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.verified)
        response = client_for(self.worker).post(f"/api/v1/shift-offers/{offer.pk}/accept/", CONSENT, format="json")
        self.assertEqual(response.status_code, 403, response.content[:300])
        self.assertIn("Verify your profile", str(response.data))
        offer.refresh_from_db()
        self.assertEqual(offer.status, ShiftOffer.Status.PENDING)
        self.assertIsNone(offer.engagement_terms_accepted_at)
        self.assertFalse(ShiftSlotAssignment.objects.filter(source_offer=offer).exists())

        from onboarding.verification.policy import refresh_verified
        self.assertTrue(refresh_verified(self.profile))
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.verified)
        with self.captureOnCommitCallbacks(execute=True):
            response = client_for(self.worker).post(f"/api/v1/shift-offers/{offer.pk}/accept/", CONSENT, format="json")
        self.assertEqual(response.status_code, 200, response.content[:300])
        offer.refresh_from_db()
        self.assertIsNotNone(offer.engagement_terms_accepted_at)
        # Offer acceptance reserves first; existing finalization owns assignment creation.
        from shifts.finalize import finalize_shift_offer
        with self.captureOnCommitCallbacks(execute=True):
            finalize_shift_offer(offer)
        booked = ShiftSlotAssignment.objects.get(source_offer=offer)
        self.assertEqual(booked.engagement_terms_accepted_at, offer.engagement_terms_accepted_at)
        self.assert_sources(booked, True)
        self.assert_no_payment()
