"""Capability boundary for the legacy roster viewsets.

A pharmacy Communication Manager has MANAGE_COMMUNICATIONS only.  Legacy roster
querysets must therefore not expose destructive roster/shift endpoints merely
because the user has an active PharmacyAdmin row.
"""
from datetime import date, time, timedelta

from django.test import TestCase

from client_profile.characterization_support import BASE, client_for, make_owner_with_pharmacy, make_user
from organizations.models import Organization, PharmacyAdmin
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment
from users.models import OrganizationMembership


class LegacyRosterAdminCapabilityTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Roster Capability")
        self.worker = make_user("PHARMACIST")
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            created_by=self.owner,
            role_needed="PHARMACIST",
            employment_type="LOCUM",
            visibility="FULL_PART_TIME",
            description="original",
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift,
            date=date.today() + timedelta(days=7),
            start_time=time(9, 0),
            end_time=time(17, 0),
        )
        self.assignment = ShiftSlotAssignment.objects.create(
            shift=self.shift,
            slot=self.slot,
            slot_date=self.slot.date,
            user=self.worker,
            is_rostered=True,
        )

        self.comms_admin = make_user("OWNER")
        PharmacyAdmin.objects.create(
            user=self.comms_admin,
            pharmacy=self.pharmacy,
            admin_level=PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER,
            is_active=True,
        )

        self.roster_admin = make_user("OWNER")
        PharmacyAdmin.objects.create(
            user=self.roster_admin,
            pharmacy=self.pharmacy,
            admin_level=PharmacyAdmin.AdminLevel.ROSTER_MANAGER,
            is_active=True,
        )

    def test_communication_manager_cannot_delete_roster_assignment(self):
        response = client_for(self.comms_admin).delete(
            f"{BASE}roster-owner/{self.assignment.id}/"
        )

        self.assertEqual(response.status_code, 404, getattr(response, "data", None))
        self.assertTrue(ShiftSlotAssignment.objects.filter(pk=self.assignment.pk).exists())

    def test_region_admin_cannot_create_shift_outside_roster_queryset(self):
        self.pharmacy.organization = Organization.objects.create(name="Roster region", slug="roster-region")
        self.pharmacy.save(update_fields=["organization"])
        region_admin = make_user("ORG_STAFF")
        membership = OrganizationMembership.objects.create(
            user=region_admin, organization=self.pharmacy.organization, role="REGION_ADMIN", admin_level="MANAGER",
        )
        membership.pharmacies.add(self.pharmacy)
        response = client_for(region_admin).post(f"{BASE}roster-shifts/", {
            "pharmacy": self.pharmacy.pk, "role_needed": "PHARMACIST", "employment_type": "LOCUM",
            "visibility": "FULL_PART_TIME", "slots": [],
        }, format="json")
        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(Shift.objects.count(), 1)

    def test_roster_manager_can_create_and_retrieve_shift(self):
        client = client_for(self.roster_admin)
        response = client.post(f"{BASE}roster-shifts/", {
            "pharmacy": self.pharmacy.pk, "role_needed": "PHARMACIST", "employment_type": "LOCUM",
            "visibility": "FULL_PART_TIME", "slots": [],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(client.get(f"{BASE}roster-shifts/{response.data['id']}/").status_code, 200)

    def test_communication_manager_cannot_edit_roster_shift(self):
        response = client_for(self.comms_admin).patch(
            f"{BASE}roster-shifts/{self.shift.id}/",
            {"description": "should not be allowed"},
            format="json",
        )

        self.assertEqual(response.status_code, 404, getattr(response, "data", None))
        self.shift.refresh_from_db()
        self.assertEqual(self.shift.description, "original")

    def test_outsider_cannot_post_roster_assignment(self):
        outsider = make_user("PHARMACIST")
        slot = ShiftSlot.objects.create(
            shift=self.shift, date=self.slot.date + timedelta(days=1), start_time=time(9), end_time=time(17),
        )
        response = client_for(outsider).post(f"{BASE}roster-owner/", {
            "shift": self.shift.pk, "slot": slot.pk, "slot_date": str(slot.date), "user": outsider.pk,
        }, format="json")
        self.assertEqual(response.status_code, 405, response.data)
        self.assertEqual(ShiftSlotAssignment.objects.count(), 1)

    def test_owner_cannot_repoint_assignment_shift(self):
        foreign_owner, foreign_pharmacy = make_owner_with_pharmacy("Foreign roster")
        foreign_shift = Shift.objects.create(
            pharmacy=foreign_pharmacy, created_by=foreign_owner, role_needed="PHARMACIST", employment_type="LOCUM",
        )
        response = client_for(self.owner).patch(
            f"{BASE}roster-owner/{self.assignment.pk}/", {"shift": foreign_shift.pk}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.shift_id, self.shift.pk)

    def test_owner_cannot_repoint_assignment_slot(self):
        slot = ShiftSlot.objects.create(
            shift=self.shift, date=self.slot.date, start_time=time(17), end_time=time(19),
        )
        response = client_for(self.owner).patch(
            f"{BASE}roster-owner/{self.assignment.pk}/", {"slot": slot.pk}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.slot_id, self.slot.pk)

    def test_owner_can_edit_assignment_with_unchanged_shift_and_slot(self):
        response = client_for(self.owner).patch(f"{BASE}roster-owner/{self.assignment.pk}/", {
            "shift": self.shift.pk, "slot": self.slot.pk, "unit_rate": "95.00",
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assignment.refresh_from_db()
        self.assertEqual(str(self.assignment.unit_rate), "95.00")

    def test_roster_manager_keeps_roster_mutation_access(self):
        client = client_for(self.roster_admin)

        response = client.patch(
            f"{BASE}roster-shifts/{self.shift.id}/",
            {"description": "allowed"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.shift.refresh_from_db()
        self.assertEqual(self.shift.description, "allowed")

        response = client.delete(f"{BASE}roster-owner/{self.assignment.id}/")
        self.assertEqual(response.status_code, 204, getattr(response, "data", None))
        self.assertFalse(ShiftSlotAssignment.objects.filter(pk=self.assignment.pk).exists())


class RosterTenantIsolationContracts(TestCase):
    def setUp(self):
        self.owner_a, self.a = make_owner_with_pharmacy("PR200 A")
        self.owner_b, self.b = make_owner_with_pharmacy("PR200 B")
        self.outsider = make_user("PHARMACIST")
        self.day = date.today() + timedelta(days=21)

    def roster_payload(self):
        return {
            "pharmacy": self.b.pk, "role_needed": "PHARMACIST",
            "employment_type": "LOCUM", "visibility": "LOCUM_CASUAL",
            "rate_type": "FLEXIBLE", "description": "PR200 roster",
            "slots": [{
                "date": self.day.isoformat(), "start_time": "09:00",
                "end_time": "17:00", "rate": "70.00",
            }],
        }

    def test_b36_roster_positive_control(self):
        response = client_for(self.owner_b).post(
            "/api/v1/roster-shifts/", self.roster_payload(), format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)

    def test_b36_roster_post_denies_unmanaged_pharmacy(self):
        client = client_for(self.outsider)
        client.raise_request_exception = False
        response = client.post(
            "/api/v1/roster-shifts/", self.roster_payload(), format="json",
        )
        self.assertIn(response.status_code, (403, 404), response.data)
        self.assertFalse(
            Shift.objects.filter(pharmacy=self.b, created_by=self.outsider).exists()
        )
