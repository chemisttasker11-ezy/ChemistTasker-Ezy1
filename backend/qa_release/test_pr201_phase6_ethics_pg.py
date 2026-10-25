"""PR201 B31 real PostgreSQL listing-lock and UUID receipt acceptance.

The handler and DRF serializer are unmodified in tests (no JSON conversion
test seam); concurrency uses independent database connections and two lots.
"""
from datetime import timedelta
from queue import Queue
from threading import Barrier, Thread, local
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
    EthicalRequestReceipt, EthicalReservation, EthicalStockLot, EthicalTransfer,
)
from ethical_marketplace.views import listing_visible_to as actual_visibility


@skipUnless(connection.vendor == "postgresql", "Requires PostgreSQL row locks")
@override_settings(ETHICAL_NEW_TRANSFERS_ENABLED=True, ETHICAL_PRIVATE_READ_ENABLED=True)
class B31ListingReservationPostgres(TransactionTestCase):
    def owner(self, email):
        user = User.objects.create_user(
            email=email, password="synthetic", role="OWNER",
            is_active=True, is_otp_verified=True,
            mobile_number="0499000031", is_mobile_verified=True,
        )
        profile = OwnerOnboarding.objects.create(
            user=user, phone_number="0499000031", role="PHARMACIST",
            verified=True, ahpra_verified=True,
        )
        IdentityVerification.objects.create(
            user=user, status="VERIFIED", assurance_method="MANUAL",
            verified_at=timezone.now(),
        )
        MarketplaceTermsAcceptance.objects.create(user=user, version="2026-09")
        return user, profile

    def setUp(self):
        self.source_user, source_owner = self.owner("p6-source@example.test")
        self.buyer, buyer_owner = self.owner("p6-buyer@example.test")
        self.source = Pharmacy.objects.create(
            name="P6 Source", owner=source_owner, verified=True, state="QLD"
        )
        self.destination = Pharmacy.objects.create(
            name="P6 Destination", owner=buyer_owner, verified=True, state="QLD"
        )
        self.product = EthicalProduct.objects.create(
            name="Synthetic S4 audit item", strength="1", form="pack",
            pack_size="1", schedule="S4", status="APPROVED",
            classification_provenance="PR201 synthetic",
        )
        EthicalPharmacyApproval.objects.create(
            pharmacy=self.destination, applicant=self.buyer,
            accountable_owner=self.buyer, business_phone="0700000000",
            business_email=self.buyer.email, status="VERIFIED",
        )
        EthicalProfessionalAccess.objects.create(
            user=self.buyer, status="VERIFIED",
            professional_basis="Synthetic test", schedules=["S4"],
            activities=["VIEW_CHAIN_ETHICAL", "REQUEST_TRANSFER"],
            jurisdictions=["QLD"],
        )
        for activity in ("VIEW_CHAIN_ETHICAL", "REQUEST_TRANSFER"):
            EthicalJurisdictionPolicy.objects.create(
                jurisdiction="QLD", activity=activity, schedule="S4",
                mode="ANY", allowed=True, effective_from=timezone.now(),
                policy_version="PR201", reviewed_by=self.source_user,
            )
        self.listing = EthicalListing.objects.create(
            pharmacy=self.source, accountable_owner=self.source_user,
            prepared_by=self.source_user, product=self.product, mode="TRANSFER",
            current_circle="PLATFORM_OWNERS", maximum_circle="PLATFORM_OWNERS",
            scope_owner_id=source_owner.pk, status="PUBLISHED",
        )
        self.lots = []
        for number in (1, 2):
            lot = EthicalStockLot.objects.create(
                pharmacy=self.source, product=self.product,
                batch_number=f"PR201-B31-{number}",
                expiry_date=timezone.localdate() + timedelta(days=180),
                on_hand_quantity=10, reserved_quantity=0,
                source_reference="synthetic", last_reconciled_at=timezone.now(),
            )
            EthicalListingLot.objects.create(listing=self.listing, lot=lot, quantity=1)
            self.lots.append(lot)

    def submit(self, lot_id, request_id=None, quantity=1):
        client = APIClient()
        client.force_authenticate(User.objects.get(pk=self.buyer.pk))
        return client.post(
            f"/api/v1/ethical/listings/{self.listing.pk}/requests/",
            {
                "destination_pharmacy": self.destination.pk,
                "client_request_id": request_id or str(uuid4()),
                "lines": [{"lot": lot_id, "quantity": quantity}],
            },
            format="json",
        )

    def test_receipt_uuid_is_json_safe_and_same_key_replays(self):
        key = str(uuid4())
        created = self.submit(self.lots[0].pk, request_id=key)
        self.assertEqual(created.status_code, 201, created.data)
        receipt = EthicalRequestReceipt.objects.get(
            actor=self.buyer, action="TRANSFER_REQUEST", client_request_id=key,
        )
        self.assertEqual(str(created.data["id"]), receipt.outcome["id"])
        self.assertIsInstance(receipt.outcome["listing"], str)
        json.dumps(receipt.outcome)
        replay = self.submit(self.lots[0].pk, request_id=key)
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual(replay.data, created.data)
        mismatch = self.submit(self.lots[1].pk, request_id=key)
        self.assertEqual(mismatch.status_code, 409, mismatch.data)
        self.assertEqual(EthicalTransfer.objects.filter(listing=self.listing).count(), 1)
        self.assertEqual(EthicalReservation.objects.filter(active=True).count(), 1)

    def test_distinct_sequential_requests_cannot_reserve_two_lots(self):
        first = self.submit(self.lots[0].pk)
        self.assertEqual(first.status_code, 201, first.data)
        second = self.submit(self.lots[1].pk)
        self.assertIn(second.status_code, (403, 404, 409), second.data)
        self.assertEqual(EthicalTransfer.objects.filter(listing=self.listing).count(), 1)

    def test_two_connections_different_lots_only_one_accepted(self):
        entry = Barrier(2)
        marked = local()
        outcomes = Queue()

        def gated_visibility(user, listing):
            permitted = actual_visibility(user, listing)
            if permitted and not getattr(marked, "first_check_complete", False):
                marked.first_check_complete = True
                entry.wait(timeout=20)
            return permitted

        def worker(lot_pk):
            close_old_connections()
            try:
                response = self.submit(lot_pk)
                outcomes.put(("HTTP", response.status_code, str(response.data)[:200]))
            except Exception as error:
                outcomes.put(("EXCEPTION", repr(error), ""))
            finally:
                close_old_connections()

        with patch(
            "ethical_marketplace.views.listing_visible_to",
            side_effect=gated_visibility,
        ):
            threads = [
                Thread(target=worker, args=(lot.pk,), daemon=True)
                for lot in self.lots
            ]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=40)

        self.assertFalse(any(t.is_alive() for t in threads), "Concurrency fixture timeout")
        received = [outcomes.get(timeout=5) for _ in self.lots]
        self.assertFalse(
            any(kind == "EXCEPTION" for kind, _, _ in received),
            f"Test/setup errors are not concurrency failures: {received}",
        )
        self.assertEqual(len([row for row in received if row[1] == 201]), 1, received)
        self.assertEqual(EthicalTransfer.objects.filter(listing=self.listing).count(), 1)
        self.assertEqual(EthicalReservation.objects.filter(active=True).count(), 1)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, "RESERVED")
