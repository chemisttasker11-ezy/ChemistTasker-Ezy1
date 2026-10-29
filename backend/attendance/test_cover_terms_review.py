"""E17 review regressions: real admission/approval contexts and wire contracts."""
import json
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase

from attendance.models import ProvisionalAttendance
from attendance.test_cover_terms_acceptance import CoverTermsFixture
from client_profile.characterization_support import client_for, make_owner_with_pharmacy
from invoicing.services import generate_preview_invoice_lines
from organizations.models import Chain, Organization
from worker_finance.services import internal_invoice_sources
from workforce.models import EmploymentEngagement, Timesheet, TimesheetPeriod
from workforce.timesheets import approve_timesheet, build_timesheet


class CoverTermsListReviewTests(CoverTermsFixture, TestCase):
    def test_fe_b1_list_after_accept_exposes_top_level_acceptance_and_frozen_preview(self):
        assignment = self.cover().backfill_assignment
        before = self.discover()[0]
        response = self.accept(assignment)
        self.assertEqual(response.status_code, 200, response.content[:300])
        assignment.refresh_from_db()
        # Assert the serialized LIST contract, not only POST's Python response.data.
        row = client_for(self.worker).get("/api/v1/attendance/worker/cover-terms/").json()[0]
        # Used to refresh shared-core/test-support/acceptedCoverBackendRow.json after API changes.
        print("E17_ACCEPTED_LIST_ROW=" + json.dumps(row, sort_keys=True))
        self.assertEqual(row["assignment_id"], assignment.pk)
        self.assertIn("engagement_terms_accepted_at", row)
        self.assertEqual(row.get("engagement_terms_accepted_at"),
                         assignment.engagement_terms_accepted_at.isoformat().replace("+00:00", "Z"))
        self.assertEqual(row["engagement_terms_preview"]["accepted_at"],
                         assignment.engagement_terms_snapshot["accepted_at"])
        self.assertFalse(row["engagement_terms_preview"]["blocked"])
        self.assertIn("engagement_terms_accepted_at", before)
        self.assertIsNone(before["engagement_terms_accepted_at"])

    def test_fe_b2_complete_abn_preview_explicitly_excludes_profile_repair(self):
        self.cover()
        terms = self.discover()[0]["engagement_terms_preview"]
        self.assertEqual(terms["settlement_channel"], "INVOICE")
        self.assertFalse(terms["blocked"])
        self.assertIs(terms.get("payment_profile_incomplete"), False)

    def test_fe_b2_incomplete_abn_preview_explicitly_identifies_profile_repair(self):
        self.profile.abn_verified = False
        self.profile.save(update_fields=["abn_verified"])
        assignment = self.cover().backfill_assignment
        terms = self.discover()[0]["engagement_terms_preview"]
        self.assertTrue(terms["blocked"])
        self.assertIs(terms.get("payment_profile_incomplete"), True)
        self.assertEqual(self.accept(assignment).status_code, 400)

    def test_fe_b2_local_staff_preview_explicitly_excludes_profile_repair(self):
        self.member()
        self.cover("UNROSTERED_LOCAL")
        terms = self.discover()[0]["engagement_terms_preview"]
        self.assertEqual(terms["engagement_kind"], "STAFF_EMPLOYMENT")
        self.assertEqual(terms["settlement_channel"], "TIMESHEET_ONLY")
        self.assertIs(terms.get("payment_profile_incomplete"), False)

    def test_fe_b2_tfn_preview_explicitly_excludes_profile_repair(self):
        self.profile.payment_preference = "TFN"
        self.profile.save(update_fields=["payment_preference"])
        self.cover()
        terms = self.discover()[0]["engagement_terms_preview"]
        self.assertEqual(terms["settlement_channel"], "TIMESHEET_ONLY")
        self.assertIs(terms.get("payment_profile_incomplete"), False)


class RealCoverRoutingFixture(CoverTermsFixture):
    def real_review(self, tier):
        membership = None
        if tier == "UNROSTERED_LOCAL":
            membership = self.member()
        elif tier == "FAVOURITE_COVER":
            membership = self.member(employment_type="LOCUM")
        elif tier.startswith("CROSS_SITE"):
            _, sister = make_owner_with_pharmacy("Actual sister pharmacy")
            membership = self.member(pharmacy=sister)
            if tier == "CROSS_SITE_CHAIN":
                chain = Chain.objects.create(name="Actual cover chain", is_active=True)
                chain.pharmacies.add(self.pharmacy, sister)
            else:
                organization = Organization.objects.create(name="Actual cover organization")
                for pharmacy in (self.pharmacy, sister):
                    pharmacy.organization = organization
                    pharmacy.save(update_fields=["organization"])
        session = self.assert_cover(self.scan(), tier, source_membership=membership)
        self.now += timedelta(hours=1)
        with self.captureOnCommitCallbacks(execute=True):
            response = client_for(self.worker).post("/api/v1/attendance/worker/clock-out/", {
                "qr_token": self.qr(),
            }, format="json")
        self.assertEqual(response.status_code, 200, response.content[:300])
        return ProvisionalAttendance.objects.get(session=session)

    def approve_real(self, review):
        response = self.decide_review(review)
        self.assertEqual(response.status_code, 200, response.content[:300])
        review.refresh_from_db()
        return review.backfill_assignment

    def pharmacy_rate(self):
        self.pharmacy.default_rate_type = "FIXED"
        self.pharmacy.default_fixed_rate = Decimal("68.25")
        self.pharmacy.rate_weekday = Decimal("68.25")
        self.pharmacy.state = "QLD"
        self.pharmacy.public_holiday_region = "QLD_BRISBANE"
        self.pharmacy.save()

    def complete_tfn(self):
        self.profile.payment_preference = "TFN"
        self.profile.tfn_number = "123456789"
        self.profile.super_fund_name = "Example Super"
        self.profile.super_usi = "EXAMPLE123"
        self.profile.super_member_number = "MEMBER123"
        self.profile.save()

    def assert_timesheet_path(self, review, membership=None):
        day = review.backfill_assignment.slot_date
        monday = day - timedelta(days=day.weekday())
        period = TimesheetPeriod.objects.create(
            pharmacy=self.pharmacy, start_date=monday, end_date=monday + timedelta(days=6),
            timezone="Australia/Brisbane", created_by=self.owner,
        )
        timesheet = Timesheet.objects.create(period=period, user=self.worker, membership=membership)
        revision = build_timesheet(timesheet.pk, actor=self.manager, force=True)
        self.assertFalse(revision.checks.filter(severity="BLOCKER").exists(),
                         list(revision.checks.values_list("code", "message")))
        timesheet.refresh_from_db()
        self.assertEqual(timesheet.worked_minutes, 60)
        self.assertNotEqual(timesheet.status, "APPROVED")
        approve_timesheet(timesheet, self.manager, revision.revision_number)
        timesheet.refresh_from_db()
        self.assertEqual((timesheet.status, timesheet.reviewed_minutes), ("APPROVED", 60))
        self.assert_sources(review.backfill_assignment, False)
        self.assert_no_payment()


class RealCoverRoutingReviewTests(RealCoverRoutingFixture, TestCase):
    def assert_rate_refused_without_stamping(self, assignment):
        assignment.refresh_from_db()
        original = (assignment.unit_rate, assignment.rate_reason, assignment.settlement_channel,
                    assignment.engagement_terms_snapshot)
        response = self.accept(assignment)
        assignment.refresh_from_db()
        actual = (response.status_code, assignment.engagement_terms_accepted_at,
                  assignment.engagement_terms_snapshot.get("occurrences"))
        self.assertEqual(response.status_code, 400, f"Unusable invoice pricing must refuse acceptance; actual={actual}")
        self.assertRegex(str(response.json()).lower(), r"rate|pric")
        self.assertEqual((assignment.unit_rate, assignment.rate_reason, assignment.settlement_channel,
                          assignment.engagement_terms_snapshot), original)
        self.assert_unaccepted(assignment)
        terms = self.discover()[0]["engagement_terms_preview"]
        self.assertTrue(terms["blocked"])
        self.assertRegex(terms["notice"].lower(), r"rate|pric")
        self.assertIs(terms.get("payment_profile_incomplete"), False)

    def test_gap2_missing_pharmacy_pricing_refuses_acceptance_without_stamping(self):
        self.pharmacy.state = "QLD"
        self.pharmacy.public_holiday_region = "QLD_BRISBANE"
        for field in ("rate_weekday", "rate_saturday", "rate_sunday", "rate_public_holiday",
                      "rate_early_morning", "rate_late_night", "default_fixed_rate"):
            setattr(self.pharmacy, field, None)
        self.pharmacy.save()
        assignment = self.approve_real(self.real_review("UNBOOKED_LOCUM_COVER"))
        self.assert_rate_refused_without_stamping(assignment)

    def test_gap2_missing_weekday_rate_refuses_then_configuration_allows_acceptance(self):
        self.pharmacy_rate()
        self.pharmacy.rate_weekday = None
        self.pharmacy.rate_saturday = Decimal("85")
        self.pharmacy.rate_sunday = Decimal("95")
        self.pharmacy.rate_public_holiday = Decimal("120")
        self.pharmacy.save()
        review = self.real_review("UNBOOKED_LOCUM_COVER")
        assignment = self.approve_real(review)
        self.assertLess(assignment.slot_date.weekday(), 5)
        self.assert_rate_refused_without_stamping(assignment)
        self.pharmacy_rate()
        response = self.accept(assignment)
        self.assertEqual(response.status_code, 200, response.content[:300])
        assignment.refresh_from_db()
        self.assertEqual(assignment.engagement_terms_snapshot["occurrences"][0]["agreed_rate"], "68.25")
        self.assert_sources(assignment, True)
        self.assert_no_payment()

    def test_gap2_existing_zero_assignment_rate_cannot_be_frozen(self):
        self.pharmacy_rate()
        assignment = self.approve_real(self.real_review("UNBOOKED_LOCUM_COVER"))
        assignment.unit_rate = Decimal("0.00")
        assignment.rate_reason = {"source": "ManagerConfigured"}
        assignment.save(update_fields=["unit_rate", "rate_reason"])
        self.assert_rate_refused_without_stamping(assignment)

    def assert_local_payroll_abn_notice(self):
        self.pharmacy_rate()
        self.pharmacy.use_chemisttasker_payroll = True
        self.pharmacy.save(update_fields=["use_chemisttasker_payroll"])
        assignment = self.approve_real(self.real_review("UNROSTERED_LOCAL"))
        terms = client_for(self.worker).get("/api/v1/attendance/worker/cover-terms/").json()[0]["engagement_terms_preview"]
        self.assertTrue(terms["blocked"])
        self.assertIs(terms.get("payment_profile_incomplete"), False, terms)
        self.assertRegex(terms["notice"].lower(), r"timesheet|payroll")
        self.assertNotIn("complete your abn", terms["notice"].lower())
        self.assertEqual(self.accept(assignment).status_code, 400)
        self.assert_unaccepted(assignment)

    def test_gap3_payroll_enabled_local_abn_staff_gets_timesheet_notice_without_abn_repair(self):
        self.assert_local_payroll_abn_notice()

    def test_gap3_local_incomplete_abn_still_does_not_request_abn_repair(self):
        self.profile.abn_verified = False
        self.profile.save(update_fields=["abn_verified"])
        self.assert_local_payroll_abn_notice()

    def test_gap3_local_tfn_missing_employment_terms_does_not_request_abn_repair(self):
        self.complete_tfn()
        self.pharmacy.use_chemisttasker_payroll = True
        self.pharmacy.save(update_fields=["use_chemisttasker_payroll"])
        assignment = self.approve_real(self.real_review("UNROSTERED_LOCAL"))
        terms = self.discover()[0]["engagement_terms_preview"]
        self.assertTrue(terms["blocked"])
        self.assertIs(terms.get("payment_profile_incomplete"), False, terms)
        self.assertRegex(terms["notice"].lower(), r"timesheet|payroll")
        self.assertEqual(self.accept(assignment).status_code, 400)
        self.assert_unaccepted(assignment)

    def test_a3_approval_without_injected_rate_freezes_server_price_and_both_invoice_readers(self):
        self.pharmacy_rate()
        review = self.real_review("UNBOOKED_LOCUM_COVER")
        assignment = self.approve_real(review)
        self.assertEqual(assignment.shift.fixed_rate, Decimal("68.25"))
        self.assert_unaccepted(assignment)
        response = self.accept(assignment)
        self.assertEqual(response.status_code, 200, response.content[:300])
        assignment.refresh_from_db()
        occurrence = assignment.engagement_terms_snapshot["occurrences"][0]
        self.assertEqual(occurrence["agreed_rate"], "68.25")
        self.assertEqual(assignment.unit_rate, Decimal("68.25"))
        self.assertEqual(internal_invoice_sources(self.worker)[0]["assignment_id"], assignment.pk)
        self.assertEqual(generate_preview_invoice_lines(assignment.shift, self.worker)[0]["unit_price"], 68.25)
        self.assert_no_payment()

    def test_a5_local_staff_tfn_payroll_approval_reaches_normal_timesheet_approval(self):
        self.pharmacy_rate()
        self.complete_tfn()
        self.pharmacy.use_chemisttasker_payroll = True
        self.pharmacy.save(update_fields=["use_chemisttasker_payroll"])
        review = self.real_review("UNROSTERED_LOCAL")
        membership = review.session.source_membership
        engagement = EmploymentEngagement.objects.create(
            membership=membership, effective_from=review.session.started_at.date(),
            role="PHARMACIST", employment_type="FULL_TIME", pay_basis="AWARD",
            award_classification="PHARMACIST", award_rate_snapshot={}, ordinary_hours_pattern={},
            rate_weekday="68.25", rate_saturday="80.00", rate_sunday="90.00", rate_public_holiday="100.00",
            created_by=self.owner, updated_by=self.owner,
        )
        assignment = self.approve_real(review)
        self.assertEqual((assignment.settlement_channel, assignment.engagement_kind), ("PAYROLL", "STAFF_EMPLOYMENT"))
        self.assertIn(str(engagement.public_id), assignment.engagement_terms_snapshot["employment_engagement_public_ids"])
        self.assert_unaccepted(assignment)
        self.assertEqual(self.accept(assignment).status_code, 400)
        self.assert_timesheet_path(review, membership)
        self.assertIs(self.discover()[0]["engagement_terms_preview"].get("payment_profile_incomplete"), False)

    def test_a5_local_staff_abn_stays_timesheet_only_and_reaches_time_approval(self):
        review = self.real_review("UNROSTERED_LOCAL")
        assignment = self.approve_real(review)
        self.assertEqual((assignment.settlement_channel, assignment.engagement_kind),
                         ("TIMESHEET_ONLY", "STAFF_EMPLOYMENT"))
        self.assert_unaccepted(assignment)
        self.assertEqual(self.accept(assignment).status_code, 400)
        self.assert_timesheet_path(review, review.session.source_membership)

    def test_a5_external_tfn_payroll_approval_reaches_normal_timesheet_approval(self):
        self.pharmacy_rate()
        self.complete_tfn()
        self.pharmacy.use_chemisttasker_payroll = True
        self.pharmacy.save(update_fields=["use_chemisttasker_payroll"])
        review = self.real_review("UNBOOKED_LOCUM_COVER")
        assignment = self.approve_real(review)
        self.assertEqual((assignment.settlement_channel, assignment.engagement_kind), ("PAYROLL", "SHIFT_EMPLOYMENT"))
        self.assert_unaccepted(assignment)
        self.assertEqual(self.accept(assignment).status_code, 400)
        self.assert_timesheet_path(review)
        self.assertIs(self.discover()[0]["engagement_terms_preview"].get("payment_profile_incomplete"), False)


def invoice_tier(tier):
    def test(self):
        self.pharmacy_rate()
        review = self.real_review(tier)
        assignment = self.approve_real(review)
        self.assertEqual((assignment.settlement_channel, assignment.engagement_kind), ("INVOICE", "INDEPENDENT_CONTRACTOR"))
        self.assert_unaccepted(assignment)
        self.assertEqual(self.accept(assignment).status_code, 200)
        assignment.refresh_from_db()
        self.assertEqual(assignment.engagement_terms_snapshot["occurrences"][0]["agreed_rate"], "68.25")
        self.assert_sources(assignment, True)
        self.assertEqual(internal_invoice_sources(self.worker)[0]["assignment_id"], assignment.pk)
        self.assertEqual(generate_preview_invoice_lines(assignment.shift, self.worker)[0]["unit_price"], 68.25)
        self.assert_no_payment()
    return test


def incomplete_tier(tier, missing):
    def test(self):
        review = self.real_review(tier)
        if missing == "no_profile":
            self.profile.delete()
        else:
            self.profile.abn_verified = False
            self.profile.save(update_fields=["abn_verified"])
        assignment = self.approve_real(review)
        # Local staff retain employment precedence even with an absent/incomplete ABN profile.
        expected_kind = "STAFF_EMPLOYMENT" if tier == "UNROSTERED_LOCAL" else (
            "" if missing == "no_profile" else "INDEPENDENT_CONTRACTOR")
        self.assertEqual((assignment.settlement_channel, assignment.engagement_kind), ("TIMESHEET_ONLY", expected_kind))
        self.assert_unaccepted(assignment)
        self.assertEqual(self.accept(assignment).status_code, 400)
        self.assert_no_payment()
    return test


for _tier in ("UNBOOKED_LOCUM_COVER", "FAVOURITE_COVER", "CROSS_SITE_CHAIN", "CROSS_SITE_ORG"):
    setattr(RealCoverRoutingReviewTests, f"test_a3_a5_real_{_tier.lower()}_abn_approval_to_invoice", invoice_tier(_tier))
for _tier in ("UNBOOKED_LOCUM_COVER", "FAVOURITE_COVER", "UNROSTERED_LOCAL", "CROSS_SITE_CHAIN", "CROSS_SITE_ORG"):
    for _missing in ("no_profile", "incomplete_abn"):
        setattr(RealCoverRoutingReviewTests, f"test_a5_real_{_tier.lower()}_{_missing}_approval_allowed", incomplete_tier(_tier, _missing))
