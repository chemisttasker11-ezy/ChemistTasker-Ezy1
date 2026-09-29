from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
import uuid
from unittest.mock import patch

from client_profile.models import OwnerOnboarding, Pharmacy
from users.models import User
from .models import (IdentityVerification, ListingAudiencePolicy, ListingDeliveryTerms,
                     MarketplaceCategory, MarketplaceListing, MarketplaceTermsAcceptance)
from .policy import evaluate_marketplace_access
from .serializers import PublicListingSerializer


class MarketplaceTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="owner@example.test", password="secret", role="OWNER", is_active=True, is_otp_verified=True, mobile_number="0400000000", is_mobile_verified=True)
        self.owner = OwnerOnboarding.objects.create(user=self.user, phone_number="0400000000", role="PHARMACIST", verified=True, ahpra_verified=True)
        self.pharmacy = Pharmacy.objects.create(name="Private Pharmacy Name", owner=self.owner, verified=True, suburb="Brisbane", state="QLD")
        IdentityVerification.objects.create(user=self.user, status="VERIFIED", assurance_method="MANUAL", verified_at=timezone.now())
        MarketplaceTermsAcceptance.objects.create(user=self.user, version="2026-09")
        self.category = MarketplaceCategory.objects.create(slug="fixtures", name="Fixtures", context="PHARMACY", permitted_modes=["SELL", "FREE", "SWAP"], maximum_buyer_roles=["OWNER"])

    def listing(self):
        listing = MarketplaceListing.objects.create(creator=self.user, seller_context="PHARMACY", pharmacy=self.pharmacy, category=self.category, mode="SELL", title="Shelving bundle", slug="shelving-bundle", description="Modular shelving in good condition.", condition="Used", amount="250.00", suburb="Brisbane", state="QLD", postcode="4000", private_pickup_details="Exact private address", publication_status="PUBLISHED", published_at=timezone.now())
        ListingAudiencePolicy.objects.create(listing=listing, allowed_buyer_roles=["OWNER"], current_circle="PLATFORM")
        ListingDeliveryTerms.objects.create(listing=listing, method="POSTAGE", postage_payer="BUYER", postage_organiser="SELLER", quote_required=True)
        return listing

    def test_verified_owner_has_personal_and_owned_pharmacy_access(self):
        decision = evaluate_marketplace_access(self.user)
        self.assertTrue(decision.can_trade_personally)
        self.assertTrue(decision.can_trade_for_pharmacy)
        self.assertEqual(decision.eligible_pharmacies[0]["id"], self.pharmacy.id)

    def test_missing_marketplace_terms_is_a_safe_blocker(self):
        MarketplaceTermsAcceptance.objects.all().delete()
        decision = evaluate_marketplace_access(self.user)
        self.assertFalse(decision.can_trade_personally)
        self.assertIn("MARKETPLACE_TERMS_REQUIRED", {row["code"] for row in decision.blockers})

    def test_terms_acceptance_requires_authentication_explicit_consent_and_current_version(self):
        path = "/api/marketplace/me/terms/"
        MarketplaceTermsAcceptance.objects.filter(user=self.user).delete()
        self.assertEqual(APIClient().post(path, {"accepted": True, "version": "2026-09"}, format="json").status_code, 401)
        client = APIClient(); client.force_authenticate(self.user)
        self.assertFalse(client.get(path).data["accepted"])
        self.assertEqual(client.post(path, {"version": "2026-09"}, format="json").status_code, 400)
        self.assertEqual(client.post(path, {"accepted": True, "version": "old"}, format="json").status_code, 400)
        self.assertEqual(MarketplaceTermsAcceptance.objects.filter(user=self.user).count(), 0)
        self.assertEqual(client.post(path, {"accepted": True, "version": "2026-09"}, format="json").status_code, 201)
        self.assertEqual(client.post(path, {"accepted": True, "version": "2026-09"}, format="json").status_code, 200)
        self.assertEqual(MarketplaceTermsAcceptance.objects.filter(user=self.user).count(), 1)
        self.assertTrue(client.get(path).data["accepted"])
        self.assertNotIn("MARKETPLACE_TERMS_REQUIRED", {row["code"] for row in evaluate_marketplace_access(self.user).blockers})

    def test_accepting_terms_does_not_bypass_identity_verification(self):
        MarketplaceTermsAcceptance.objects.filter(user=self.user).delete()
        IdentityVerification.objects.filter(user=self.user).delete()
        client = APIClient(); client.force_authenticate(self.user)
        response = client.post("/api/marketplace/me/terms/", {"accepted": True, "version": "2026-09"}, format="json")
        self.assertEqual(response.status_code, 201)
        blockers = {row["code"] for row in client.get("/api/marketplace/me/access/").data["blockers"]}
        self.assertIn("IDENTITY_UNVERIFIED", blockers)
        self.assertNotIn("MARKETPLACE_TERMS_REQUIRED", blockers)

    def test_owner_identity_is_a_marketplace_gate_not_general_profile_approval(self):
        IdentityVerification.objects.filter(user=self.user).delete()
        self.assertTrue(self.owner.verified)
        self.assertIn("IDENTITY_UNVERIFIED", {row["code"] for row in evaluate_marketplace_access(self.user).blockers})
        self.owner.gov_id_verified = True
        self.owner.save(update_fields=["gov_id_verified"])
        self.assertTrue(evaluate_marketplace_access(self.user).can_trade_personally)
        self.owner.gov_id_verified = False
        self.owner.save(update_fields=["gov_id_verified"])
        self.assertTrue(self.owner.verified)
        self.assertFalse(evaluate_marketplace_access(self.user).can_trade_personally)

    def test_owner_identity_submission_preserves_dashboard_profile_approval(self):
        self.owner.government_id = "users/test/gov_ids/example.pdf"
        self.owner.save(update_fields=["government_id"])
        client = APIClient(); client.force_authenticate(self.user)
        with patch("client_profile.serializers.async_task") as queue_task:
            response = client.patch(
                "/api/client-profile/owner/onboarding/me/",
                {"tab": "identity", "government_id_type": "AUS_PASSPORT", "identity_meta": {"expiry": "2030-01-01"}, "submitted_for_verification": True},
                format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.verified)
        self.assertFalse(self.owner.gov_id_verified)
        queue_task.assert_called_once()
        self.assertEqual(queue_task.call_args.args[1], "owneronboarding")

    def test_public_projection_never_contains_identity_or_pharmacy_name(self):
        payload = PublicListingSerializer(self.listing()).data
        rendered = str(payload)
        self.assertNotIn(self.user.email, rendered)
        self.assertNotIn(self.pharmacy.name, rendered)
        self.assertNotIn("Exact private address", rendered)
        self.assertNotIn("pharmacy", payload)
        self.assertEqual(payload["seller_role_label"], "Pharmacy owner")

    @override_settings(MARKETPLACE_READ_ENABLED=True)
    def test_public_list_api_is_anonymous_and_safe(self):
        self.listing()
        response = APIClient().get("/api/marketplace/listings/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        rendered = str(response.data)
        self.assertNotIn(self.user.email, rendered)
        self.assertNotIn(self.pharmacy.name, rendered)

    @override_settings(MARKETPLACE_READ_ENABLED=True, FRONTEND_BASE_URL="https://example.test")
    def test_sitemap_contains_public_goods_but_no_ethical_inventory_route(self):
        listing = self.listing()
        response = APIClient().get("/api/public-hub/sitemap/")
        self.assertEqual(response.status_code, 200)
        urls = {row["loc"] for row in response.data}
        self.assertIn(f"https://example.test/marketplace/items/{listing.id}/{listing.slug}", urls)
        self.assertNotIn("https://example.test/marketplace/ethical", urls)

    @override_settings(MARKETPLACE_NEW_LISTINGS_ENABLED=True, MARKETPLACE_ALL_WRITES_ENABLED=True)
    def test_forged_pharmacy_context_is_denied(self):
        stranger = User.objects.create_user(email="other@example.test", password="secret", role="OWNER", is_active=True, is_otp_verified=True, mobile_number="0411111111", is_mobile_verified=True)
        profile = OwnerOnboarding.objects.create(user=stranger, phone_number="0411111111", role="PHARMACIST", verified=True)
        IdentityVerification.objects.create(user=stranger, status="VERIFIED", assurance_method="MANUAL")
        MarketplaceTermsAcceptance.objects.create(user=stranger, version="2026-09")
        client = APIClient(); client.force_authenticate(stranger)
        response = client.post("/api/marketplace/listings/", {"seller_context":"PHARMACY","pharmacy":self.pharmacy.id,"category":self.category.id,"mode":"FREE","title":"Forged","description":"No","condition":"Used","quantity":1,"unit":"bundle","amount":"0","desired_swap":"","suburb":"Brisbane","state":"QLD","postcode":"4000","allowed_buyer_roles":["OWNER"],"delivery":{"method":"PICKUP"}}, format="json")
        self.assertEqual(response.status_code, 403)

    @override_settings(MARKETPLACE_NEW_LISTINGS_ENABLED=True, MARKETPLACE_ALL_WRITES_ENABLED=True)
    def test_listing_create_replays_same_request_without_duplicate(self):
        client = APIClient(); client.force_authenticate(self.user)
        request_id = str(uuid.uuid4())
        payload = {
            "client_request_id": request_id,
            "seller_context": "PHARMACY",
            "pharmacy": self.pharmacy.id,
            "category": self.category.id,
            "mode": "FREE",
            "title": "Idempotent fixture",
            "description": "Created once even when the response is retried.",
            "condition": "Good",
            "quantity": 1,
            "unit": "item",
            "amount": "0",
            "desired_swap": "",
            "suburb": "Brisbane",
            "state": "QLD",
            "postcode": "4000",
            "allowed_buyer_roles": ["OWNER"],
            "delivery": {"method": "PICKUP"},
        }
        first = client.post("/api/marketplace/listings/", payload, format="json")
        replay = client.post("/api/marketplace/listings/", payload, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(first.data["id"], replay.data["id"])
        self.assertEqual(MarketplaceListing.objects.filter(title="Idempotent fixture").count(), 1)

    @override_settings(MARKETPLACE_NEW_LISTINGS_ENABLED=True, MARKETPLACE_ALL_WRITES_ENABLED=True)
    def test_listing_create_rejects_request_id_reuse_with_changed_payload(self):
        client = APIClient(); client.force_authenticate(self.user)
        request_id = str(uuid.uuid4())
        payload = {
            "client_request_id": request_id,
            "seller_context": "PHARMACY",
            "pharmacy": self.pharmacy.id,
            "category": self.category.id,
            "mode": "FREE",
            "title": "Original fixture",
            "description": "Original payload.",
            "condition": "Good",
            "quantity": 1,
            "unit": "item",
            "amount": "0",
            "desired_swap": "",
            "suburb": "Brisbane",
            "state": "QLD",
            "postcode": "4000",
            "allowed_buyer_roles": ["OWNER"],
            "delivery": {"method": "PICKUP"},
        }
        self.assertEqual(client.post("/api/marketplace/listings/", payload, format="json").status_code, 201)
        payload["title"] = "Changed fixture"
        response = client.post("/api/marketplace/listings/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(MarketplaceListing.objects.filter(creator=self.user).count(), 1)
