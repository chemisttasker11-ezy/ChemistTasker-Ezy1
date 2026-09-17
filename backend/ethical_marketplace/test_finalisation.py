from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from client_profile.models import Chain, Organization, OwnerOnboarding, Pharmacy
from marketplace.models import IdentityVerification, MarketplaceTermsAcceptance
from users.models import User
from .models import EthicalJurisdictionPolicy, EthicalListing, EthicalPharmacyApproval, EthicalProduct, EthicalProfessionalAccess
from .policy import listing_visible_to


class EthicalFinalisationTests(TestCase):
    def make_owner(self, email):
        user = User.objects.create_user(email=email,password="secret",role="OWNER",is_active=True,is_otp_verified=True,mobile_number="0400000000",is_mobile_verified=True)
        owner = OwnerOnboarding.objects.create(user=user, phone_number="0400000000", role="PHARMACIST", verified=True, ahpra_verified=True)
        IdentityVerification.objects.create(user=user, status="VERIFIED", assurance_method="MANUAL", verified_at=timezone.now())
        MarketplaceTermsAcceptance.objects.create(user=user, version="2026-09")
        return user, owner

    def approve(self, user, pharmacy, product):
        EthicalPharmacyApproval.objects.get_or_create(pharmacy=pharmacy, defaults={"applicant": user, "accountable_owner": user, "business_phone": "0700000000", "business_email": user.email, "pbs_approval_number": "PAN-TEST", "status": "VERIFIED"})
        EthicalProfessionalAccess.objects.update_or_create(user=user, defaults={"status": "VERIFIED", "professional_basis": "Synthetic test", "schedules": [product.schedule], "activities": ["VIEW_CHAIN_ETHICAL", "PREPARE_LISTING", "APPROVE_TRANSFER"], "jurisdictions": ["QLD"]})
        for activity in ("VIEW_CHAIN_ETHICAL", "PREPARE_LISTING", "APPROVE_TRANSFER"):
            EthicalJurisdictionPolicy.objects.get_or_create(jurisdiction="QLD", activity=activity, schedule=product.schedule, mode="ANY", defaults={"allowed": True, "effective_from": timezone.now(), "policy_version": "test", "reviewed_by": user})

    def test_s8_respects_current_chain_stage_before_organisation_ceiling(self):
        source_user, source_owner = self.make_owner("s8-source@example.test")
        org_user, org_owner = self.make_owner("s8-org@example.test")
        org = Organization.objects.create(name="Org", slug="org-finalisation")
        source = Pharmacy.objects.create(name="Source", owner=source_owner, organization=org, verified=True, state="QLD")
        destination = Pharmacy.objects.create(name="Org destination", owner=org_owner, organization=org, verified=True, state="QLD")
        Chain.objects.create(name="Source owner chain", owner=source_owner, organization=org, is_active=True).pharmacies.add(source)
        product = EthicalProduct.objects.create(name="Synthetic S8", strength="1", form="pack", pack_size="1", schedule="S8", classification_provenance="test", status="APPROVED")
        self.approve(source_user, source, product); self.approve(org_user, destination, product)
        listing = EthicalListing.objects.create(pharmacy=source,accountable_owner=source_user,prepared_by=source_user,product=product,mode="TRANSFER",current_circle="CHAIN_PHARMACIES",maximum_circle="ORGANISATION_OWNERS",scope_owner_id=source_owner.id,status="PUBLISHED")
        self.assertFalse(listing_visible_to(org_user, listing))
        listing.current_circle = "ORGANISATION_OWNERS"; listing.save()
        self.assertTrue(listing_visible_to(org_user, listing))

    def test_browser_cannot_forge_unrelated_chain_scope(self):
        source_user, source_owner = self.make_owner("scope-source@example.test")
        _other_user, other_owner = self.make_owner("scope-other@example.test")
        source = Pharmacy.objects.create(name="Source", owner=source_owner, verified=True, state="QLD")
        other = Pharmacy.objects.create(name="Other", owner=other_owner, verified=True, state="QLD")
        source_chain = Chain.objects.create(name="Real source chain", owner=source_owner, is_active=True); source_chain.pharmacies.add(source)
        forged_chain = Chain.objects.create(name="Unrelated chain", owner=other_owner, is_active=True); forged_chain.pharmacies.add(other)
        product = EthicalProduct.objects.create(name="Synthetic S4", strength="1", form="pack", pack_size="1", schedule="S4", classification_provenance="test", status="APPROVED")
        listing = EthicalListing.objects.create(pharmacy=source,accountable_owner=source_user,prepared_by=source_user,product=product,mode="TRANSFER",current_circle="CHAIN_PHARMACIES",maximum_circle="PLATFORM_OWNERS",scope_owner_id=999999,scope_chain=forged_chain,scope_organization_id=999999)
        self.assertEqual(listing.scope_owner_id, source_owner.id)
        self.assertEqual(listing.scope_chain_id, source_chain.id)
        self.assertIsNone(listing.scope_organization_id)

    def test_current_circle_cannot_exceed_maximum_circle(self):
        user, owner = self.make_owner("circle@example.test")
        pharmacy = Pharmacy.objects.create(name="Circle", owner=owner, verified=True, state="QLD")
        product = EthicalProduct.objects.create(name="Synthetic S4 2", strength="1", form="pack", pack_size="1", schedule="S4", classification_provenance="test", status="APPROVED")
        with self.assertRaises(ValidationError):
            EthicalListing.objects.create(pharmacy=pharmacy,accountable_owner=user,prepared_by=user,product=product,mode="TRANSFER",current_circle="PLATFORM_OWNERS",maximum_circle="CHAIN_PHARMACIES",scope_owner_id=owner.id)

    def test_s8_denied_to_different_organisation(self):
        source_user, source_owner = self.make_owner("s8-owner1@example.test")
        other_user, other_owner = self.make_owner("s8-owner2@example.test")
        org1 = Organization.objects.create(name="Org 1", slug="org-1")
        org2 = Organization.objects.create(name="Org 2", slug="org-2")
        source = Pharmacy.objects.create(name="Source Org1", owner=source_owner, organization=org1, verified=True, state="QLD")
        dest_diff_org = Pharmacy.objects.create(name="Dest Org2", owner=other_owner, organization=org2, verified=True, state="QLD")
        product = EthicalProduct.objects.create(name="Synthetic S8 Multi", strength="1", form="pack", pack_size="1", schedule="S8", classification_provenance="test", status="APPROVED")
        self.approve(source_user, source, product)
        self.approve(other_user, dest_diff_org, product)
        listing = EthicalListing.objects.create(pharmacy=source, accountable_owner=source_user, prepared_by=source_user, product=product, mode="TRANSFER", current_circle="ORGANISATION_OWNERS", maximum_circle="ORGANISATION_OWNERS", scope_owner_id=source_owner.id, scope_organization_id=org1.id, status="PUBLISHED")
        # Same org owner can see, but different org owner cannot
        self.assertFalse(listing_visible_to(other_user, listing))
