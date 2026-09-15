"""Test suite for Kiosk Staff Break Station and Start/End actions (Lunch 30m / Tea 10m)."""

from datetime import date, datetime, time, timedelta
import os
import unittest

import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()

from users.models import DeviceToken
from client_profile.models import (
    AttendanceCorrection,
    AttendanceEvent,
    AttendanceSession,
    Chain,
    KioskDevice,
    Membership,
    Notification,
    Organization,
    OwnerOnboarding,
    Pharmacy,
    PharmacyAdmin,
    PharmacyQRSession,
    ProvisionalAttendance,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
    WorkerPIN,
)
from client_profile.attendance_credentials import (
    activate_kiosk_device,
)
from client_profile.attendance_transitions import (
    clock_in,
)

KIOSK_BREAK_SCHEMA_MODELS = (
    User,
    DeviceToken,
    Organization,
    OwnerOnboarding,
    Pharmacy,
    PharmacyAdmin,
    Chain,
    Membership,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
    WorkerPIN,
    KioskDevice,
    PharmacyQRSession,
    AttendanceSession,
    AttendanceEvent,
    ProvisionalAttendance,
    AttendanceCorrection,
    Notification,
)


class KioskStaffBreakTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            for model in KIOSK_BREAK_SCHEMA_MODELS:
                editor.create_model(model)
        connection.disable_constraint_checking()

    @classmethod
    def tearDownClass(cls):
        connection.disable_constraint_checking()
        with connection.schema_editor() as editor:
            for model in reversed(KIOSK_BREAK_SCHEMA_MODELS):
                editor.delete_model(model)
        connection.enable_constraint_checking()
        super().tearDownClass()

    def setUp(self):
        cache.clear()
        self.client = APIClient()

        ts = int(timezone.now().timestamp() * 1000)
        self.owner_user = User.objects.create(
            id=100,
            username=f"owner_{ts}",
            email=f"owner_{ts}@test.com",
            first_name="Owner",
            last_name="Test",
        )
        self.worker1 = User.objects.create(
            id=101,
            username=f"sarah_{ts}",
            email=f"sarah_{ts}@chemisttasker.com",
            first_name="Sarah",
            last_name="Connor",
        )
        self.worker2 = User.objects.create(
            id=102,
            username=f"john_{ts}",
            email=f"john_{ts}@chemisttasker.com",
            first_name="John",
            last_name="Smith",
        )

        self.owner = OwnerOnboarding.objects.create(
            id=100,
            user=self.owner_user,
            phone_number="0400000001",
            role="PHARMACIST",
        )
        self.pharmacy = Pharmacy.objects.create(
            id=100,
            name="Beaumont Hills Counter Kiosk",
            owner=self.owner,
            timezone="Australia/Sydney",
        )

        # Active memberships
        self.mem1 = Membership.objects.create(
            id=101,
            user=self.worker1,
            pharmacy=self.pharmacy,
            role="PHARMACIST",
            employment_type="CASUAL",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )
        self.mem2 = Membership.objects.create(
            id=102,
            user=self.worker2,
            pharmacy=self.pharmacy,
            role="DISPENSER",
            employment_type="CASUAL",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        # Worker 1 has a PIN set
        wpin1 = WorkerPIN.objects.create(membership=self.mem1)
        wpin1.set_pin("1234")
        wpin1.save()

        # Activate kiosk device
        self.device, self.device_token = activate_kiosk_device(
            user=self.owner_user,
            pharmacy=self.pharmacy,
            device_name="Front Counter Tablet",
        )

    def tearDown(self):
        cache.clear()
        with connection.cursor() as cursor:
            for table in (
                "client_profile_notification",
                "client_profile_attendancecorrection",
                "client_profile_attendanceevent",
                "client_profile_provisionalattendance",
                "client_profile_attendancesession",
                "client_profile_pharmacyqrsession",
                "client_profile_workerpin",
                "client_profile_shiftslotassignment",
                "client_profile_shiftslot",
                "client_profile_shift",
                "client_profile_membership",
                "client_profile_kioskdevice",
                "client_profile_pharmacyadmin",
                "client_profile_pharmacy",
                "client_profile_chain",
                "client_profile_organization",
                "client_profile_owneronboarding",
                "users_devicetoken",
                "users_user",
            ):
                try:
                    cursor.execute(f'DELETE FROM "{table}";')
                except Exception:
                    pass

    def test_active_staff_empty_when_no_sessions(self):
        """Kiosk returns empty staff list when nobody is clocked in."""
        res = self.client.post(
            "/attendance/kiosk/active-staff/",
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["staff"], [])

    def test_active_staff_lists_clocked_in_workers(self):
        """Kiosk returns all currently clocked in staff with their status."""
        # Clock in worker1 via kiosk
        clock_in(
            user=self.worker1,
            pharmacy=self.pharmacy,
            kiosk_device=self.device,
            raw_pin="1234",
            user_identifier=self.worker1.email,
        )

        res = self.client.post(
            "/attendance/kiosk/active-staff/",
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["staff"]), 1)
        staff_item = res.data["staff"][0]
        self.assertEqual(staff_item["worker_id"], self.worker1.id)
        self.assertEqual(staff_item["worker_name"], "Sarah Connor")
        self.assertFalse(staff_item["is_on_break"])
        self.assertTrue(staff_item["has_pin"])

    def test_start_lunch_break_30_mins(self):
        """Worker starts 30-minute lunch break on kiosk."""
        clock_in(
            user=self.worker1,
            pharmacy=self.pharmacy,
            kiosk_device=self.device,
            raw_pin="1234",
            user_identifier=self.worker1.email,
        )

        res = self.client.post(
            "/attendance/kiosk/break/",
            {
                "worker_id": self.worker1.id,
                "action": "START",
                "break_type": "LUNCH_30",
                "pin": "1234",
            },
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["action"], "BREAK_START")
        self.assertIn("Lunch Break (30 mins)", res.data["message"])

        # Check active staff now shows on break
        staff_res = self.client.post(
            "/attendance/kiosk/active-staff/",
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )
        staff_item = staff_res.data["staff"][0]
        self.assertTrue(staff_item["is_on_break"])
        self.assertIsNotNone(staff_item["break_started_at"])

    def test_start_tea_break_10_mins(self):
        """Worker starts 10-minute tea break on kiosk."""
        clock_in(
            user=self.worker1,
            pharmacy=self.pharmacy,
            kiosk_device=self.device,
            raw_pin="1234",
            user_identifier=self.worker1.email,
        )

        res = self.client.post(
            "/attendance/kiosk/break/",
            {
                "worker_id": self.worker1.id,
                "action": "START",
                "break_type": "TEA_10",
                "pin": "1234",
            },
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["action"], "BREAK_START")
        self.assertIn("Tea Break (10 mins)", res.data["message"])

    def test_break_action_rejects_invalid_pin(self):
        """Action is rejected when incorrect PIN is supplied."""
        clock_in(
            user=self.worker1,
            pharmacy=self.pharmacy,
            kiosk_device=self.device,
            raw_pin="1234",
            user_identifier=self.worker1.email,
        )

        res = self.client.post(
            "/attendance/kiosk/break/",
            {
                "worker_id": self.worker1.id,
                "action": "START",
                "break_type": "LUNCH_30",
                "pin": "9999",
            },
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Invalid PIN", res.data["error"])

    def test_end_break_resumes_shift(self):
        """Worker on break ends their break and resumes working."""
        clock_in(
            user=self.worker1,
            pharmacy=self.pharmacy,
            kiosk_device=self.device,
            raw_pin="1234",
            user_identifier=self.worker1.email,
        )

        # Start break
        self.client.post(
            "/attendance/kiosk/break/",
            {
                "worker_id": self.worker1.id,
                "action": "START",
                "break_type": "LUNCH_30",
                "pin": "1234",
            },
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )

        # End break
        res = self.client.post(
            "/attendance/kiosk/break/",
            {
                "worker_id": self.worker1.id,
                "action": "END",
                "pin": "1234",
            },
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["action"], "BREAK_END")
        self.assertIn("resumed shift", res.data["message"])

        # Check active staff now shows working
        staff_res = self.client.post(
            "/attendance/kiosk/active-staff/",
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )
        staff_item = staff_res.data["staff"][0]
        self.assertFalse(staff_item["is_on_break"])

    def test_cannot_start_break_while_already_on_break(self):
        """Attempting to start break while already on break is rejected."""
        clock_in(
            user=self.worker1,
            pharmacy=self.pharmacy,
            kiosk_device=self.device,
            raw_pin="1234",
            user_identifier=self.worker1.email,
        )

        self.client.post(
            "/attendance/kiosk/break/",
            {
                "worker_id": self.worker1.id,
                "action": "START",
                "break_type": "LUNCH_30",
                "pin": "1234",
            },
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )

        # Second start break attempt
        res = self.client.post(
            "/attendance/kiosk/break/",
            {
                "worker_id": self.worker1.id,
                "action": "START",
                "break_type": "TEA_10",
                "pin": "1234",
            },
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("already on break", res.data["error"])
