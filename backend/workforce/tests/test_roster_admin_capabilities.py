"""Capability boundary for the legacy roster viewsets.

A pharmacy Communication Manager has MANAGE_COMMUNICATIONS only.  Legacy roster
querysets must therefore not expose destructive roster/shift endpoints merely
because the user has an active PharmacyAdmin row.
"""
from datetime import date, time, timedelta

from django.test import TestCase

from client_profile.characterization_support import BASE, client_for, make_owner_with_pharmacy, make_user
from organizations.models import PharmacyAdmin
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment


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

    def test_communication_manager_cannot_edit_roster_shift(self):
        response = client_for(self.comms_admin).patch(
            f"{BASE}roster-shifts/{self.shift.id}/",
            {"description": "should not be allowed"},
            format="json",
        )

        self.assertEqual(response.status_code, 404, getattr(response, "data", None))
        self.shift.refresh_from_db()
        self.assertEqual(self.shift.description, "original")

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
