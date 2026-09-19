from datetime import date, time
from queue import Queue
from threading import Barrier, Thread
from unittest import skipUnless

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import close_old_connections, connection, transaction
from django.test import TransactionTestCase
from django.utils import timezone

from client_profile.models import (
    Invoice,
    InvoiceLineItem,
    MembershipApplication,
    MembershipInviteLink,
    OtherStaffOnboarding,
    Pharmacy,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
)
from client_profile.serializers import MembershipApplicationSerializer
from client_profile.services import generate_invoice_from_shifts


User = get_user_model()
POSTGRES_ONLY = skipUnless(
    connection.vendor == "postgresql",
    "PostgreSQL row-lock/constraint semantics required.",
)


@POSTGRES_ONLY
class MembershipApplicationPostgresConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.manager = User.objects.create_user(
            email="pg-manager@example.com",
            password="test-pass",
            role="OWNER",
        )
        self.pharmacy = Pharmacy.objects.create(name="PG Membership Pharmacy")
        self.link = MembershipInviteLink.objects.create(
            pharmacy=self.pharmacy,
            created_by=self.manager,
            category="FULL_PART_TIME",
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )

    def _payload(self):
        return {
            "invite_link": self.link.pk,
            "role": "PHARMACIST",
            "first_name": "Concurrent",
            "last_name": "Applicant",
            "username": "concurrent.applicant",
            "mobile_number": "0412345678",
            "date_of_birth": "1990-01-02",
            "job_title": "Pharmacist",
            "email": "concurrent-applicant@example.com",
        }

    def test_same_identity_concurrent_submission_creates_one_pending_application(self):
        barrier = Barrier(2)
        results = Queue()

        def submit():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                with transaction.atomic():
                    Pharmacy.objects.select_for_update().get(pk=self.pharmacy.pk)
                    serializer = MembershipApplicationSerializer(data=self._payload())
                    if not serializer.is_valid():
                        results.put(("validation", serializer.errors))
                        return
                    app = serializer.save()
                    results.put(("created", app.pk))
            except Exception as exc:  # surface unexpected DB/locking failures to the assertion
                results.put(("exception", repr(exc)))
            finally:
                close_old_connections()

        threads = [Thread(target=submit), Thread(target=submit)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)

        outcomes = [results.get(timeout=5), results.get(timeout=5)]
        self.assertEqual(sum(kind == "created" for kind, _ in outcomes), 1, outcomes)
        self.assertEqual(sum(kind == "validation" for kind, _ in outcomes), 1, outcomes)
        self.assertEqual(sum(kind == "exception" for kind, _ in outcomes), 0, outcomes)
        self.assertEqual(
            MembershipApplication.objects.filter(
                pharmacy=self.pharmacy,
                status="PENDING",
            ).count(),
            1,
        )


@POSTGRES_ONLY
class InvoicePostgresConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.worker = User.objects.create_user(
            email="pg-invoice-worker@example.com",
            password="test-pass",
            role="OTHER_STAFF",
            first_name="Invoice",
            last_name="Worker",
        )
        OtherStaffOnboarding.objects.create(
            user=self.worker,
            role_type="ASSISTANT",
            payment_preference="ABN",
            abn="51824753556",
            abn_verified=True,
            abn_entity_confirmed=True,
            gst_registered=True,
        )
        self.owner = User.objects.create_user(
            email="pg-owner@example.com",
            password="test-pass",
            role="OWNER",
        )
        self.pharmacy = Pharmacy.objects.create(
            name="PG Invoice Pharmacy",
            abn="51824753556",
        )
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            created_by=self.owner,
            role_needed="ASSISTANT",
            employment_type="LOCUM",
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift,
            date=date(2026, 9, 21),
            start_time=time(9, 0),
            end_time=time(17, 0),
        )
        self.assignment = ShiftSlotAssignment.objects.create(
            shift=self.shift,
            slot=self.slot,
            slot_date=self.slot.date,
            user=self.worker,
            unit_rate="70.00",
            settlement_channel="INVOICE",
            engagement_kind="INDEPENDENT_CONTRACTOR",
            engagement_terms_accepted_at=timezone.now(),
            engagement_terms_snapshot={
                "gst_registered": True,
                "super_review_required": True,
                "super_payable_confirmed": False,
                "occurrences": [{
                    "slot_id": self.slot.id,
                    "date": str(self.slot.date),
                    "agreed_rate": "70.00",
                }],
            },
        )

    def _billing_data(self):
        return {
            "shift_ids": [self.shift.id],
            "external": False,
            "gst_registered": True,
            "super_rate_snapshot": "12.00",
            "bank_account_name": "Invoice Worker",
            "bsb": "123456",
            "account_number": "12345678",
            "cc_emails": "",
        }

    def test_concurrent_invoice_creation_bills_assignment_once(self):
        barrier = Barrier(2)
        results = Queue()
        worker_id = self.worker.id
        pharmacy_id = self.pharmacy.id
        shift_id = self.shift.id

        def create_invoice():
            close_old_connections()
            try:
                user = User.objects.get(pk=worker_id)
                barrier.wait(timeout=10)
                invoice = generate_invoice_from_shifts(
                    user=user,
                    pharmacy_id=pharmacy_id,
                    shift_ids=[shift_id],
                    custom_lines=[],
                    external=False,
                    billing_data=self._billing_data(),
                )
                results.put(("created", invoice.pk))
            except ValidationError as exc:
                results.put(("validation", str(exc)))
            except Exception as exc:
                results.put(("exception", repr(exc)))
            finally:
                close_old_connections()

        threads = [Thread(target=create_invoice), Thread(target=create_invoice)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)

        outcomes = [results.get(timeout=5), results.get(timeout=5)]
        self.assertEqual(sum(kind == "created" for kind, _ in outcomes), 1, outcomes)
        self.assertEqual(sum(kind == "validation" for kind, _ in outcomes), 1, outcomes)
        self.assertEqual(sum(kind == "exception" for kind, _ in outcomes), 0, outcomes)
        self.assertEqual(Invoice.objects.count(), 1)
        self.assertEqual(
            InvoiceLineItem.objects.filter(
                source_assignment=self.assignment,
                category_code="ProfessionalServices",
            ).count(),
            1,
        )
