from datetime import date, time
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from client_profile.models import (
    InvoiceLineItem,
    OtherStaffOnboarding,
    Pharmacy,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
)
from client_profile.serializers import InvoiceSerializer
from client_profile.services import generate_invoice_from_shifts


User = get_user_model()


class AcceptedShiftInvoiceIntegrityTests(TestCase):
    def setUp(self):
        self.worker = User.objects.create_user(
            email="invoice-integrity@example.com",
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
            email="invoice-owner@example.com",
            password="test-pass",
            role="OWNER",
            first_name="Invoice",
            last_name="Owner",
        )
        self.pharmacy = Pharmacy.objects.create(
            name="Invoice Integrity Pharmacy",
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

    def _generate(self, custom_lines=None):
        return generate_invoice_from_shifts(
            user=self.worker,
            pharmacy_id=self.pharmacy.id,
            shift_ids=[self.shift.id],
            custom_lines=custom_lines or [],
            external=False,
            billing_data=self._billing_data(),
        )

    def test_internal_invoice_snapshots_accepted_assignment_and_does_not_assume_super(self):
        invoice = self._generate()
        service_line = invoice.line_items.get(category_code="ProfessionalServices")

        self.assertEqual(service_line.source_assignment_id, self.assignment.id)
        self.assertEqual(service_line.total, Decimal("560.00"))
        self.assertFalse(service_line.super_applicable)
        self.assertEqual(invoice.source_snapshot["source"], "INTERNAL_ABN_SHIFT_ASSIGNMENTS")
        self.assertEqual(invoice.source_snapshot["assignment_ids"], [self.assignment.id])
        self.assertEqual(invoice.subtotal, Decimal("560.00"))
        self.assertEqual(invoice.gst_amount, Decimal("56.00"))
        self.assertEqual(invoice.super_amount, Decimal("0.00"))
        self.assertEqual(invoice.total, Decimal("616.00"))
        self.assertFalse(invoice.line_items.filter(category_code="Superannuation").exists())

    def test_same_accepted_assignment_cannot_be_invoiced_twice(self):
        first = self._generate()
        with self.assertRaises(ValidationError):
            self._generate()
        self.assertEqual(
            InvoiceLineItem.objects.filter(
                source_assignment=self.assignment,
                category_code="ProfessionalServices",
            ).count(),
            1,
        )
        self.assertEqual(first.source_snapshot["assignment_ids"], [self.assignment.id])

    def test_explicit_manual_super_line_is_the_canonical_super_amount(self):
        invoice = self._generate(custom_lines=[{
            "description": "Superannuation after contractor SG review",
            "category_code": "Superannuation",
            "unit": "Lump Sum",
            "quantity": "1.00",
            "unit_price": "67.20",
            "discount": "0",
            "gst_applicable": False,
            "super_applicable": False,
        }])
        super_line = invoice.line_items.get(category_code="Superannuation")

        self.assertTrue(super_line.was_modified)
        self.assertEqual(invoice.subtotal, Decimal("560.00"))
        self.assertEqual(invoice.gst_amount, Decimal("56.00"))
        self.assertEqual(invoice.super_amount, Decimal("67.20"))
        self.assertEqual(invoice.total, Decimal("683.20"))

    def test_editing_internal_invoice_preserves_locked_professional_line(self):
        invoice = self._generate()
        protected = invoice.line_items.get(category_code="ProfessionalServices")

        serializer = InvoiceSerializer(
            instance=invoice,
            data={
                "line_items": [
                    {
                        "description": "Attempted replacement",
                        "category_code": "ProfessionalServices",
                        "unit": "Hours",
                        "quantity": "1.00",
                        "unit_price": "1.00",
                        "discount": "0",
                        "gst_applicable": True,
                        "super_applicable": False,
                        "is_manual": True,
                    },
                    {
                        "description": "Travel reimbursement",
                        "category_code": "Transportation",
                        "unit": "Lump Sum",
                        "quantity": "1.00",
                        "unit_price": "50.00",
                        "discount": "0",
                        "gst_applicable": False,
                        "super_applicable": False,
                        "is_manual": True,
                    },
                ]
            },
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()

        protected.refresh_from_db()
        self.assertEqual(protected.source_assignment_id, self.assignment.id)
        self.assertEqual(protected.total, Decimal("560.00"))
        self.assertEqual(
            updated.line_items.filter(
                category_code="ProfessionalServices",
                source_assignment=self.assignment,
            ).count(),
            1,
        )
        self.assertEqual(
            updated.line_items.get(category_code="Transportation").total,
            Decimal("50.00"),
        )
        self.assertEqual(updated.subtotal, Decimal("610.00"))
        self.assertEqual(updated.gst_amount, Decimal("56.00"))
        self.assertEqual(updated.total, Decimal("666.00"))
