from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from client_profile.models import OtherStaffOnboarding, OwnerOnboarding, Pharmacy
from users.models import User

from .models import IdentityVerification, ListingAudiencePolicy, MarketplaceCategory, MarketplaceListing, MarketplaceTermsAcceptance
from .listing_policy import listing_options_for


class ListingSellerPolicyTests(TestCase):
    def make_verified_user(self, email, role, staff_role=None):
        user = User.objects.create_user(email=email,password="secret",role=role,is_active=True,is_otp_verified=True,mobile_number="0400000000",is_mobile_verified=True)
        if role == "OWNER":
            profile = OwnerOnboarding.objects.create(user=user, phone_number="0400000000", role="PHARMACIST", verified=True)
        elif role == "OTHER_STAFF":
            profile = OtherStaffOnboarding.objects.create(user=user, role_type=staff_role, verified=True, gov_id_verified=True)
        else:
            from client_profile.models import PharmacistOnboarding
            profile = PharmacistOnboarding.objects.create(user=user, verified=True, gov_id_verified=True)
        IdentityVerification.objects.create(user=user, status="VERIFIED", assurance_method="MANUAL", verified_at=timezone.now())
        MarketplaceTermsAcceptance.objects.create(user=user, version="2026-09")
        return user, profile

    def setUp(self):
        self.owner_user, self.owner_profile = self.make_verified_user("owner-policy@example.test", "OWNER")
        self.pharmacy = Pharmacy.objects.create(name="Owner pharmacy", owner=self.owner_profile, verified=True, state="QLD")
        self.books = MarketplaceCategory.objects.create(slug="books-policy",name="Books",context="PERSONAL",permitted_modes=["SELL","FREE","SWAP"],maximum_buyer_roles=["PHARMACIST","INTERN","STUDENT"],field_schema={"allowed_seller_roles":["PHARMACIST","INTERN","STUDENT"]})
        self.fixtures = MarketplaceCategory.objects.create(slug="fixtures-policy",name="Fixtures",context="PHARMACY",permitted_modes=["SELL"],maximum_buyer_roles=["OWNER"],field_schema={"allowed_seller_roles":["OWNER"]})

    def test_role_specific_personal_category_is_enforced_server_side(self):
        assistant, _ = self.make_verified_user("assistant-policy@example.test", "OTHER_STAFF", "ASSISTANT")
        with self.assertRaises(ValidationError):
            MarketplaceListing.objects.create(creator=assistant,seller_context="PERSONAL",category=self.books,mode="SELL",title="Not permitted",slug="not-permitted",description="Book",condition="Used",amount="10.00",suburb="Brisbane",state="QLD")

    def test_pharmacy_asset_requires_actual_owner_not_staff_role(self):
        pharmacist = User.objects.create_user(email="pharmacist-policy@example.test", password="secret", role="PHARMACIST", is_active=True)
        with self.assertRaises(ValidationError):
            MarketplaceListing.objects.create(creator=pharmacist,seller_context="PHARMACY",pharmacy=self.pharmacy,category=self.fixtures,mode="SELL",title="Forged fixture",slug="forged-fixture",description="No authority",condition="Used",amount="100.00",suburb="Brisbane",state="QLD")

    def test_pharmacy_audience_defaults_to_chain_not_platform(self):
        listing = MarketplaceListing.objects.create(creator=self.owner_user,seller_context="PHARMACY",pharmacy=self.pharmacy,category=self.fixtures,mode="SELL",title="Owner fixture",slug="owner-fixture",description="Legitimate owner asset",condition="Used",amount="100.00",suburb="Brisbane",state="QLD")
        audience = ListingAudiencePolicy.objects.create(listing=listing, allowed_buyer_roles=["OWNER"])
        audience.refresh_from_db()
        self.assertEqual(audience.current_circle, "OWNED_CHAIN")
        self.assertEqual(audience.maximum_circle, "PLATFORM")
        self.assertEqual(audience.source_owner_id, self.pharmacy.owner_id)

    def test_listing_options_only_offer_permitted_categories(self):
        student, _ = self.make_verified_user("student-policy@example.test", "OTHER_STAFF", "STUDENT")
        payload = listing_options_for(student)
        self.assertIn(self.books.id, {row["id"] for row in payload["personal_categories"]})
        self.assertEqual(payload["pharmacy_categories"], [])
