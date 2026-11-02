"""Real commit boundaries: announcement outages cannot turn durable roster work into a failed request."""
from datetime import date, timedelta
from unittest import mock

from django.db import transaction
from django.test import TransactionTestCase

from client_profile.characterization_support import client_for, make_owner_with_pharmacy
from shifts.models import Shift
from shifts.posting import post_shift, revise_shift


class ShiftPostingCommitTests(TransactionTestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Commit Pharmacy")
        self.payload = {
            "pharmacy": self.pharmacy.pk,
            "role_needed": "PHARMACIST", "employment_type": "LOCUM",
            "visibility": "LOCUM_CASUAL", "rate_type": "FIXED", "fixed_rate": "70.00",
            "description": "Original",
            "slots": [{"date": str(date.today() + timedelta(days=14)),
                       "start_time": "09:00", "end_time": "17:00", "rate": "70.00"}],
        }

    def create(self):
        return client_for(self.owner).post("/api/v1/shifts/", self.payload, format="json")

    def test_post_announcement_outage_preserves_success_and_runs_availability(self):
        with mock.patch("shifts.posting.announce_posted_shift", side_effect=RuntimeError("queue offline")), mock.patch(
            "shifts.posting.announce_availability_matches",
        ) as matches:
            response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        shift = Shift.objects.get(pk=response.data["id"])
        self.assertEqual(shift.slots.count(), 1)
        matches.assert_called_once()
        self.assertEqual(matches.call_args.args[0].pk, shift.pk)

    def test_availability_outage_preserves_success_and_posted_announcement(self):
        with mock.patch("shifts.posting.announce_posted_shift") as posted, mock.patch(
            "shifts.posting.announce_availability_matches", side_effect=RuntimeError("queue offline"),
        ):
            response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(Shift.objects.filter(pk=response.data["id"]).exists())
        posted.assert_called_once()

    def test_edit_announcement_outage_preserves_success_and_updated_state(self):
        with mock.patch("shifts.posting.announce_posted_shift"), mock.patch("shifts.posting.announce_availability_matches"):
            created = self.create()
        self.assertEqual(created.status_code, 201, created.data)
        with mock.patch("shifts.posting.send_shift_updated_notifications", side_effect=RuntimeError("queue offline")):
            response = client_for(self.owner).patch(
                f'/api/v1/shifts/{created.data["id"]}/', {"description": "Updated"}, format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Shift.objects.get(pk=created.data["id"]).description, "Updated")

    def test_post_callbacks_wait_for_outer_commit_and_are_discarded_on_rollback(self):
        slots = [{"date": date.today() + timedelta(days=14), "start_time": "09:00", "end_time": "17:00"}]
        values = {"pharmacy": self.pharmacy, "role_needed": "PHARMACIST", "employment_type": "LOCUM",
                  "visibility": "LOCUM_CASUAL", "rate_type": "FIXED", "fixed_rate": "70.00"}
        with mock.patch("shifts.posting.announce_posted_shift") as posted, mock.patch(
            "shifts.posting.announce_availability_matches",
        ) as matches:
            with transaction.atomic():
                shift = post_shift(validated_data=values.copy(), slots_data=slots, created_by=self.owner,
                                   allowed_tiers=["FULL_PART_TIME", "LOCUM_CASUAL"])
                posted.assert_not_called()
                matches.assert_not_called()
            posted.assert_called_once()
            matches.assert_called_once()
            posted.reset_mock()
            matches.reset_mock()
            with self.assertRaisesMessage(RuntimeError, "rollback"), transaction.atomic():
                doomed = post_shift(validated_data=values.copy(), slots_data=slots, created_by=self.owner,
                                    allowed_tiers=["FULL_PART_TIME", "LOCUM_CASUAL"])
                raise RuntimeError("rollback")
            posted.assert_not_called()
            matches.assert_not_called()
        self.assertTrue(Shift.objects.filter(pk=shift.pk).exists())
        self.assertFalse(Shift.objects.filter(pk=doomed.pk).exists())

    def test_edit_callback_waits_for_outer_commit_and_is_discarded_on_rollback(self):
        with mock.patch("shifts.posting.announce_posted_shift"), mock.patch("shifts.posting.announce_availability_matches"):
            created = self.create()
        self.assertEqual(created.status_code, 201, created.data)
        shift = Shift.objects.get(pk=created.data["id"])
        with mock.patch("shifts.posting.send_shift_updated_notifications") as updated:
            with transaction.atomic():
                shift = revise_shift(shift, {"description": "Committed"})
                updated.assert_not_called()
            updated.assert_called_once()
            updated.reset_mock()
            with self.assertRaisesMessage(RuntimeError, "rollback"), transaction.atomic():
                revise_shift(shift, {"description": "Rolled back"})
                raise RuntimeError("rollback")
            updated.assert_not_called()
        shift.refresh_from_db()
        self.assertEqual(shift.description, "Committed")
