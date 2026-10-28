"""Audit-only PR200 B01 billing, B35 roster and B25 marketplace.
Intentional RED negative assertions; fixture errors are NOT findings.
"""
from datetime import timedelta, time
from types import SimpleNamespace
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from billing.models import OwnerSubscription
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_staff_member, make_user
from marketplace.models import IdentityVerification, ListingAudiencePolicy, ListingEscalationStep, MarketplaceCategory, MarketplaceListing, MarketplaceTermsAcceptance
from shifts.models import Shift, ShiftOffer, ShiftSlot, ShiftSlotAssignment


class B01SubscriberFulfillmentPrice(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("P5 B01 Checkout")
        worker = make_user("PHARMACIST")
        self.shift = Shift.objects.create(pharmacy=self.pharmacy, created_by=self.owner,
            role_needed="PHARMACIST", employment_type="LOCUM", payment_status="PENDING")
        self.offer = ShiftOffer.objects.create(shift=self.shift, user=worker,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)

    def checkout_price(self):
        with (
            patch("billing.views.get_billing_state_for_account", return_value="PAYMENT_REQUIRED"),
            patch("billing.views.stripe.checkout.Session.create",
                return_value=SimpleNamespace(url="https://checkout.example.test/b01")) as create,
        ):
            resp = client_for(self.owner).post(
                f"/api/v1/billing/charge-fulfillment/{self.shift.pk}/",
                {"offer_ids": [self.offer.pk]}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        create.assert_called_once()
        self.assertEqual(create.call_args.kwargs["line_items"][0]["quantity"], 1)
        return create.call_args.kwargs["line_items"][0]["price"]

    def test_b01_non_subscriber_standard_price_positive(self):
        self.assertEqual(self.checkout_price(), "price_1T52jFBQXaySV5ukezd5JmzS")

    def test_b01_active_subscriber_must_get_discount(self):
        OwnerSubscription.objects.create(
            owner=self.owner, status="active", stripe_customer_id="cus_pr200_b01")
        self.assertEqual(self.checkout_price(), "price_1T52jFBQXaySV5ukkXOKPHSV")


class B35RosterOwnerCreateTenantBoundary(TestCase):
    def setUp(self):
        self.owner_a, self.pharmacy_a = make_owner_with_pharmacy("P5 B35 Owner A")
        self.owner_b, self.pharmacy_b = make_owner_with_pharmacy("P5 B35 Owner B")
        self.worker_b, _ = make_staff_member(self.pharmacy_b, role="ASSISTANT")
        self.day = timezone.localdate() + timedelta(days=21)
        self.shift_b = Shift.objects.create(
            pharmacy=self.pharmacy_b, created_by=self.owner_b,
            role_needed="ASSISTANT", employment_type="FULL_TIME",
            min_hourly_rate=45, max_hourly_rate=60,
            visibility="FULL_PART_TIME")

    def payload(self):
        slot = ShiftSlot.objects.create(
            shift=self.shift_b, date=self.day,
            start_time=time(9, 0), end_time=time(17, 0))
        return slot, {
            "shift": self.shift_b.pk, "slot": slot.pk,
            "slot_date": self.day.isoformat(), "user": self.worker_b.pk,
            "is_rostered": True,
        }

    def test_b35_valid_owner_creates_own_roster_assignment(self):
        slot, data = self.payload()
        resp = client_for(self.owner_b).post("/api/v1/roster-owner/", data, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertTrue(ShiftSlotAssignment.objects.filter(slot=slot, user=self.worker_b).exists())

    def test_b35_foreign_owner_cannot_create_roster_assignment(self):
        slot, data = self.payload()
        self.assertEqual(client_for(self.owner_a).get(
            f"/api/v1/roster-owner/?pharmacy={self.pharmacy_b.pk}").status_code, 200)
        resp = client_for(self.owner_a).post("/api/v1/roster-owner/", data, format="json")
        self.assertIn(resp.status_code, (400, 403, 404), resp.data)
        self.assertFalse(ShiftSlotAssignment.objects.filter(slot=slot, user=self.worker_b).exists())


class B25MarketplaceAudienceAtomicity(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("P5 B25 Pharmacy")
        self.owner.is_otp_verified = True
        self.owner.is_mobile_verified = True
        self.owner.mobile_number = "0499000250"
        self.owner.save(update_fields=["is_otp_verified", "is_mobile_verified", "mobile_number"])
        profile = self.owner.owneronboarding
        profile.verified = True
        profile.save(update_fields=["verified"])
        self.pharmacy.verified = True
        self.pharmacy.save(update_fields=["verified"])
        IdentityVerification.objects.create(
            user=self.owner, status="VERIFIED", assurance_method="MANUAL",
            verified_at=timezone.now())
        MarketplaceTermsAcceptance.objects.create(user=self.owner, version="2026-09")
        category = MarketplaceCategory.objects.create(
            slug="pr200-b25", name="P5 B25 Fixture", context="PHARMACY",
            permitted_modes=["SELL"], maximum_buyer_roles=["OWNER"])
        self.listing = MarketplaceListing.objects.create(
            creator=self.owner, seller_context="PHARMACY", pharmacy=self.pharmacy,
            category=category, mode="SELL", title="B25 Fixtures",
            slug="b25-fixtures", description="Synthetic ordinary shelving",
            condition="Used", amount="200.00", suburb="Brisbane",
            state="QLD", publication_status="PUBLISHED")
        self.audience, _ = ListingAudiencePolicy.objects.get_or_create(
            listing=self.listing,
            defaults={"allowed_buyer_roles": ["OWNER"], "current_circle": "OWNED_CHAIN",
                      "maximum_circle": "PLATFORM"})
        self.url = f"/api/v1/marketplace/listings/{self.listing.pk}/audience/"

    def payload(self, invalid=False):
        when = (timezone.now() + timedelta(days=2)).isoformat()
        steps = [{"target_circle": "ORGANISATION", "due_at": when}]
        if invalid:
            steps.append({"target_circle": "INVALID", "due_at": when})
        return {"expected_version": self.listing.version, "current_circle": "PLATFORM",
                "maximum_circle": "PLATFORM", "schedule": steps}

    def test_b25_valid_schedule_positive(self):
        version = self.listing.version
        resp = client_for(self.owner).post(self.url, self.payload(), format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.listing.refresh_from_db()
        self.audience.refresh_from_db()
        self.assertEqual(self.listing.version, version + 1)
        self.assertEqual(self.audience.current_circle, "PLATFORM")
        self.assertEqual(ListingEscalationStep.objects.filter(listing=self.listing).count(), 1)

    def test_b25_invalid_second_step_rolls_back_everything(self):
        version = self.listing.version
        circle = self.audience.current_circle
        resp = client_for(self.owner).post(self.url, self.payload(invalid=True), format="json")
        self.assertEqual(resp.status_code, 400, resp.data)
        self.listing.refresh_from_db()
        self.audience.refresh_from_db()
        actual = (
            self.listing.version,
            self.audience.current_circle,
            ListingEscalationStep.objects.filter(listing=self.listing).count(),
        )
        self.assertEqual(actual, (version, circle, 0),
                         "Invalid schedule must leave no persisted audience/version/steps.")
