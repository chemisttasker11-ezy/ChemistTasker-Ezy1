"""Audit-only PR200 negative and positive HTTP/finance contract tests.

No application handlers, migrations or product source are changed. TestCase data
are disposable. FAIL on an attack regression is intended and is not a clean pass.
"""
from datetime import date, timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient
from client_profile.characterization_support import (
    client_for, make_owner_with_pharmacy, make_staff_member, make_user,
)
from organizations.models import Organization
from team_calendar.models import CalendarEvent, WorkNote
from shifts.models import Shift
from invoicing.models import Invoice
from billing.models import ShiftPayment


class TenantIsolationContracts(TestCase):
    def setUp(self):
        self.owner_a, self.a = make_owner_with_pharmacy("PR200 A")
        self.owner_b, self.b = make_owner_with_pharmacy("PR200 B")
        self.outsider = make_user("PHARMACIST")
        self.day = date.today() + timedelta(days=21)

    def test_b07_event_patch_denies_destination_pharmacy(self):
        event = CalendarEvent.objects.create(
            pharmacy=self.a, title="Private A calendar", date=self.day,
            created_by=self.owner_a,
        )
        response = client_for(self.owner_a).patch(
            f"/api/v1/calendar-events/{event.pk}/",
            {"pharmacy": self.b.pk}, format="json",
        )
        self.assertIn(response.status_code, (400, 403, 404), response.data)
        event.refresh_from_db()
        self.assertEqual(event.pharmacy_id, self.a.pk)

    def test_b07_work_note_patch_denies_destination_pharmacy(self):
        note = WorkNote.objects.create(
            pharmacy=self.a, title="Private A work note", date=self.day,
            created_by=self.owner_a,
        )
        response = client_for(self.owner_a).patch(
            f"/api/v1/work-notes/{note.pk}/",
            {"pharmacy": self.b.pk}, format="json",
        )
        self.assertIn(response.status_code, (400, 403, 404), response.data)
        note.refresh_from_db()
        self.assertEqual(note.pharmacy_id, self.a.pk)

    def test_f04_private_staff_member_status_denies_external_shift_viewer(self):
        shift = Shift.objects.create(
            pharmacy=self.b, created_by=self.owner_b,
            role_needed="PHARMACIST", employment_type="LOCUM",
            visibility="PLATFORM", single_user_only=True,
        )
        member, _membership = make_staff_member(self.b, role="PHARMACIST")
        outsider = client_for(self.outsider)
        response = outsider.get(
            f"/api/v1/shifts/{shift.pk}/member_status/?visibility=FULL_PART_TIME"
        )
        self.assertIn(response.status_code, (403, 404), response.data)
        manager_response = client_for(self.owner_b).get(
            f"/api/v1/shifts/{shift.pk}/member_status/?visibility=FULL_PART_TIME"
        )
        self.assertEqual(manager_response.status_code, 200, manager_response.data)

    def invoice_payload(self):
        return {
            "pharmacy": self.b.pk, "external": False, "status": "paid",
            "pharmacy_name_snapshot": self.b.name,
            "invoice_date": self.day.isoformat(),
            "line_items": [{
                "description": "Synthetic one-hour invoice",
                "category_code": "ProfessionalServices", "unit": "Hours",
                "quantity": "1.00", "unit_price": "65.00", "discount": "0",
                "gst_applicable": False, "super_applicable": False,
            }],
        }

    def test_b33_invoice_positive_control(self):
        response = client_for(self.owner_b).post(
            "/api/v1/invoices/", self.invoice_payload(), format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)

    def test_b33_invoice_post_denies_foreign_pharmacy(self):
        client = client_for(self.outsider)
        client.raise_request_exception = False
        response = client.post(
            "/api/v1/invoices/", self.invoice_payload(), format="json",
        )
        self.assertIn(response.status_code, (400, 403, 404), response.data)
        self.assertFalse(
            Invoice.objects.filter(user=self.outsider, pharmacy=self.b).exists()
        )

    def roster_payload(self):
        return {
            "pharmacy": self.b.pk, "role_needed": "PHARMACIST",
            "employment_type": "LOCUM", "visibility": "LOCUM_CASUAL",
            "rate_type": "FLEXIBLE", "description": "PR200 roster",
            "slots": [{
                "date": self.day.isoformat(), "start_time": "09:00",
                "end_time": "17:00", "rate": "70.00",
            }],
        }

    def test_b36_roster_positive_control(self):
        response = client_for(self.owner_b).post(
            "/api/v1/roster-shifts/", self.roster_payload(), format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)

    def test_b36_roster_post_denies_unmanaged_pharmacy(self):
        client = client_for(self.outsider)
        client.raise_request_exception = False
        response = client.post(
            "/api/v1/roster-shifts/", self.roster_payload(), format="json",
        )
        self.assertIn(response.status_code, (403, 404), response.data)
        self.assertFalse(
            Shift.objects.filter(pharmacy=self.b, created_by=self.outsider).exists()
        )

    def test_f04_shift_patch_denies_cross_tenant_and_paid_override(self):
        shift = Shift.objects.create(
            pharmacy=self.a, created_by=self.owner_a,
            role_needed="PHARMACIST", employment_type="LOCUM",
            visibility="LOCUM_CASUAL", payment_status="PENDING",
        )
        client = client_for(self.owner_a)
        client.raise_request_exception = False
        response = client.patch(
            f"/api/v1/shifts/{shift.pk}/",
            {"pharmacy": self.b.pk, "payment_status": "PAID"}, format="json",
        )
        self.assertIn(response.status_code, (400, 403, 404), response.data)
        shift.refresh_from_db()
        self.assertEqual(shift.pharmacy_id, self.a.pk)
        self.assertEqual(shift.payment_status, "PENDING")

    def test_b06_organization_feed_does_not_expose_sibling_notes(self):
        org = Organization.objects.create(
            name="PR200 Group", slug="pr200-group-for-isolation",
        )
        for pharmacy in (self.a, self.b):
            pharmacy.organization = org
            pharmacy.save(update_fields=["organization"])
        staff, _membership = make_staff_member(self.a)
        WorkNote.objects.create(
            pharmacy=self.b, date=self.day, title="Private sibling note",
            body="Synthetic private note", is_general=True,
            created_by=self.owner_b,
        )
        response = client_for(staff).get(
            f"/api/v1/calendar-feed/?organization_id={org.pk}"
            f"&date_from={self.day.isoformat()}&date_to={self.day.isoformat()}"
        )
        self.assertEqual(response.status_code, 200, response.data)
        titles = [row.get("title") for row in response.data["work_notes"]]
        self.assertNotIn("Private sibling note", titles)


class StripeObject(dict):
    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError as exc:
            raise AttributeError(key) from exc


@override_settings(STRIPE_WEBHOOK_SECRET="whsec-pr200-test")
class StripePaymentIsolationContracts(TestCase):
    def test_b15_cancellation_webhook_never_finalizes_worker_offer(self):
        owner, pharmacy = make_owner_with_pharmacy("PR200 Penalty")
        shift = Shift.objects.create(
            pharmacy=pharmacy, created_by=owner,
            role_needed="PHARMACIST", employment_type="LOCUM",
            payment_status="PENDING",
        )
        event = StripeObject(
            id="evt_pr200_cancellation", type="checkout.session.completed",
            data=StripeObject(object=StripeObject(
                mode="payment", payment_status="paid", amount_total=1200,
                payment_intent="pi_pr200_cancel",
                metadata={
                    "shift_id": str(shift.pk), "type": "cancellation",
                    "owner_user_id": str(owner.pk), "actor_user_id": str(owner.pk),
                },
            )),
        )
        with (
            patch("billing.views.stripe.Webhook.construct_event", return_value=event),
            patch("billing.views._finalize_pending_offers_for_shift", return_value=(0, [])) as finalize,
            patch("shifts.emails.send_shift_payment_finalized_notifications"),
        ):
            response = client_for().post(
                reverse("api_v1:billing:stripe_webhook"),
                data=b"{}", content_type="application/json",
            )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            ShiftPayment.objects.filter(shift=shift, payment_type="cancellation").count(), 1
        )
        finalize.assert_not_called()
        shift.refresh_from_db()
        self.assertEqual(shift.payment_status, "PENDING")


@override_settings(ETHICAL_ACCESS_APPLICATIONS_ENABLED=True)
class EthicalApprovalContracts(TestCase):
    def test_f10_approval_valid_post_returns_201(self):
        from client_profile.models import OwnerOnboarding, Pharmacy
        from ethical_marketplace.models import EthicalPharmacyApproval
        from marketplace.models import IdentityVerification, MarketplaceTermsAcceptance
        from users.models import User

        user = User.objects.create_user(
            email="pr200-ethical@example.test", password="test-only",
            role="OWNER", is_active=True, is_otp_verified=True,
            mobile_number="0400000000", is_mobile_verified=True,
        )
        owner = OwnerOnboarding.objects.create(
            user=user, phone_number="0400000000",
            role="PHARMACIST", verified=True, ahpra_verified=True,
        )
        IdentityVerification.objects.create(
            user=user, status="VERIFIED", assurance_method="MANUAL",
        )
        MarketplaceTermsAcceptance.objects.create(user=user, version="2026-09")
        pharmacy = Pharmacy.objects.create(
            name="PR200 Ethical Premises", owner=owner,
            verified=True, state="QLD",
        )
        client = APIClient()
        client.force_authenticate(user)
        client.raise_request_exception = False
        response = client.post(
            f"/api/v1/ethical/pharmacies/{pharmacy.pk}/approval/",
            {"business_phone": "0700000000",
             "business_email": "pr200-ethical@example.test"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(
            EthicalPharmacyApproval.objects.filter(pharmacy=pharmacy).count(), 1
        )
