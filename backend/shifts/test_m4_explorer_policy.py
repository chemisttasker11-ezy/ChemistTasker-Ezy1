"""M4-05: actual endpoint scope, worker ownership and read-only controls.

These are qualification controls on the integration base; Explorer's backend
403 is already the intended contract and is NOT a fabricated red test.
"""
from datetime import date, time, timedelta

from django.test import TestCase
from client_profile.characterization_support import (
    client_for, make_owner_with_pharmacy, make_staff_member, make_user,
)
from onboarding.models import PharmacistOnboarding
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment

BASE = "/api/v1/"
CONFIRMED = "my-confirmed-shifts/"
HISTORY = "my-history-shifts/"


class ExplorerWorkerShiftAccessTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("M4 Explorer access A")
        self.foreign_owner, self.foreign_pharmacy = make_owner_with_pharmacy("M4 foreign B")
        self.explorer = make_user("EXPLORER")
        self.pharmacists = [make_user("PHARMACIST") for _ in range(3)]
        for user in self.pharmacists:
            PharmacistOnboarding.objects.create(user=user, verified=True)
        self.staff = [make_staff_member(self.pharmacy, role=role)[0]
                      for role in ("TECHNICIAN", "ASSISTANT", "INTERN")]

    def create_assignment(self, user, *, past=False, recurring=False, pharmacy=None, poster=None):
        work_day = date.today() + timedelta(days=-20 if past else 20)
        shift = Shift.objects.create(
            pharmacy=pharmacy or self.pharmacy, created_by=poster or self.owner,
            role_needed="PHARMACIST" if user.role == "PHARMACIST" else "ASSISTANT",
            employment_type="LOCUM", visibility="PLATFORM",
        )
        slot = ShiftSlot.objects.create(
            shift=shift, date=work_day,
            start_time=time(9), end_time=time(17),
            is_recurring=recurring,
            recurring_days=[0, 1, 2, 3, 4, 5, 6] if recurring else [],
            recurring_end_date=work_day + timedelta(days=40) if recurring else None,
        )
        ShiftSlotAssignment.objects.create(
            shift=shift, slot=slot, slot_date=work_day, user=user,
        )
        return shift, work_day

    def ids(self, user, endpoint):
        response = client_for(user).get(BASE + endpoint)
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        return {row["id"]: row for row in rows}

    def test_explorer_and_poster_roles_cannot_use_personal_worker_endpoints(self):
        # Backend remains unchanged: no Explorer promotion, not even through owner role.
        for who in (self.explorer, self.owner, self.foreign_owner):
            for endpoint in (CONFIRMED, HISTORY):
                with self.subTest(role=who.role, email=who.email, endpoint=endpoint):
                    response = client_for(who).get(BASE + endpoint)
                    self.assertEqual(response.status_code, 403)

    def test_anonymous_personal_worker_endpoints_are_unauthorized(self):
        for endpoint in (CONFIRMED, HISTORY):
            with self.subTest(endpoint=endpoint):
                self.assertEqual(client_for().get(BASE + endpoint).status_code, 401)

    def test_worker_roles_keep_both_personal_endpoints_and_own_rows_only(self):
        for user in self.pharmacists + self.staff:
            with self.subTest(role=user.role, email=user.email):
                own_future, _ = self.create_assignment(user)
                own_past, _ = self.create_assignment(user, past=True)
                other = next(person for person in self.pharmacists if person.pk != user.pk)
                other_future, _ = self.create_assignment(other)
                other_past, _ = self.create_assignment(other, past=True)
                confirmed = self.ids(user, CONFIRMED)
                history = self.ids(user, HISTORY)
                self.assertIn(own_future.pk, confirmed)
                self.assertNotIn(other_future.pk, confirmed)
                self.assertNotIn(other_past.pk, history)
                self.assertIn(own_past.pk, history)
                for row in confirmed.values():
                    for occurrence in row["assigned_occurrences"]:
                        self.assertTrue(occurrence["date"])
                        self.assertTrue(occurrence["slot_id"])

    def test_recurring_occurrences_are_worker_specific_not_template_dates(self):
        worker = self.pharmacists[0]
        shift, work_day = self.create_assignment(worker, recurring=True)
        other = self.pharmacists[1]
        slot = shift.slots.get()
        ShiftSlotAssignment.objects.create(
            shift=shift, slot=slot, slot_date=work_day + timedelta(days=1), user=other,
        )
        rows = self.ids(worker, CONFIRMED)
        self.assertIn(shift.pk, rows)
        self.assertEqual([row["date"] for row in rows[shift.pk]["assigned_occurrences"]],
                         [str(work_day)])

    def test_history_payment_preference_filter_preserved(self):
        worker = self.pharmacists[0]
        shift, _ = self.create_assignment(worker, past=True)
        self.assertIn(shift.pk, self.ids(worker, HISTORY))
        # An unsupported matching value cannot expand the worker's history.
        self.assertEqual(self.ids(worker, HISTORY + "?payment_preference=NO_MATCH"), {})

    def test_manager_history_is_scoped_and_does_not_call_personal_worker_history(self):
        from client_profile.models import Organization
        from users.models import OrganizationMembership

        group = Organization.objects.create(name="M4 history scope")
        self.pharmacy.organization = group
        self.pharmacy.save(update_fields=["organization"])
        own_shift, _ = self.create_assignment(self.staff[0], past=True)
        other_shift, _ = self.create_assignment(
            self.pharmacists[0], past=True,
            pharmacy=self.foreign_pharmacy, poster=self.foreign_owner,
        )
        lina = make_user("ORG_STAFF")
        OrganizationMembership.objects.create(user=lina, organization=group, role="ORG_ADMIN")
        grace = make_user("ORG_STAFF")
        member = OrganizationMembership.objects.create(
            user=grace, organization=group, role="REGION_ADMIN",
            admin_level="ROSTER_MANAGER", region="North",
        )
        member.pharmacies.add(self.pharmacy)
        denied = make_user("ORG_STAFF")
        for manager in (self.owner, lina, grace):
            with self.subTest(manager=manager.email):
                response = client_for(manager).get(BASE + "shifts/history/")
                self.assertEqual(response.status_code, 200, getattr(response, "data", None))
                rows = response.data["results"] if isinstance(response.data, dict) else response.data
                self.assertIn(own_shift.pk, {row["id"] for row in rows})
                self.assertNotIn(other_shift.pk, {row["id"] for row in rows})
                self.assertEqual(client_for(manager).get(BASE + HISTORY).status_code, 403)
        for actor in (self.explorer, denied, self.foreign_owner):
            with self.subTest(denied=actor.email):
                response = client_for(actor).get(BASE + "shifts/history/")
                self.assertEqual(response.status_code, 200, getattr(response, "data", None))
                rows = response.data["results"] if isinstance(response.data, dict) else response.data
                self.assertNotIn(own_shift.pk, {row["id"] for row in rows})
