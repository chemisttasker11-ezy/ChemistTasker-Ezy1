"""
Isolated API integration tests for Attendance REST endpoints.

Runs strictly in-memory using disposable SQLite under attendance_tests.settings.
Does not touch core.settings, unapplied migrations, or the configured database.
"""
import os
import unittest
from datetime import timedelta
import zoneinfo

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")

import django
django.setup()

from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from client_profile.attendance_credentials import (
    activate_kiosk_device,
    set_worker_personal_code,
)
from client_profile.models import (
    AttendanceCorrection,
    AttendanceEvent,
    AttendanceSession,
    Chain,
    KioskDevice,
    Membership,
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

User = get_user_model()

API_SCHEMA_MODELS = (
    User,
    Organization,
    Pharmacy,
    Chain,
    OwnerOnboarding,
    Membership,
    PharmacyAdmin,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
    KioskDevice,
    PharmacyQRSession,
    WorkerPIN,
    AttendanceSession,
    AttendanceEvent,
    ProvisionalAttendance,
    AttendanceCorrection,
)


class AttendanceAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            for model in API_SCHEMA_MODELS:
                try:
                    editor.create_model(model)
                except Exception:
                    pass
        connection.disable_constraint_checking()

    @classmethod
    def tearDownClass(cls):
        connection.disable_constraint_checking()
        with connection.schema_editor() as editor:
            for model in reversed(API_SCHEMA_MODELS):
                try:
                    editor.delete_model(model)
                except Exception:
                    pass
        connection.enable_constraint_checking()
        super().tearDownClass()

    def setUp(self):
        self.tearDown()
        self.client = APIClient()
        self.tz_sydney = zoneinfo.ZoneInfo("Australia/Sydney")

        self.owner_user = User.objects.create(
            id=1,
            username="owner_api",
            email="owner_api@test.com",
            first_name="Alice",
            last_name="Owner",
        )
        self.worker_user = User.objects.create(
            id=2,
            username="worker_api",
            email="worker_api@test.com",
            first_name="Bob",
            last_name="Worker",
        )
        self.other_user = User.objects.create(
            id=3,
            username="other_api",
            email="other_api@test.com",
            first_name="Charlie",
            last_name="Other",
        )

        self.owner = OwnerOnboarding.objects.create(
            id=1,
            user=self.owner_user,
            phone_number="0400000001",
            role="PHARMACIST",
        )

        self.pharmacy = Pharmacy.objects.create(
            id=1,
            name="API Test Pharmacy",
            owner=self.owner,
            timezone="Australia/Sydney",
        )


        # Worker local membership
        self.membership = Membership.objects.create(
            id=1,
            user=self.worker_user,
            pharmacy=self.pharmacy,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )


    def tearDown(self):
        connection.disable_constraint_checking()
        with connection.cursor() as cursor:
            for table in (
                "client_profile_attendancecorrection",
                "client_profile_provisionalattendance",
                "client_profile_attendanceevent",
                "client_profile_attendancesession",
                "client_profile_workerpin",
                "client_profile_pharmacyqrsession",
                "client_profile_kioskdevice",
                "client_profile_shiftslotassignment",
                "client_profile_shiftslot",
                "client_profile_shift",
                "client_profile_membership",
                "client_profile_chain_pharmacies",
                "client_profile_chain",
                "client_profile_pharmacyadmin",
                "client_profile_pharmacy",
                "client_profile_owneronboarding",
                "client_profile_organization",
                "users_user",
            ):
                try:
                    cursor.execute(f"DELETE FROM {table};")
                except Exception:
                    pass


    def test_kiosk_activate_and_qr_flow(self):
        # 1. Unauthorized user cannot activate
        other_client = APIClient()
        other_client.force_authenticate(user=self.other_user)
        resp = other_client.post("/attendance/kiosk/activate/", {
            "pharmacy_id": self.pharmacy.id,
            "device_name": "Front Counter iPad",
        })
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Owner activates kiosk
        owner_client = APIClient()
        owner_client.force_authenticate(user=self.owner_user)
        resp = owner_client.post("/attendance/kiosk/activate/", {
            "pharmacy_id": self.pharmacy.id,
            "device_name": "Front Counter iPad",
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        device_token = resp.data["device_token"]
        self.assertTrue(device_token.startswith("ctk_kiosk_"))

        # 3. Kiosk retrieves dynamic QR code using device token
        kiosk_client = APIClient()
        qr_resp = kiosk_client.post(
            "/attendance/kiosk/qr/",
            headers={"X-Device-Token": device_token},
        )
        self.assertEqual(qr_resp.status_code, status.HTTP_200_OK)
        self.assertIn("qr_token", qr_resp.data)
        self.assertIn("expires_at", qr_resp.data)

        # 4. Revoked kiosk device cannot retrieve QR
        device = KioskDevice.objects.get(id=resp.data["device_id"])
        device.is_active = False
        device.save()

        revoked_resp = kiosk_client.post(
            "/attendance/kiosk/qr/",
            headers={"X-Device-Token": device_token},
        )
        self.assertEqual(revoked_resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_kiosk_pin_clock_in_and_out(self):
        # Activate kiosk
        device, raw_token = activate_kiosk_device(self.owner_user, self.pharmacy, "Pin Pad")
        set_worker_personal_code(self.owner_user, self.membership, "1234")

        kiosk_client = APIClient()

        # 1. Invalid PIN attempt
        fail_resp = kiosk_client.post(
            "/attendance/kiosk/pin-clock/",
            {"device_token": raw_token, "identifier": self.worker_user.email, "pin": "9999"},
        )
        self.assertEqual(fail_resp.status_code, status.HTTP_400_BAD_REQUEST)

        # 2. Clock in with valid PIN
        clock_in_resp = kiosk_client.post(
            "/attendance/kiosk/pin-clock/",
            {"device_token": raw_token, "identifier": self.worker_user.email, "pin": "1234"},
        )
        self.assertEqual(clock_in_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(clock_in_resp.data["action"], "CLOCKED_IN")
        self.assertTrue(clock_in_resp.data["is_provisional"])

        # 3. Clock out with valid PIN
        clock_out_resp = kiosk_client.post(
            "/attendance/kiosk/pin-clock/",
            {"device_token": raw_token, "identifier": self.worker_user.email, "pin": "1234"},
        )
        self.assertEqual(clock_out_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(clock_out_resp.data["action"], "CLOCKED_OUT")
        self.assertIsNotNone(clock_out_resp.data["ended_at"])

    def test_worker_mobile_qr_and_break_lifecycle(self):
        # Setup kiosk and generate active QR
        device, raw_token = activate_kiosk_device(self.owner_user, self.pharmacy, "Kiosk 1")
        kiosk_client = APIClient()
        qr_resp = kiosk_client.post(
            "/attendance/kiosk/qr/",
            headers={"X-Device-Token": raw_token},
        )
        qr_token = qr_resp.data["qr_token"]

        # Worker authenticates on mobile
        worker_client = APIClient()
        worker_client.force_authenticate(user=self.worker_user)

        # 1. Initial status -> not active
        status_resp = worker_client.get("/attendance/worker/status/")
        self.assertEqual(status_resp.status_code, status.HTTP_200_OK)
        self.assertFalse(status_resp.data["has_active_session"])

        # 2. Clock in using scanned QR
        clock_in_resp = worker_client.post("/attendance/worker/clock-in/", {"qr_token": qr_token})
        self.assertEqual(clock_in_resp.status_code, status.HTTP_201_CREATED)


        self.assertEqual(clock_in_resp.data["status"], "CLOCKED_IN")

        # 3. Active status reflects clock-in
        status_resp = worker_client.get("/attendance/worker/status/")
        self.assertTrue(status_resp.data["has_active_session"])
        self.assertFalse(status_resp.data["is_on_break"])

        # 4. Start Break
        break_resp = worker_client.post("/attendance/worker/break-start/")
        self.assertEqual(break_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(break_resp.data["status"], "ON_BREAK")

        # 5. Status reflects ON_BREAK
        status_resp = worker_client.get("/attendance/worker/status/")
        self.assertTrue(status_resp.data["is_on_break"])

        # 6. End Break
        end_break_resp = worker_client.post("/attendance/worker/break-end/")
        self.assertEqual(end_break_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(end_break_resp.data["status"], "WORKING")

        # 7. Clock Out
        clock_out_resp = worker_client.post("/attendance/worker/clock-out/", {"qr_token": qr_token})
        self.assertEqual(clock_out_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(clock_out_resp.data["status"], "CLOCKED_OUT")

    def test_manager_review_approve_and_corrections_api(self):
        # 1. Create a provisional attendance
        device, raw_token = activate_kiosk_device(self.owner_user, self.pharmacy, "Kiosk")
        kiosk_client = APIClient()
        qr_resp = kiosk_client.post(
            "/attendance/kiosk/qr/",
            headers={"X-Device-Token": raw_token},
        )
        worker_client = APIClient()
        worker_client.force_authenticate(user=self.worker_user)
        worker_client.post("/attendance/worker/clock-in/", {"qr_token": qr_resp.data["qr_token"]})
        worker_client.post("/attendance/worker/clock-out/", {"qr_token": qr_resp.data["qr_token"]})

        # 2. Manager queries pending attendances
        mgr_client = APIClient()
        mgr_client.force_authenticate(user=self.owner_user)
        pending_resp = mgr_client.get(f"/attendance/manager/pending/?pharmacy_id={self.pharmacy.id}")
        self.assertEqual(pending_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(pending_resp.data), 1)
        provisional_id = pending_resp.data[0]["provisional_id"]
        session_id = pending_resp.data[0]["session_id"]

        # 3. Manager views session timeline
        timeline_resp = mgr_client.get(f"/attendance/manager/timeline/{session_id}/")
        self.assertEqual(timeline_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(timeline_resp.data["session_id"], session_id)

        # 4. Manager submits a manual correction
        session = AttendanceSession.objects.get(id=session_id)
        first_event = session.events.first()
        corrected_time = (first_event.occurred_at + timedelta(minutes=15)).isoformat()
        corr_resp = mgr_client.post("/attendance/manager/correct/", {
            "event_id": first_event.id,
            "corrected_timestamp": corrected_time,
            "reason": "Late clock-in adjustment confirmed via CCTV",
        })
        self.assertEqual(corr_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(corr_resp.data["status"], "CORRECTED")

        # 5. Manager approves provisional attendance
        approve_resp = mgr_client.post("/attendance/manager/approve/", {
            "provisional_id": provisional_id,
            "reason": "Approved cover shift",
        })
        self.assertEqual(approve_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(approve_resp.data["status"], "APPROVED")
        self.assertIn("assignment_id", approve_resp.data)

        # Pending queue is now empty
        pending_resp2 = mgr_client.get(f"/attendance/manager/pending/?pharmacy_id={self.pharmacy.id}")
        self.assertEqual(len(pending_resp2.data), 0)



if __name__ == "__main__":
    unittest.main()
