"""PR201 Phase 6 B24/B25 regression controls; the audience tests also run on Postgres in CI (row lock + outer join)."""
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from client_profile.characterization_support import (
    client_for, make_owner_with_pharmacy, make_user,
)
from marketplace.models import (
    IdentityVerification, ListingAudiencePolicy, ListingEscalationStep,
    MarketplaceCategory, MarketplaceListing, MarketplaceExchange,
    MarketplaceTermsAcceptance,
)


class ExchangeCompletionIntegrity(TestCase):
    def make_exchange(self, state):
        seller = make_user("OWNER", is_otp_verified=True, is_mobile_verified=True,
                           mobile_number="0499000191")
        buyer = make_user("OWNER")
        category = MarketplaceCategory.objects.create(
            slug="p6-b24-category", name="Phase 6 test category",
            context="BOTH", permitted_modes=["SELL"], maximum_buyer_roles=["OWNER"],
        )
        with patch("marketplace.signals.can_list_category",
                   return_value=SimpleNamespace(allowed=True)):
            listing = MarketplaceListing.objects.create(
                creator=seller, seller_context="PERSONAL", category=category,
                mode="SELL", title="Phase6 fixture", slug="p6-fixture",
                description="Synthetic fixture", condition="Used",
                amount="250.00", suburb="Brisbane", state="QLD",
                publication_status="PUBLISHED",
            )
        exchange = MarketplaceExchange.objects.create(
            listing=listing, buyer=buyer, state=state,
        )
        return seller, buyer, listing, exchange

    def test_unaccepted_enquiry_cannot_complete(self):
        seller, buyer, listing, exchange = self.make_exchange("ENQUIRY")
        url = f"/api/v1/marketplace/exchanges/{exchange.pk}/confirm-completion/"
        for actor in (buyer, seller):
            response = client_for(actor).post(
                url, {"expected_version": exchange.version}, format="json")
            self.assertEqual(response.status_code, 409, response.data)
        exchange.refresh_from_db()
        self.assertEqual(exchange.state, "ENQUIRY")
        self.assertEqual(exchange.version, 1)
        self.assertFalse(exchange.seller_confirmed or exchange.buyer_confirmed)

    def test_proposed_terms_cannot_complete(self):
        seller, buyer, listing, exchange = self.make_exchange("TERMS_PROPOSED")
        response = client_for(buyer).post(
            f"/api/v1/marketplace/exchanges/{exchange.pk}/confirm-completion/",
            {"expected_version": exchange.version}, format="json")
        self.assertEqual(response.status_code, 409, response.data)
        exchange.refresh_from_db()
        self.assertEqual(exchange.state, "TERMS_PROPOSED")
        self.assertFalse(exchange.buyer_confirmed)

    def test_accepted_exchange_completes_for_both_parties(self):
        seller, buyer, listing, exchange = self.make_exchange("ACCEPTED")
        url = f"/api/v1/marketplace/exchanges/{exchange.pk}/confirm-completion/"
        first = client_for(buyer).post(
            url, {"expected_version": exchange.version}, format="json")
        self.assertEqual(first.status_code, 200, first.data)
        exchange.refresh_from_db()
        with patch("marketplace.signals.can_list_category",
                   return_value=SimpleNamespace(allowed=True)):
            second = client_for(seller).post(
                url, {"expected_version": exchange.version}, format="json")
        self.assertEqual(second.status_code, 200, second.data)
        exchange.refresh_from_db()
        listing.refresh_from_db()
        self.assertEqual(exchange.state, "COMPLETED")
        self.assertEqual(listing.availability_status, "COMPLETED")


class ListingAudienceAtomicity(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Phase6 B25")
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
            slug="p6-b25", name="Phase 6 B25", context="PHARMACY",
            permitted_modes=["SELL"], maximum_buyer_roles=["OWNER"])
        self.listing = MarketplaceListing.objects.create(
            creator=self.owner, seller_context="PHARMACY", pharmacy=self.pharmacy,
            category=category, mode="SELL", title="Phase6 B25 shelves",
            slug="p6-b25-shelves", description="Synthetic shelves",
            condition="Used", amount="200.00", suburb="Brisbane",
            state="QLD", publication_status="PUBLISHED",
        )
        self.audience, _ = ListingAudiencePolicy.objects.get_or_create(
            listing=self.listing, defaults={
                "allowed_buyer_roles": ["OWNER"],
                "current_circle": "OWNED_CHAIN", "maximum_circle": "PLATFORM",
            })
        self.url = f"/api/v1/marketplace/listings/{self.listing.pk}/audience/"

    def payload(self, invalid=False):
        due = (timezone.now() + timedelta(days=2)).isoformat()
        schedule = [{"target_circle": "ORGANISATION", "due_at": due}]
        if invalid:
            schedule.append({"target_circle": "INVALID", "due_at": due})
        return {
            "expected_version": self.listing.version,
            "current_circle": "PLATFORM", "maximum_circle": "PLATFORM",
            "schedule": schedule,
        }

    def test_valid_schedule_persists(self):
        response = client_for(self.owner).post(
            self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.listing.refresh_from_db()
        self.audience.refresh_from_db()
        self.assertEqual(self.listing.version, 2)
        self.assertEqual(self.audience.current_circle, "PLATFORM")
        self.assertEqual(ListingEscalationStep.objects.filter(listing=self.listing).count(), 1)

    def test_invalid_schedule_rolls_back_all_writes(self):
        version = self.listing.version
        circle = self.audience.current_circle
        response = client_for(self.owner).post(
            self.url, self.payload(invalid=True), format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.listing.refresh_from_db()
        self.audience.refresh_from_db()
        self.assertEqual(self.listing.version, version)
        self.assertEqual(self.audience.current_circle, circle)
        self.assertEqual(ListingEscalationStep.objects.filter(listing=self.listing).count(), 0)
