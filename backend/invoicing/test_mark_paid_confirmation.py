from uuid import uuid4
from django.apps import apps
from django.test import TestCase
from django.utils import timezone
from client_profile.characterization_support import client_for, make_user


class Claim4SuperMarkPaidClientPayload(TestCase):
    def setUp(self):
        from onboarding.models import OwnerOnboarding
        from organizations.models import Pharmacy
        self.worker = make_user("PHARMACIST")
        owner = make_user("OWNER")
        self.pharmacy = Pharmacy.objects.create(
            name="Fin204", owner=OwnerOnboarding.objects.create(user=owner, phone_number="0400000000", role="MANAGER"))

    def invoice(self, **changes):
        Invoice = apps.get_model("invoicing", "Invoice")
        return Invoice.objects.create(
            user=self.worker, pharmacy=self.pharmacy, source="internal", request_key=uuid4(), status="sent",
            payload={"invoice_date": timezone.localdate().isoformat()},
            calculation={"payable": "96.00", "gst": "0.00", "sales_gross": "0.00"}, **changes)

    def mark_paid(self, record, body):
        return client_for(self.worker).post(f"/api/v1/finance/invoices/{record.pk}/mark-paid/", body, format="json")

    def test_shared_core_confirmed_payload_marks_super_paid(self):
        # The client now passes the explicit fund confirmation.
        r = self.mark_paid(self.invoice(kind="super_request"), {"version": 1, "fund_payment_confirmed": True})
        self.assertEqual(r.status_code, 200, f"client mark-paid payload rejected: {r.data}")

    def test_claim4_confirmed_payload_control(self):
        r = self.mark_paid(self.invoice(kind="super_request"), {"version": 1, "fund_payment_confirmed": True})
        self.assertEqual(r.status_code, 200, r.data)

    def test_claim4_plain_invoice_control(self):
        self.assertEqual(self.mark_paid(self.invoice(), {"version": 1}).status_code, 200)

    def test_super_payment_still_requires_explicit_fund_confirmation(self):
        for value in ({'version': 1}, {'version': 1, 'fund_payment_confirmed': False}):
            with self.subTest(value=value):
                self.assertEqual(self.mark_paid(self.invoice(kind='super_request'), value).status_code, 400)
