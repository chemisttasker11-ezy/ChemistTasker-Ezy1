from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from client_profile.models import Organization, OwnerOnboarding, Pharmacy
from marketplace.models import IdentityVerification, MarketplaceTermsAcceptance
from users.models import User
from .models import EthicalJurisdictionPolicy, EthicalListing, EthicalPharmacyApproval, EthicalProduct, EthicalProfessionalAccess
from .policy import listing_visible_to
from .models import (EthicalImportBatch, EthicalListingLot, EthicalProductIdentifier,
                     EthicalStagingRow, EthicalStockLot, EthicalStockMovement)


class EthicalMarketplaceTests(TestCase):
    def stock_context(self):
        user, owner = self.owner_user("stock-owner@example.test")
        pharmacy = Pharmacy.objects.create(name="Stock source", owner=owner, verified=True, state="QLD")
        product = EthicalProduct.objects.create(name="Approved S4", schedule="S4", status="APPROVED", classification_provenance="test")
        EthicalPharmacyApproval.objects.create(pharmacy=pharmacy, applicant=user, accountable_owner=user, status="VERIFIED", business_email=user.email)
        actions = ["VIEW_CHAIN_ETHICAL", "MANAGE_OWN_STOCK", "PREPARE_LISTING"]
        EthicalProfessionalAccess.objects.create(user=user, status="VERIFIED", schedules=["S4"], activities=actions, jurisdictions=["QLD"])
        for action in actions:
            EthicalJurisdictionPolicy.objects.create(jurisdiction="QLD", activity=action, schedule="S4", mode="ANY", allowed=True, effective_from=timezone.now(), policy_version="test", reviewed_by=user)
        lot = EthicalStockLot.objects.create(pharmacy=pharmacy, product=product, batch_number="A", expiry_date="2030-01-01", intact_pack_unit="pack", on_hand_quantity=10, storage_checks={"private_check": True}, source_reference="private-source", last_reconciled_at=timezone.now())
        client = APIClient(); client.force_authenticate(user)
        return user, pharmacy, product, lot, client

    def stock_listing(self, user, pharmacy, product, lot, **kwargs):
        listing = EthicalListing.objects.create(pharmacy=pharmacy, accountable_owner=user, prepared_by=user, product=product, mode="TRANSFER", current_circle="CHAIN_PHARMACIES", maximum_circle="PLATFORM_OWNERS", scope_owner_id=pharmacy.owner_id, **kwargs)
        EthicalListingLot.objects.create(listing=listing, lot=lot, quantity=2)
        return listing

    def test_draft_cannot_reassign_pharmacy_or_product_but_can_edit_amount(self):
        user, pharmacy, product, lot, client = self.stock_context()
        other_user, other_owner = self.owner_user("foreign-stock@example.test")
        other = Pharmacy.objects.create(name="Foreign", owner=other_owner, verified=True, state="QLD")
        controlled = EthicalProduct.objects.create(name="Unapproved schedule", schedule="S8", status="APPROVED", classification_provenance="test")
        listing = self.stock_listing(user, pharmacy, product, lot)
        path = f"/api/v1/ethical/listings/{listing.pk}/"
        for changes in ({"pharmacy": other.pk}, {"product": controlled.pk}, {"pharmacy": other.pk, "product": controlled.pk}):
            with self.subTest(changes=changes):
                response = client.patch(path, {"expected_version": 1, **changes}, format="json")
                self.assertIn(response.status_code, (400, 403), response.data)
                listing.refresh_from_db()
                self.assertEqual((listing.pharmacy_id, listing.product_id, listing.version), (pharmacy.pk, product.pk, 1))
                self.assertEqual(listing.scope_owner_id, pharmacy.owner_id)
                self.assertEqual(listing.lot_allocations.get().lot_id, lot.pk)
        response = client.patch(path, {"expected_version": 1, "amount": "10.00"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["amount"], "10.00")
        empty = EthicalListing.objects.create(pharmacy=pharmacy, accountable_owner=user, prepared_by=user, product=product, mode="TRANSFER", current_circle="CHAIN_PHARMACIES", maximum_circle="CHAIN_PHARMACIES", scope_owner_id=pharmacy.owner_id)
        response = client.patch(f"/api/v1/ethical/listings/{empty.pk}/", {"expected_version": 1, "pharmacy": other.pk}, format="json")
        self.assertEqual(response.status_code, 403, response.data)
        empty.refresh_from_db()
        self.assertEqual(empty.pharmacy_id, pharmacy.pk)

    @override_settings(ETHICAL_PRIVATE_READ_ENABLED=True)
    def test_bulk_stock_and_owned_listings_hide_unapproved_schedules(self):
        user, pharmacy, product, lot, client = self.stock_context()
        allowed = self.stock_listing(user, pharmacy, product, lot)
        controlled = EthicalProduct.objects.create(name="Hidden S8", schedule="S8", status="APPROVED", classification_provenance="test")
        hidden_lot = EthicalStockLot.objects.create(pharmacy=pharmacy, product=controlled, batch_number="B", expiry_date="2030-01-01", intact_pack_unit="pack", on_hand_quantity=20, last_reconciled_at=timezone.now())
        EthicalListing.objects.create(pharmacy=pharmacy, accountable_owner=user, prepared_by=user, product=controlled, mode="TRANSFER", current_circle="CHAIN_PHARMACIES", maximum_circle="CHAIN_PHARMACIES", scope_owner_id=pharmacy.owner_id)
        from organizations.models import PharmacyAdmin
        from .models import EthicalPharmacyGrant
        viewer, _ = self.owner_user("s4-delegate@example.test")
        assignment = PharmacyAdmin.objects.create(user=viewer, pharmacy=pharmacy, is_active=True)
        actions = ["VIEW_CHAIN_ETHICAL", "MANAGE_OWN_STOCK", "PREPARE_LISTING"]
        EthicalPharmacyGrant.objects.create(user=viewer, pharmacy=pharmacy, pharmacy_admin=assignment, grantor_owner=user, allowed_actions=actions, valid_from=timezone.now())
        EthicalProfessionalAccess.objects.create(user=viewer, status="VERIFIED", schedules=["S4"], activities=actions, jurisdictions=["QLD"])
        client.force_authenticate(viewer)
        response = client.get(f"/api/v1/ethical/inventory/lots/?pharmacy={pharmacy.pk}")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([row["id"] for row in response.data], [lot.pk])
        self.assertNotIn(hidden_lot.pk, [row["id"] for row in response.data])
        response = client.get(f"/api/v1/ethical/me/listings/?pharmacy={pharmacy.pk}")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([str(row["id"]) for row in response.data["results"]], [str(allowed.pk)])

    @override_settings(ETHICAL_PRIVATE_READ_ENABLED=True)
    def test_browse_only_offer_hides_inventory_details_from_list_and_detail(self):
        user, pharmacy, product, lot, client = self.stock_context()
        other = Pharmacy.objects.create(name="Buyer", owner=pharmacy.owner, verified=True, state="QLD")
        from organizations.models import Chain
        chain = Chain.objects.create(name="Owner chain", owner=pharmacy.owner, is_active=True)
        chain.pharmacies.add(pharmacy, other)
        listing = self.stock_listing(user, pharmacy, product, lot, status="PUBLISHED")
        EthicalPharmacyApproval.objects.create(pharmacy=other, applicant=user, accountable_owner=user, status="VERIFIED")
        from organizations.models import PharmacyAdmin
        from .models import EthicalPharmacyGrant
        viewer, _ = self.owner_user("browse-only@example.test")
        assignment = PharmacyAdmin.objects.create(user=viewer, pharmacy=other, is_active=True)
        EthicalPharmacyGrant.objects.create(user=viewer, pharmacy=other, pharmacy_admin=assignment, grantor_owner=user, allowed_actions=["VIEW_CHAIN_ETHICAL"], valid_from=timezone.now())
        EthicalProfessionalAccess.objects.create(user=viewer, status="VERIFIED", schedules=["S4"], activities=["VIEW_CHAIN_ETHICAL"], jurisdictions=["QLD"])
        client.force_authenticate(viewer)
        self.assertEqual(client.get(f"/api/v1/ethical/inventory/lots/?pharmacy={pharmacy.pk}").status_code, 403)
        detail = client.get(f"/api/v1/ethical/listings/{listing.pk}/")
        browse = client.get(f"/api/v1/ethical/listings/?pharmacy={other.pk}")
        self.assertEqual(detail.status_code, 200, detail.data)
        self.assertEqual(browse.status_code, 200, browse.data)
        for data in (detail.data, browse.data["results"][0]):
            allocation = data["lot_allocations"][0]
            self.assertEqual(allocation["quantity"], 2)
            self.assertNotIn("lot_detail", allocation)
            self.assertNotIn("private-source", str(data))
            self.assertNotIn("on_hand_quantity", str(data))
        client.force_authenticate(user)
        data = client.get(f"/api/v1/ethical/listings/{listing.pk}/").data
        self.assertEqual(data["lot_allocations"][0]["lot_detail"]["on_hand_quantity"], 10)

    def test_invalid_lot_selection_leaves_no_draft_or_allocations(self):
        user, pharmacy, product, lot, client = self.stock_context()
        other_user, other_owner = self.owner_user("invalid-lot@example.test")
        other = Pharmacy.objects.create(name="Other", owner=other_owner, verified=True, state="QLD")
        foreign = EthicalStockLot.objects.create(pharmacy=other, product=product, batch_number="X", expiry_date="2030-01-01", intact_pack_unit="pack", on_hand_quantity=10, last_reconciled_at=timezone.now())
        payload = {"pharmacy": pharmacy.pk, "product": product.pk, "mode": "TRANSFER", "current_circle": "CHAIN_PHARMACIES", "maximum_circle": "PLATFORM_OWNERS"}
        selections = [[], [{"lot": foreign.pk, "quantity": 1}], [{"lot": lot.pk, "quantity": 11}], [{"lot": lot.pk, "quantity": 1}, {"lot": foreign.pk, "quantity": 1}]]
        for lots in selections:
            with self.subTest(lots=lots):
                response = client.post("/api/v1/ethical/listings/", {**payload, "lots": lots}, format="json")
                self.assertIn(response.status_code, (400, 404), response.data)
                self.assertEqual(EthicalListing.objects.count(), 0)
                self.assertEqual(EthicalListingLot.objects.count(), 0)
        response = client.post("/api/v1/ethical/listings/", {**payload, "lots": [{"lot": lot.pk, "quantity": 2}]}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(EthicalListingLot.objects.get().quantity, 2)

    def test_import_commit_rechecks_inventory_write_switch(self):
        user, pharmacy, product, lot, client = self.stock_context()
        EthicalProductIdentifier.objects.create(product=product, kind="BARCODE", value="123456")
        batch = EthicalImportBatch.objects.create(pharmacy=pharmacy, created_by=user, source_rights_attested=True, status="STAGED")
        EthicalStagingRow.objects.create(batch=batch, row_number=2, status="PENDING", safe_payload={"barcode": "123456", "batch_number": "A", "expiry_date": "2030-01-01", "quantity": "7"})
        path = f"/api/v1/ethical/inventory/imports/{batch.pk}/commit/"
        with override_settings(ETHICAL_INVENTORY_ENABLED=False):
            self.assertEqual(client.post(path).status_code, 503)
        batch.refresh_from_db(); lot.refresh_from_db()
        self.assertEqual(batch.status, "STAGED")
        self.assertEqual(lot.on_hand_quantity, 10)
        self.assertEqual(EthicalStockMovement.objects.count(), 0)
        with override_settings(ETHICAL_INVENTORY_ENABLED=True):
            response = client.post(path)
        self.assertEqual(response.status_code, 200, response.data)
        lot.refresh_from_db()
        self.assertEqual(lot.on_hand_quantity, 7)
        self.assertEqual(EthicalStockMovement.objects.count(), 1)

    def test_inventory_write_switch_also_blocks_lot_edits_and_reconciliation(self):
        user, pharmacy, product, lot, client = self.stock_context()
        path = f"/api/v1/ethical/inventory/lots/{lot.pk}/"
        with override_settings(ETHICAL_INVENTORY_ENABLED=False):
            self.assertEqual(client.patch(path, {"expected_version": 1, "source_reference": "changed"}, format="json").status_code, 503)
            self.assertEqual(client.post(path + "reconcile/", {"expected_version": 1, "on_hand_quantity": 7}, format="json").status_code, 503)
        lot.refresh_from_db()
        self.assertEqual((lot.on_hand_quantity, lot.source_reference, lot.version), (10, "private-source", 1))
        self.assertFalse(EthicalStockMovement.objects.exists())
        with override_settings(ETHICAL_INVENTORY_ENABLED=True):
            self.assertEqual(client.patch(path, {"expected_version": 1, "source_reference": "changed"}, format="json").status_code, 200)
            self.assertEqual(client.post(path + "reconcile/", {"expected_version": 2, "on_hand_quantity": 7}, format="json").status_code, 200)
        lot.refresh_from_db()
        self.assertEqual((lot.on_hand_quantity, lot.source_reference, lot.version), (7, "changed", 3))

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
        response = client.get(f"/api/v1/ethical/pharmacies/{pharmacy.id}/approval/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "NOT_SUBMITTED")
        self.assertEqual(response["Cache-Control"], "private, no-store")

    @override_settings(ETHICAL_PRIVATE_READ_ENABLED=True)
    def test_unapproved_owner_cannot_read_catalogue(self):
        user, owner = self.owner_user("blocked@example.test")
        pharmacy = Pharmacy.objects.create(name="Blocked premises", owner=owner, verified=True, state="QLD")
        client = APIClient(); client.force_authenticate(user)
        response = client.get(f"/api/v1/ethical/catalogue/?pharmacy={pharmacy.id}")
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


class EthicalTransferDocumentValidationTests(TestCase):
    def test_accepts_pdf_signature(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from ethical_marketplace.views import _validate_transfer_document

        upload = SimpleUploadedFile('evidence.pdf', b'%PDF-1.7\nsynthetic-test-content', content_type='application/pdf')
        _validate_transfer_document(upload)
        self.assertEqual(upload.tell(), 0)

    def test_rejects_unknown_binary_signature(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from rest_framework.exceptions import ValidationError
        from ethical_marketplace.views import _validate_transfer_document

        upload = SimpleUploadedFile('evidence.bin', b'MZsynthetic-executable', content_type='application/octet-stream')
        with self.assertRaises(ValidationError):
            _validate_transfer_document(upload)


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


@override_settings(ETHICAL_INVENTORY_ENABLED=True, ETHICAL_PRIVATE_READ_ENABLED=True, ETHICAL_S8_ENABLED=True)
class EthicalS8LotAndTransferScheduleTests(TestCase):
    ACTIONS = ["VIEW_CHAIN_ETHICAL", "MANAGE_OWN_STOCK", "PREPARE_LISTING", "REQUEST_TRANSFER", "APPROVE_TRANSFER", "DISPATCH", "RECEIVE"]

    def owner_user(self, email):
        user = User.objects.create_user(email=email, password="x", role="OWNER", is_active=True, is_otp_verified=True,
                                        mobile_number="0400000000", is_mobile_verified=True)
        owner = OwnerOnboarding.objects.create(user=user, phone_number="0400000000", role="PHARMACIST", verified=True, ahpra_verified=True)
        IdentityVerification.objects.create(user=user, status="VERIFIED", assurance_method="MANUAL", verified_at=timezone.now())
        MarketplaceTermsAcceptance.objects.create(user=user, version="2026-09")
        return user, owner

    def setUp(self):
        self.user, owner = self.owner_user("s8-source@example.test")
        self.buyer, buyer_owner = self.owner_user("s8-destination@example.test")
        self.pharmacy = Pharmacy.objects.create(name="S8 source", owner=owner, verified=True, state="QLD")
        self.destination = Pharmacy.objects.create(name="S8 destination", owner=buyer_owner, verified=True, state="QLD")
        self.products = {schedule: EthicalProduct.objects.create(name=schedule, strength="1", form="pack", pack_size="1", schedule=schedule,
                                                                 status="APPROVED", classification_provenance="test")
                         for schedule in ("S4", "S8")}
        for schedule in self.products:
            for action in self.ACTIONS:
                EthicalJurisdictionPolicy.objects.create(jurisdiction="QLD", activity=action, schedule=schedule, mode="ANY", allowed=True,
                                                         effective_from=timezone.now() - timedelta(days=1), policy_version="test", reviewed_by=self.user)
        EthicalPharmacyApproval.objects.create(pharmacy=self.pharmacy, applicant=self.user, accountable_owner=self.user,
                                               business_phone="0700000000", business_email=self.user.email, status="VERIFIED")
        self.client = APIClient(); self.client.force_authenticate(self.user)

    def grant(self, schedules):
        EthicalProfessionalAccess.objects.create(user=self.user, status="VERIFIED", professional_basis="test", schedules=schedules,
                                                 activities=self.ACTIONS, jurisdictions=["QLD"])

    def create_lot(self, schedule):
        return self.client.post("/api/v1/ethical/inventory/lots/", {
            "pharmacy": self.pharmacy.pk, "product": self.products[schedule].pk, "batch_number": "B1", "expiry_date": "2030-01-01",
            "on_hand_quantity": 5, "source_reference": "test", "last_reconciled_at": timezone.now().isoformat()}, format="json")

    def transfer(self, schedule):
        from .models import EthicalTransfer
        listing = EthicalListing.objects.create(pharmacy=self.pharmacy, accountable_owner=self.user, prepared_by=self.user,
                                                product=self.products[schedule], mode="DONATE", current_circle="CHAIN_PHARMACIES",
                                                maximum_circle="CHAIN_PHARMACIES", scope_owner_id=self.pharmacy.owner_id, status="PUBLISHED")
        return EthicalTransfer.objects.create(listing=listing, source_pharmacy=self.pharmacy, destination_pharmacy=self.destination,
                                              requested_by=self.buyer, mode="DONATE")

    def listed_transfers(self):
        response = self.client.get("/api/v1/ethical/transfers/", {"pharmacy": self.pharmacy.pk})
        self.assertEqual(response.status_code, 200, response.data)
        return {str(row["id"]) for row in response.data}

    def test_s8_lot_and_transfers_require_the_s8_schedule(self):
        self.grant(["S4"])
        s4, s8 = self.transfer("S4"), self.transfer("S8")
        self.assertEqual(self.create_lot("S8").status_code, 403)
        self.assertFalse(EthicalStockLot.objects.filter(product=self.products["S8"]).exists())
        self.assertEqual(self.listed_transfers(), {str(s4.pk)})
        self.assertEqual(self.create_lot("S4").status_code, 201)

    def test_mode_specific_policy_still_lists_its_transfers(self):
        EthicalJurisdictionPolicy.objects.filter(activity="VIEW_CHAIN_ETHICAL").update(mode="DONATE")
        self.grant(["S4"])
        donated = self.transfer("S4")
        self.assertEqual(self.listed_transfers(), {str(donated.pk)})
        EthicalJurisdictionPolicy.objects.filter(activity="VIEW_CHAIN_ETHICAL").update(mode="SELL")
        self.assertEqual(self.listed_transfers(), set())

    def test_s8_schedule_holder_still_creates_s8_lots_and_sees_s8_transfers(self):
        self.grant(["S4", "S8"])
        s4, s8 = self.transfer("S4"), self.transfer("S8")
        self.assertEqual(self.create_lot("S8").status_code, 201)
        self.assertEqual(self.listed_transfers(), {str(s4.pk), str(s8.pk)})
