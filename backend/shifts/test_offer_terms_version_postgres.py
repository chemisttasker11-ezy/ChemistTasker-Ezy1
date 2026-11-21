"""D2: a worker cannot consent to a rate before a concurrent roster update commits."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, time, timedelta
from decimal import Decimal
from threading import Event
from time import sleep
from unittest import mock, skipUnless

from django.db import close_old_connections, connection, transaction
from django.test import TransactionTestCase

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from onboarding.models import PharmacistOnboarding
from shifts.engagement import shift_engagement_terms_version
from shifts.models import Shift, ShiftOffer, ShiftSlot, ShiftSlotAssignment


@skipUnless(connection.vendor == "postgresql", "PostgreSQL row locking required.")
class OfferTermsVersionPostgresTests(TransactionTestCase):
    """Concurrent slot edits are ordered before acceptance's locked terms check."""

    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("W3-D2 terms race")
        self.worker = make_user("PHARMACIST", mobile_number="0411111111")
        PharmacistOnboarding.objects.create(
            user=self.worker, verified=True, short_bio="Bio", rate_preference={},
        )
        Membership.objects.create(
            user=self.worker, pharmacy=self.pharmacy, role="PHARMACIST",
            employment_type="LOCUM", status=Membership.Status.ACCEPTED,
            is_active=True,
        )
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            role_needed="PHARMACIST", employment_type="LOCUM",
            visibility="LOCUM_CASUAL", single_user_only=False,
        )
        day = date.today() + timedelta(days=14)
        self.slot = ShiftSlot.objects.create(
            shift=self.shift, date=day,
            start_time=time(9), end_time=time(17), rate=Decimal("60.00"),
        )
        self.offer = ShiftOffer.objects.create(
            shift=self.shift, slot=self.slot, offered_slot_date=day, user=self.worker,
        )

    def terms_at_rate(self, rate):
        return {
            "version": 1,
            "acceptance_required": True,
            "engagement_kind": "INDEPENDENT_CONTRACTOR",
            "settlement_channel": "INVOICE",
            "payment_preference": "ABN",
            "occurrences": [{
                "slot_id": self.slot.pk, "date": str(self.slot.date),
                "agreed_rate": str(rate),
            }],
        }

    def test_concurrent_rate_change_invalidates_previously_reviewed_offer(self):
        reviewed = shift_engagement_terms_version(self.terms_at_rate(Decimal("60.00")))
        entered = Event()

        def build_terms(**_kwargs):
            # Intentionally read under the endpoint's Shift/Slot/Offer locks.
            latest = ShiftSlot.objects.get(pk=self.slot.pk)
            return self.terms_at_rate(latest.rate)

        def accept_in_new_connection():
            close_old_connections()
            try:
                entered.set()
                client = client_for(type(self.worker).objects.get(pk=self.worker.pk))
                return client.post(
                    f"/api/v1/shift-offers/{self.offer.pk}/accept/",
                    {
                        "engagement_terms_accepted": True,
                        "independent_contractor_status_confirmed": True,
                        "terms_version": reviewed,
                    },
                    format="json",
                )
            finally:
                close_old_connections()

        with mock.patch("shifts.engagement.build_shift_engagement_terms", side_effect=build_terms):
            with ThreadPoolExecutor(max_workers=1) as pool:
                with transaction.atomic():
                    locked = ShiftSlot.objects.select_for_update().get(pk=self.slot.pk)
                    locked.rate = Decimal("75.00")
                    locked.save(update_fields=["rate"])
                    future = pool.submit(accept_in_new_connection)
                    self.assertTrue(entered.wait(5), "worker did not start")
                    sleep(0.1)
                    self.assertFalse(future.done(), "acceptance bypassed the locked slot")
                response = future.result(timeout=15)

        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data.get("code"), "TERMS_CHANGED")
        self.offer.refresh_from_db()
        self.assertEqual(self.offer.status, ShiftOffer.Status.PENDING)
        self.assertIsNone(self.offer.engagement_terms_accepted_at)
        self.assertFalse(ShiftSlotAssignment.objects.filter(shift=self.shift).exists())
