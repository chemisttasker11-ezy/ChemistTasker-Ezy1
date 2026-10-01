"""Invalid requests to the kernel views are answered with HTTP 400 and the view's message, never with a 500.

These views raise rest_framework's ValidationError. Before, the name was bound to django's ValidationError (the old
client_profile/views.py imported DRF's and a later `from .models import *` replaced it), which DRF does not convert,
so every one of these answers was an HTTP 500."""
from datetime import timedelta

from django.contrib.contenttypes.models import ContentType
from django.core.signing import TimestampSigner
from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import BASE, client_for, make_owner_with_pharmacy, make_user
from client_profile.domains.shifts.limits import MAX_PUBLIC_SHIFTS_PER_DAY
from client_profile.models import PharmacistOnboarding, RefereeResponse, Shift, WorkerShiftRequest


class QueryParameterValidationTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()

    def test_dashboard_rejects_a_pharmacy_id_that_is_not_a_number(self):
        res = client_for(self.owner).get(BASE + "dashboard/owner/?pharmacy_id=abc")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json(), {"pharmacy_id": "Invalid pharmacy id."})

    def test_counter_offer_batch_rejects_ids_that_are_not_numbers(self):
        res = client_for(self.owner).get(BASE + "community-shifts/counter-offers-batch/?shift_ids=1,abc")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json(), {"shift_ids": "Use a comma-separated list of numeric shift IDs."})

    def test_counter_offer_batch_rejects_more_than_a_hundred_ids(self):
        ids = ",".join(str(n) for n in range(1, 102))
        res = client_for(self.owner).get(BASE + f"community-shifts/counter-offers-batch/?shift_ids={ids}")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json(), {"shift_ids": "A maximum of 100 shifts can be requested at once."})

    def test_public_job_board_rejects_an_organization_that_is_not_a_number(self):
        res = client_for().get(BASE + "public-job-board/?organization=abc")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json(), {"organization": "Organization must be a valid id."})


class WorkerShiftRequestValidationTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.worker = make_user("OTHER_STAFF")   # no onboarding: an OTHER_STAFF request cannot resolve to a shift role
        self.request = WorkerShiftRequest.objects.create(
            pharmacy=self.pharmacy, requested_by=self.worker, role="OTHER_STAFF",
            slot_date=timezone.localdate() + timedelta(days=3), start_time="09:00", end_time="17:00",
        )
        self.url = BASE + f"worker-shift-requests/{self.request.id}/"

    def test_the_requester_cannot_change_or_cancel_a_request_that_is_no_longer_pending(self):
        WorkerShiftRequest.objects.filter(pk=self.request.pk).update(status="REJECTED")
        worker = client_for(self.worker)
        for res in (worker.patch(self.url, {"note": "changed"}, format="json"), worker.delete(self.url)):
            self.assertEqual(res.status_code, 400)
            self.assertEqual(res.json(), ["Only pending cover requests can be updated or cancelled."])
        self.assertTrue(WorkerShiftRequest.objects.filter(pk=self.request.pk, status="REJECTED").exists())

    def test_approving_a_request_without_a_resolvable_role_is_rejected(self):
        res = client_for(self.owner).post(self.url + "approve/", {}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(
            res.json(), {"role": "Other staff cover requests must resolve to a specific shift role before approval."})
        self.request.refresh_from_db()
        self.assertEqual(self.request.status, "PENDING")
        self.assertFalse(Shift.objects.filter(pharmacy=self.pharmacy).exists())


class PublicShiftQuotaTests(TestCase):
    """At the daily quota of public shifts, escalation to the platform is refused, and only that is refused."""

    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        for _ in range(MAX_PUBLIC_SHIFTS_PER_DAY):
            self.shift(visibility="PLATFORM")

    def shift(self, **extra):
        return Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST", employment_type="LOCUM", **extra)

    def test_shift_lists_keep_working_and_the_due_escalation_waits(self):
        due = self.shift(visibility="LOCUM_CASUAL", escalate_to_platform=timezone.now() - timedelta(hours=1))
        res = client_for(make_user("PHARMACIST")).get(BASE + "community-shifts/")
        self.assertEqual(res.status_code, 200)
        due.refresh_from_db()
        self.assertEqual(due.visibility, "LOCUM_CASUAL")

    def test_manual_escalation_to_the_platform_is_refused(self):
        shift = self.shift(visibility="LOCUM_CASUAL")
        res = client_for(self.owner).post(
            BASE + f"shifts/{shift.id}/escalate/", {"target_visibility": "PLATFORM"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(
            res.json(),
            {"detail": f"Maximum of {MAX_PUBLIC_SHIFTS_PER_DAY} public shifts per day reached for {self.pharmacy.name}."})
        shift.refresh_from_db()
        self.assertEqual(shift.visibility, "LOCUM_CASUAL")


class RefereeResponseValidationTests(TestCase):
    def test_a_second_reference_from_the_same_referee_is_rejected(self):
        onboarding = PharmacistOnboarding.objects.create(user=make_user("PHARMACIST"))
        RefereeResponse.objects.create(
            content_type=ContentType.objects.get_for_model(PharmacistOnboarding), object_id=onboarding.pk, referee_index=1)
        token = TimestampSigner().sign(f"PharmacistOnboarding:{onboarding.pk}:1")
        res = client_for().post(BASE + f"onboarding/submit-reference/{token}/", {"would_rehire": "Yes"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json(), {"detail": "A reference has already been submitted for this candidate."})
        self.assertEqual(RefereeResponse.objects.filter(object_id=onboarding.pk).count(), 1)
