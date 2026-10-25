"""B66: overnight cancellation wages match the daytime control from ct-a2d."""
from datetime import datetime, time, timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import (
    client_for, make_assignment, make_owner_with_pharmacy, make_user,
)


class CancellationWageContracts(TestCase):
    def test_overnight_cancellation_has_same_positive_wage_as_day_shift(self):
        owner, pharmacy = make_owner_with_pharmacy("Cancellation wage")
        shift, slot, assignment = make_assignment(
            pharmacy, owner, make_user("PHARMACIST"),
            day=timezone.localdate() + timedelta(days=10),
        )
        assignment.unit_rate = Decimal("65.00")
        assignment.save(update_fields=["unit_rate"])
        owner_client = client_for(owner)
        for start, end in ((time(9), time(17)), (time(22), time(6))):
            with self.subTest(start=start, end=end):
                slot.start_time, slot.end_time = start, end
                slot.save(update_fields=["start_time", "end_time"])
                now = timezone.make_aware(datetime.combine(slot.date, start)) - timedelta(hours=6)
                with mock.patch("django.utils.timezone.now", return_value=now), mock.patch("billing.views.stripe.checkout.Session.create") as checkout:
                    checkout.return_value.url = "https://checkout.example.test/cancellation"
                    response = owner_client.post(f"/api/v1/billing/charge-penalty/{shift.pk}/", {}, format="json")
                self.assertEqual(response.status_code, 200, response.data)
                checkout.assert_called_once()
                self.assertEqual(checkout.call_args.kwargs["line_items"][0]["price_data"]["unit_amount"], 10400)
