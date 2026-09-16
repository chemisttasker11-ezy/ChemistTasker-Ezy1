from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from client_profile.models import Organization, OwnerOnboarding, Pharmacy
from marketplace.models import IdentityVerification, MarketplaceTermsAcceptance
from users.models import User
from .models import EthicalJurisdictionPolicy, EthicalListing, EthicalPharmacyApproval, EthicalProduct, EthicalProfessionalAccess
from .policy import listing_visible_to


class EthicalMarketplaceTests(TestCase):
    def owner_user(self, email):
        user = User.objects.create_user(email=email, password="secret", role="OWNER", is_active=True, is_otp_verified=True, mobile_number="0400000000", is_mobile_verified=True)
        owner = OwnerOnboarding.objects.create(user=user, phone_number="0400000000", role="PHARMACIST", verified=True, ahpra_verified=True)
        IdentityVerification.objects.create(user=user, status="VERIFIED", assurance_method="MANUAL")
        MarketplaceTermsAcceptance.objects.create(user=user, version="2026-09")
        return user, owner

    def test_missing_pan_does_not_hide_application_status(self):
        user, owner = self.owner_user("apply@example.test")
        pharmacy = Pharmacy.objects.create(name="Applicant premises", owner=owner, verified=True, state="QLD")
        client = APIClient(); client.force_authenticate(user)
        response = client.get(f"/api/ethical/pharmacies/{pharmacy.id}/approval/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "NOT_SUBMITTED")
        self.assertEqual(response["Cache-Control"], "private, no-store")

    @override_settings(ETHICAL_PRIVATE_READ_ENABLED=True)
    def test_unapproved_owner_cannot_read_catalogue(self):
        user, owner = self.owner_user("blocked@example.test")
        pharmacy = Pharmacy.objects.create(name="Blocked premises", owner=owner, verified=True, state="QLD")
        client = APIClient(); client.force_authenticate(user)
        response = client.get(f"/api/ethical/catalogue/?pharmacy={pharmacy.id}")
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("product", str(response.data).lower())

    def test_s8_never_visible_outside_source_organisation(self):
        source_user, source_owner = self.owner_user("source@example.test")
        inside_user, inside_owner = self.owner_user("inside@example.test")
        outside_user, outside_owner = self.owner_user("outside@example.test")
        org = Organization.objects.create(name="One Organisation", slug="one-org")
        source = Pharmacy.objects.create(name="Source", owner=source_owner, organization=org, verified=True, state="QLD")
        inside = Pharmacy.objects.create(name="Inside", owner=inside_owner, organization=org, verified=True, state="QLD")
        outside = Pharmacy.objects.create(name="Outside", owner=outside_owner, verified=True, state="QLD")
        product = EthicalProduct.objects.create(name="Controlled synthetic test product", strength="1", form="pack", pack_size="1", schedule="S8", classification_provenance="test", status="APPROVED")
        for user, pharmacy in ((inside_user, inside), (outside_user, outside)):
            EthicalPharmacyApproval.objects.create(pharmacy=pharmacy, applicant=user, accountable_owner=user, business_phone="0700000000", business_email=user.email, status="VERIFIED")
            EthicalProfessionalAccess.objects.create(user=user, status="VERIFIED", professional_basis="Synthetic approved test", schedules=["S8"], activities=["VIEW_CHAIN_ETHICAL"], jurisdictions=["QLD"])
        EthicalJurisdictionPolicy.objects.create(jurisdiction="QLD", activity="VIEW_CHAIN_ETHICAL", schedule="S8", mode="TRANSFER", allowed=True, effective_from=timezone.now(), policy_version="test", reviewed_by=source_user)
        listing = EthicalListing.objects.create(pharmacy=source, accountable_owner=source_user, prepared_by=source_user, product=product, mode="TRANSFER", current_circle="ORGANISATION_OWNERS", maximum_circle="ORGANISATION_OWNERS", scope_owner_id=source_owner.id, scope_organization_id=org.id, status="PUBLISHED")
        self.assertTrue(listing_visible_to(inside_user, listing))
        self.assertFalse(listing_visible_to(outside_user, listing))

    def test_public_marketplace_models_do_not_reference_ethical_products(self):
        from marketplace.models import MarketplaceListing
        field_targets = {getattr(field.remote_field, "model", None) for field in MarketplaceListing._meta.fields if field.is_relation}
        self.assertNotIn(EthicalProduct, field_targets)
