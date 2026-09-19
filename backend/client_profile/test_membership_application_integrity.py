from datetime import date, time, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from client_profile.engagement_routing import (
    PAYMENT_ABN,
    PAYMENT_TFN,
    SETTLEMENT_INVOICE,
    SETTLEMENT_PAYROLL,
    SETTLEMENT_TIMESHEET_ONLY,
    build_shift_engagement_terms,
    staff_assignment_defaults,
)
from client_profile.models import (
    Membership,
    MembershipApplication,
    MembershipInviteLink,
    Pharmacy,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
)
from client_profile.serializers import (
    MembershipApplicationReviewSerializer,
    MembershipApplicationSerializer,
)
from client_profile.services import validate_internal_invoice_shifts


User = get_user_model()


class MembershipApplicationIntegrityTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            email="manager@example.com",
            password="test-pass",
            role="OWNER",
        )
        self.pharmacy = Pharmacy.objects.create(name="Integrity Pharmacy")
        self.staff_link = MembershipInviteLink.objects.create(
            pharmacy=self.pharmacy,
            created_by=self.manager,
            category="FULL_PART_TIME",
            expires_at=timezone.now() + timedelta(days=7),
        )
        self.favourite_link = MembershipInviteLink.objects.create(
            pharmacy=self.pharmacy,
            created_by=self.manager,
            category="LOCUM_CASUAL",
            expires_at=timezone.now() + timedelta(days=7),
        )

    def _payload(self, *, link=None, email="candidate@example.com", mobile="0412345678"):
        target_link = link or self.staff_link
        return {
            "invite_link": target_link.pk,
            "role": "PHARMACIST",
            "first_name": "Alex",
            "last_name": "Smith",
            "username": "alex.smith",
            "mobile_number": mobile,
            "date_of_birth": "1990-01-02",
            "job_title": "Pharmacist" if target_link.category == "FULL_PART_TIME" else "",
            "email": email,
        }

    def test_same_email_cannot_create_two_pending_applications_for_pharmacy(self):
        first = MembershipApplicationSerializer(data=self._payload())
        self.assertTrue(first.is_valid(), first.errors)
        first.save()

        second = MembershipApplicationSerializer(
            data=self._payload(mobile="0499999999"),
        )
        self.assertFalse(second.is_valid())
        self.assertIn("email", second.errors)
        self.assertEqual(
            MembershipApplication.objects.filter(
                pharmacy=self.pharmacy,
                status="PENDING",
            ).count(),
            1,
        )

    def test_same_mobile_and_dob_cannot_create_second_pending_identity(self):
        first = MembershipApplicationSerializer(data=self._payload())
        self.assertTrue(first.is_valid(), first.errors)
        first.save()

        second = MembershipApplicationSerializer(
            data=self._payload(
                email="candidate2@example.com",
                mobile="0412345678",
            ),
        )
        self.assertFalse(second.is_valid())
        self.assertIn("mobile_number", second.errors)

    def test_review_locks_identifiers_and_audits_employment_changes(self):
        serializer = MembershipApplicationSerializer(data=self._payload())
        self.assertTrue(serializer.is_valid(), serializer.errors)
        app = serializer.save()

        request = SimpleNamespace(user=self.manager)
        locked = MembershipApplicationReviewSerializer(
            instance=app,
            data={"email": "changed@example.com"},
            partial=True,
            context={"request": request},
        )
        self.assertFalse(locked.is_valid())
        self.assertIn("email", locked.errors)

        review = MembershipApplicationReviewSerializer(
            instance=app,
            data={"job_title": "Senior Pharmacist"},
            partial=True,
            context={"request": request},
        )
        self.assertTrue(review.is_valid(), review.errors)
        updated = review.save()
        self.assertEqual(updated.job_title, "Senior Pharmacist")
        self.assertEqual(len(updated.review_changes), 1)
        self.assertEqual(updated.review_changes[0]["field"], "job_title")
        self.assertEqual(updated.review_changes[0]["from"], "Pharmacist")
        self.assertEqual(updated.review_changes[0]["to"], "Senior Pharmacist")
        self.assertEqual(updated.reviewed_by_id, self.manager.id)

    def test_payroll_enabled_staff_requires_award_classification(self):
        self.pharmacy.use_chemisttasker_payroll = True
        self.pharmacy.save(update_fields=["use_chemisttasker_payroll"])

        serializer = MembershipApplicationSerializer(data=self._payload())
        self.assertFalse(serializer.is_valid())
        self.assertIn("pharmacist_award_level", serializer.errors)

        with_classification = MembershipApplicationSerializer(
            data={
                **self._payload(email="classified@example.com", mobile="0411222333"),
                "pharmacist_award_level": "PHARMACIST",
            }
        )
        self.assertTrue(with_classification.is_valid(), with_classification.errors)

    def test_favourite_application_does_not_require_award_classification(self):
        self.pharmacy.use_chemisttasker_payroll = True
        self.pharmacy.save(update_fields=["use_chemisttasker_payroll"])

        serializer = MembershipApplicationSerializer(
            data=self._payload(
                link=self.favourite_link,
                email="locum@example.com",
                mobile="0422333444",
            )
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)


class PayrollOptInRosterRoutingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="staff@example.com",
            password="test-pass",
            role="PHARMACIST",
        )
        self.pharmacy = Pharmacy.objects.create(
            name="Timesheet Pharmacy",
            use_chemisttasker_payroll=False,
        )
        self.membership = Membership.objects.create(
            user=self.user,
            pharmacy=self.pharmacy,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

    def test_payroll_off_direct_staff_assignment_does_not_require_engagement_or_rates(self):
        result = staff_assignment_defaults(
            user=self.user,
            pharmacy=self.pharmacy,
            work_date=date(2026, 9, 19),
        )
        self.assertEqual(result["settlement_channel"], SETTLEMENT_TIMESHEET_ONLY)
        self.assertEqual(result["payment_preference_snapshot"], "TFN")
        self.assertFalse(result["engagement_terms_snapshot"]["payroll_enabled"])

    def test_payroll_on_keeps_strict_payment_profile_and_engagement_path(self):
        self.pharmacy.use_chemisttasker_payroll = True
        self.pharmacy.save(update_fields=["use_chemisttasker_payroll"])

        with self.assertRaises(ValidationError):
            staff_assignment_defaults(
                user=self.user,
                pharmacy=self.pharmacy,
                work_date=date(2026, 9, 19),
            )


class ExternalShiftSettlementRoutingTests(TestCase):
    @staticmethod
    def _objects(*, payroll_enabled, payment_preference):
        pharmacy = SimpleNamespace(
            id=91,
            name="External Shift Pharmacy",
            abn="51824753556",
            use_chemisttasker_payroll=payroll_enabled,
        )
        slot = SimpleNamespace(
            id=501,
            date=date(2026, 9, 20),
            start_time="09:00:00",
            end_time="17:00:00",
            rate=None,
        )
        shift = SimpleNamespace(
            id=401,
            pharmacy=pharmacy,
            role_needed="PHARMACIST",
            visibility="PUBLIC",
            payment_preference=payment_preference,
            fixed_rate=None,
        )
        offer = SimpleNamespace(
            slot_id=slot.id,
            slot=slot,
            offered_slot_date=slot.date,
            offered_start_time=slot.start_time,
            offered_end_time=slot.end_time,
            offered_rate="72.50",
        )
        user = SimpleNamespace(
            id=301,
            email="external@example.com",
            get_full_name=lambda: "External Worker",
        )
        return pharmacy, shift, offer, user

    @patch("client_profile.engagement_routing.direct_pharmacy_staff_membership", return_value=None)
    @patch("client_profile.engagement_routing._external_payment_profile")
    def test_abn_external_shift_is_invoice_routed_with_frozen_agreed_rate(
        self,
        external_profile,
        _direct_membership,
    ):
        _, shift, offer, user = self._objects(
            payroll_enabled=True,
            payment_preference=PAYMENT_ABN,
        )
        external_profile.return_value = (
            SimpleNamespace(
                abn="51824753556",
                abn_entity_name="External Services Pty Ltd",
                gst_registered=True,
                abn_gst_registered=True,
            ),
            PAYMENT_ABN,
        )

        terms = build_shift_engagement_terms(shift=shift, user=user, offer=offer)

        self.assertEqual(terms["settlement_channel"], SETTLEMENT_INVOICE)
        self.assertEqual(terms["engagement_kind"], "INDEPENDENT_CONTRACTOR")
        self.assertEqual(terms["payment_preference"], PAYMENT_ABN)
        self.assertEqual(terms["occurrences"][0]["agreed_rate"], "72.50")
        self.assertTrue(terms["acceptance_required"])
        self.assertTrue(terms["super_review_required"])

    @patch("client_profile.engagement_routing.direct_pharmacy_staff_membership", return_value=None)
    @patch("client_profile.engagement_routing._external_payment_profile")
    def test_tfn_external_shift_routes_to_chemisttasker_payroll_when_enabled(
        self,
        external_profile,
        _direct_membership,
    ):
        _, shift, offer, user = self._objects(
            payroll_enabled=True,
            payment_preference=PAYMENT_TFN,
        )
        external_profile.return_value = (
            SimpleNamespace(
                super_fund_name="Example Super",
                super_usi="EXAMPLE123",
                super_member_number="MEMBER123",
            ),
            PAYMENT_TFN,
        )

        terms = build_shift_engagement_terms(shift=shift, user=user, offer=offer)

        self.assertEqual(terms["settlement_channel"], SETTLEMENT_PAYROLL)
        self.assertEqual(terms["engagement_kind"], "SHIFT_EMPLOYMENT")
        self.assertEqual(terms["payment_preference"], PAYMENT_TFN)
        self.assertEqual(terms["occurrences"][0]["agreed_rate"], "72.50")
        self.assertTrue(terms["acceptance_required"])

    @patch("client_profile.engagement_routing.direct_pharmacy_staff_membership", return_value=None)
    @patch("client_profile.engagement_routing._external_payment_profile")
    def test_tfn_external_shift_routes_to_timesheet_only_when_payroll_disabled(
        self,
        external_profile,
        _direct_membership,
    ):
        _, shift, offer, user = self._objects(
            payroll_enabled=False,
            payment_preference=PAYMENT_TFN,
        )
        external_profile.return_value = (
            SimpleNamespace(
                super_fund_name="Example Super",
                super_usi="EXAMPLE123",
                super_member_number="MEMBER123",
            ),
            PAYMENT_TFN,
        )

        terms = build_shift_engagement_terms(shift=shift, user=user, offer=offer)

        self.assertEqual(terms["settlement_channel"], SETTLEMENT_TIMESHEET_ONLY)
        self.assertEqual(terms["engagement_kind"], "SHIFT_EMPLOYMENT")
        self.assertEqual(terms["payment_preference"], PAYMENT_TFN)
        self.assertEqual(terms["occurrences"][0]["agreed_rate"], "72.50")
        self.assertTrue(terms["acceptance_required"])


class InvoiceSettlementBoundaryTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="invoice-worker@example.com",
            password="test-pass",
            role="OTHER_STAFF",
        )
        self.pharmacy = Pharmacy.objects.create(name="Invoice Boundary Pharmacy")

    def _assignment(self, *, settlement_channel, engagement_kind, day):
        shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="ASSISTANT",
            employment_type="LOCUM",
        )
        slot = ShiftSlot.objects.create(
            shift=shift,
            date=day,
            start_time=time(9, 0),
            end_time=time(17, 0),
        )
        assignment = ShiftSlotAssignment.objects.create(
            shift=shift,
            slot=slot,
            slot_date=day,
            user=self.user,
            unit_rate="70.00",
            settlement_channel=settlement_channel,
            engagement_kind=engagement_kind,
            engagement_terms_accepted_at=timezone.now(),
            engagement_terms_snapshot={
                "occurrences": [{
                    "slot_id": slot.id,
                    "date": str(day),
                    "agreed_rate": "70.00",
                }]
            },
        )
        return shift, assignment

    def test_only_accepted_invoice_routed_assignment_can_enter_internal_invoice(self):
        invoice_shift, _ = self._assignment(
            settlement_channel=SETTLEMENT_INVOICE,
            engagement_kind="INDEPENDENT_CONTRACTOR",
            day=date(2026, 9, 20),
        )
        assignments = validate_internal_invoice_shifts(
            self.user,
            [invoice_shift.id],
            pharmacy_id=self.pharmacy.id,
        )
        self.assertEqual(len(assignments), 1)
        self.assertEqual(assignments[0].settlement_channel, SETTLEMENT_INVOICE)

    def test_payroll_or_timesheet_assignment_cannot_enter_internal_invoice(self):
        payroll_shift, _ = self._assignment(
            settlement_channel=SETTLEMENT_PAYROLL,
            engagement_kind="SHIFT_EMPLOYMENT",
            day=date(2026, 9, 21),
        )
        with self.assertRaises(ValidationError):
            validate_internal_invoice_shifts(
                self.user,
                [payroll_shift.id],
                pharmacy_id=self.pharmacy.id,
            )

        timesheet_shift, _ = self._assignment(
            settlement_channel=SETTLEMENT_TIMESHEET_ONLY,
            engagement_kind="SHIFT_EMPLOYMENT",
            day=date(2026, 9, 22),
        )
        with self.assertRaises(ValidationError):
            validate_internal_invoice_shifts(
                self.user,
                [timesheet_shift.id],
                pharmacy_id=self.pharmacy.id,
            )
