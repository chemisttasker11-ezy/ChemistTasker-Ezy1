import os
import unittest
from datetime import date, time, timedelta

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")
import django

django.setup()

from django.contrib.auth import get_user_model
from django.db import connection
from rest_framework.test import APIClient

from client_profile.models import (
    LeaveRequest,
    Membership,
    OwnerOnboarding,
    Pharmacy,
    PharmacyAdmin,
    RosterAcknowledgement,
    RosterPeriod,
    RosterPublicationAudit,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
    UserAvailability,
)
from client_profile.roster_services import (
    get_or_create_roster_period,
    publish_roster_period,
)

User = get_user_model()


class RosterAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        models = [
            User,
            OwnerOnboarding,
            Pharmacy,
            PharmacyAdmin,
            Membership,
            Shift,
            ShiftSlot,
            ShiftSlotAssignment,
            LeaveRequest,
            UserAvailability,
            RosterPeriod,
            RosterPublicationAudit,
            RosterAcknowledgement,
        ]
        connection.disable_constraint_checking()
        tables = connection.introspection.table_names()
        with connection.schema_editor() as editor:
            for m in models:
                if m._meta.db_table not in tables:
                    try:
                        editor.create_model(m)
                    except Exception:
                        pass
        connection.disable_constraint_checking()

    @classmethod
    def tearDownClass(cls):
        connection.disable_constraint_checking()
        models = [
            RosterAcknowledgement,
            RosterPublicationAudit,
            RosterPeriod,
            UserAvailability,
            LeaveRequest,
            ShiftSlotAssignment,
            ShiftSlot,
            Shift,
            Membership,
            PharmacyAdmin,
            Pharmacy,
            OwnerOnboarding,
            User,
        ]
        with connection.schema_editor() as editor:
            for m in models:
                try:
                    editor.delete_model(m)
                except Exception:
                    pass
        connection.enable_constraint_checking()
        super().tearDownClass()

    def _clean_tables(self):
        with connection.cursor() as cursor:
            for table in (
                "client_profile_rosteracknowledgement",
                "client_profile_rosterpublicationaudit",
                "client_profile_rosterperiod",
                "client_profile_useravailability",
                "client_profile_leaverequest",
                "client_profile_shiftslotassignment",
                "client_profile_shiftslot",
                "client_profile_shift",
                "client_profile_membership",
                "client_profile_pharmacyadmin",
                "client_profile_pharmacy",
                "client_profile_owneronboarding",
                "users_user",
            ):
                try:
                    cursor.execute(f"DELETE FROM {table};")
                except Exception:
                    pass

    def tearDown(self):
        self._clean_tables()

    def setUp(self):
        self._clean_tables()
        self.client = APIClient()

        self.owner_user = User.objects.create(username="api_owner", email="api_owner@test.com", role="OWNER")
        self.owner_profile = OwnerOnboarding.objects.create(user=self.owner_user, phone_number="0400000002", role="PHARMACIST")
        self.pharmacy = Pharmacy.objects.create(name="Central Roster Pharmacy", owner=self.owner_profile)

        self.pharmacist = User.objects.create(username="api_pharma", email="api_pharma@test.com", role="PHARMACIST")
        self.membership_pharma = Membership.objects.create(
            user=self.pharmacist,
            pharmacy=self.pharmacy,
            role="PHARMACIST",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        self.monday = date(2026, 9, 21)
        self.period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)

        self.shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        self.slot = ShiftSlot.objects.create(shift=self.shift, date=self.monday, start_time=time(9, 0), end_time=time(17, 0))
        self.assignment = ShiftSlotAssignment.objects.create(
            shift=self.shift,
            slot=self.slot,
            slot_date=self.monday,
            user=self.pharmacist,
            is_rostered=True,
        )

    def test_roster_period_detail_endpoint(self):
        self.client.force_authenticate(user=self.owner_user)
        response = self.client.get(f"/attendance/roster/period/?pharmacy_id={self.pharmacy.id}&week_start={self.monday.isoformat()}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["period_id"], self.period.id)
        self.assertEqual(data["status"], "DRAFT")
        self.assertEqual(data["total_assignments"], 1)

    def test_roster_validate_and_publish_endpoints(self):
        self.client.force_authenticate(user=self.owner_user)

        # 1. Validate
        val_res = self.client.post("/attendance/roster/validate/", {"period_id": self.period.id}, format="json")
        self.assertEqual(val_res.status_code, 200)
        self.assertTrue(val_res.json()["is_valid"])

        # 2. Publish
        pub_res = self.client.post("/attendance/roster/publish/", {"period_id": self.period.id, "force_warnings": True}, format="json")
        self.assertEqual(pub_res.status_code, 200)
        self.assertEqual(pub_res.json()["status"], "PUBLISHED")

    def test_worker_published_roster_and_acknowledgement(self):
        # When DRAFT: worker sees 0 shifts
        self.client.force_authenticate(user=self.pharmacist)
        res = self.client.get("/attendance/roster/worker/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["total_shifts"], 0)

        # Publish the period
        publish_roster_period(self.period, self.owner_user)

        # Now worker sees their shift
        res = self.client.get("/attendance/roster/worker/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["total_shifts"], 1)
        self.assertEqual(res.json()["shifts"][0]["assignment_id"], self.assignment.id)

        # Worker acknowledges
        ack_res = self.client.post(
            "/attendance/roster/acknowledge/",
            {"period_id": self.period.id, "notes": "Confirmed schedule"},
            format="json",
        )
        self.assertEqual(ack_res.status_code, 200)
        self.assertEqual(ack_res.json()["status"], "ACKNOWLEDGED")

        # Manager checks acknowledgement breakdown
        mgr_client = APIClient()
        mgr_client.force_authenticate(user=self.owner_user)
        ack_status_res = mgr_client.get(f"/attendance/roster/acknowledgements/{self.period.id}/")
        self.assertEqual(ack_status_res.status_code, 200)
        status_data = ack_status_res.json()
        self.assertEqual(status_data["total_workers"], 1)
        self.assertEqual(status_data["acknowledged_count"], 1)
        self.assertEqual(status_data["pending_count"], 0)
