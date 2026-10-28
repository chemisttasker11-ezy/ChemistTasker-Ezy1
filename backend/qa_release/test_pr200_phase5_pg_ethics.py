"""PR200 B31: actual PostgreSQL two-connection ethical-stock reservation audit.

No production or staging data. Negative asserts exactly one accepted
transfer for one exclusive published listing, even when different lots are
requested in parallel. A positive permitted request must pass first.
"""
from datetime import timedelta
from queue import Queue
from threading import Barrier, Thread
from unittest import skipUnless
from unittest.mock import patch
from uuid import uuid4
import json

from django.db import close_old_connections, connection
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from client_profile.models import OwnerOnboarding, Pharmacy
from marketplace.models import IdentityVerification, MarketplaceTermsAcceptance
from users.models import User
from ethical_marketplace.models import (
    EthicalJurisdictionPolicy, EthicalListing, EthicalListingLot,
    EthicalPharmacyApproval, EthicalProduct, EthicalProfessionalAccess,
    EthicalReservation, EthicalStockLot, EthicalTransfer,
)
from ethical_marketplace.views import listing_visible_to as real_listing_visible_to
from ethical_marketplace.serializers import TransferSerializer as OriginalTransferSerializer
from rest_framework.renderers import JSONRenderer


class _TestReceiptJSONCompatibleTransferSerializer(OriginalTransferSerializer):
    """B31 isolation only: use DRF's own JSONRenderer to encode UUIDs before
    persistence into the receipt JSONField. This is NOT production behavior.
    The separate real-handler UUID receipt failure is documented and not
    credited as a reproduced B31 concurrency finding.
    """
    @property
    def data(self):
        return json.loads(JSONRenderer().render(super().data))


@skipUnless(connection.vendor == "postgresql", "Requires real PostgreSQL row locks")
@override_settings(ETHICAL_NEW_TRANSFERS_ENABLED=True, ETHICAL_PRIVATE_READ_ENABLED=True)
class B31EthicalExclusiveListingPostgres(TransactionTestCase):
    def make_owner(self, email):
        user = User.objects.create_user(
            email=email, password="synthetic", role="OWNER",
            is_active=True, is_otp_verified=True,
            mobile_number="0499000031", is_mobile_verified=True,
        )
        owner = OwnerOnboarding.objects.create(
            user=user, phone_number="0499000031", role="PHARMACIST",
            verified=True, ahpra_verified=True,
        )
        IdentityVerification.objects.create(
            user=user, status="VERIFIED", assurance_method="MANUAL",
            verified_at=timezone.now(),
        )
        MarketplaceTermsAcceptance.objects.create(user=user, version="2026-09")
        return user, owner

    def setUp(self):
        self.assertEqual(connection.vendor, "postgresql")
        self.source_user, source_owner = self.make_owner("b31-source@example.test")
        self.buyer, buyer_owner = self.make_owner("b31-buyer@example.test")
        self.source = Pharmacy.objects.create(
            name="P5 B31 Source", owner=source_owner, verified=True, state="QLD",
        )
        self.destination = Pharmacy.objects.create(
            name="P5 B31 Destination", owner=buyer_owner, verified=True, state="QLD",
        )
        self.product = EthicalProduct.objects.create(
            name="Synthetic S4 audit item", strength="1", form="pack",
            pack_size="1", schedule="S4", status="APPROVED",
            classification_provenance="PR200 synthetic",
        )
        EthicalPharmacyApproval.objects.create(
            pharmacy=self.destination, applicant=self.buyer,
            accountable_owner=self.buyer, business_phone="0700000000",
            business_email=self.buyer.email, status="VERIFIED",
        )
        EthicalProfessionalAccess.objects.create(
            user=self.buyer, status="VERIFIED", professional_basis="Synthetic test",
            schedules=["S4"], activities=["VIEW_CHAIN_ETHICAL", "REQUEST_TRANSFER"],
            jurisdictions=["QLD"],
        )
        for activity in ("VIEW_CHAIN_ETHICAL", "REQUEST_TRANSFER"):
            EthicalJurisdictionPolicy.objects.create(
                jurisdiction="QLD", activity=activity, schedule="S4",
                mode="ANY", allowed=True, effective_from=timezone.now(),
                policy_version="PR200-test", reviewed_by=self.source_user,
            )
        self.listing = EthicalListing.objects.create(
            pharmacy=self.source, accountable_owner=self.source_user,
            prepared_by=self.source_user, product=self.product, mode="TRANSFER",
            current_circle="PLATFORM_OWNERS", maximum_circle="PLATFORM_OWNERS",
            scope_owner_id=source_owner.pk, status="PUBLISHED",
        )
        self.lots = []
        for index in (1, 2):
            lot = EthicalStockLot.objects.create(
                pharmacy=self.source, product=self.product,
                batch_number=f"PR200-B31-BATCH-{index}",
                expiry_date=timezone.localdate() + timedelta(days=180),
                on_hand_quantity=10, reserved_quantity=0,
                source_reference="synthetic", last_reconciled_at=timezone.now(),
            )
            EthicalListingLot.objects.create(
                listing=self.listing, lot=lot, quantity=1,
            )
            self.lots.append(lot)

    def post_for_lot(self, lot_id):
        client = APIClient()
        client.force_authenticate(User.objects.get(pk=self.buyer.pk))
        return client.post(
            f"/api/v1/ethical/listings/{self.listing.pk}/requests/",
            {"destination_pharmacy": self.destination.pk,
             "client_request_id": str(uuid4()),
             "lines": [{"lot": lot_id, "quantity": 1}]},
            format="json",
        )

    def test_b31_positive_one_transfer_then_sequential_second_denied(self):
        # Isolate listing reservation concurrency from a separate confirmed
        # JSONField UUID serialization failure in the receipt path.
        with patch("ethical_marketplace.views.TransferSerializer",
                   _TestReceiptJSONCompatibleTransferSerializer):
            response = self.post_for_lot(self.lots[0].pk)
            self.assertEqual(response.status_code, 201, response.data)
            self.listing.refresh_from_db()
            self.assertEqual(self.listing.status, "RESERVED")
            denied = self.post_for_lot(self.lots[1].pk)
        self.assertIn(denied.status_code, (400, 403, 404, 409), denied.data)
        self.assertEqual(EthicalTransfer.objects.filter(listing=self.listing).count(), 1)
        self.assertEqual(EthicalReservation.objects.filter(active=True).count(), 1)

    def test_b31_parallel_disjoint_lot_requests_reserve_one_listing_once(self):
        start_gate = Barrier(2)
        results = Queue()

        def both_pass_published_visibility(user, listing):
            allowed = real_listing_visible_to(user, listing)
            if allowed:
                # The view already read PUBLISHED; coordinate before either
                # reservation transaction. No product transaction code mocked.
                start_gate.wait(timeout=20)
            return allowed

        def submit(lot_pk):
            close_old_connections()
            try:
                result = self.post_for_lot(lot_pk)
                results.put(("HTTP", result.status_code, str(result.data)[:250]))
            except Exception as exc:
                results.put(("EXCEPTION", repr(exc), ""))
            finally:
                close_old_connections()

        with patch("ethical_marketplace.views.TransferSerializer",
                   _TestReceiptJSONCompatibleTransferSerializer), patch(
                   "ethical_marketplace.views.listing_visible_to",
                   side_effect=both_pass_published_visibility):
            threads = [
                Thread(target=submit, args=(lot.pk,), daemon=True)
                for lot in self.lots
            ]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=40)
        self.assertFalse(
            any(thread.is_alive() for thread in threads),
            "B31 concurrency fixture timed out; invalid until rerun.",
        )
        outcomes = [results.get(timeout=5) for _ in self.lots]
        self.assertFalse(
            any(kind == "EXCEPTION" for kind, _, _ in outcomes),
            f"B31 test fixture errors cannot be called reproduced: {outcomes}",
        )
        accepted = [x for x in outcomes if x[1] == 201]
        self.assertEqual(len(accepted), 1, f"Two requests passed PUBLISHED gate: {outcomes}")
        self.assertEqual(EthicalTransfer.objects.filter(listing=self.listing).count(), 1)
        self.assertEqual(EthicalReservation.objects.filter(active=True).count(), 1)
