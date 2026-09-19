from datetime import date, timedelta
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from client_profile.engagement_routing import (
    SETTLEMENT_TIMESHEET_ONLY,
    staff_assignment_defaults,
)
from client_profile.models import (
    Membership,
    MembershipApplication,
    MembershipInviteLink,
    Pharmacy,
)
from client_profile.serializers import (
    MembershipApplicationReviewSerializer,
    MembershipApplicationSerializer,
)


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
