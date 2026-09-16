"""Signed offline kiosk protocol, idempotency and integrity regression tests."""

import base64
import os
import unittest
import uuid

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")

import django
django.setup()

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from attendance_tests.roster_schema import clear_schema, create_schema, drop_schema
from client_profile.attendance_credentials import activate_kiosk_device, revoke_kiosk_device
from client_profile.attendance_protocol import calculate_event_hash, sync_offline_batch
from client_profile.models import (
    AttendanceEvent,
    AttendanceSession,
    KioskAttendanceEvent,
    Membership,
    Organization,
    OwnerOnboarding,
    Pharmacy,
)


User = get_user_model()


class KioskOfflineProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        create_schema()

    @classmethod
    def tearDownClass(cls):
        drop_schema()
        super().tearDownClass()

    def setUp(self):
        clear_schema()
        self.owner = User.objects.create(email="owner@offline.test", role="OWNER", is_active=True)
        self.worker = User.objects.create(email="worker@offline.test", role="PHARMACIST", is_active=True)
        organization = Organization.objects.create(name="Offline Group")
        owner_profile = OwnerOnboarding.objects.create(
            user=self.owner,
            phone_number="0400000000",
            role="PHARMACIST",
        )
        self.pharmacy = Pharmacy.objects.create(
            name="Offline Pharmacy",
            owner=owner_profile,
            organization=organization,
            timezone="Australia/Brisbane",
        )
        Membership.objects.create(
            user=self.worker,
            pharmacy=self.pharmacy,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        self.private_key = Ed25519PrivateKey.generate()
        public_bytes = self.private_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        self.device, self.raw_token = activate_kiosk_device(
            self.owner,
            self.pharmacy,
            "Windows Counter",
            public_signing_key=base64.b64encode(public_bytes).decode("ascii"),
            platform="windows",
            app_version="0.1.0",
        )

    def signed_event(self, *, sequence=1, event_type="CLOCK_IN", previous_hash="", employee_id=None):
        now = timezone.now().isoformat()
        event = {
            "protocol_version": 1,
            "event_id": str(uuid.uuid4()),
            "device_id": str(self.device.installation_id),
            "device_seq": sequence,
            "employee_id": employee_id or self.worker.id,
            "shift_id": None,
            "event_type": event_type,
            "device_timestamp": now,
            "trusted_time_estimate": now,
            "monotonic_elapsed_ms": sequence * 1000,
            "boot_session_id": "boot-a",
            "previous_event_hash": previous_hash,
        }
        event_hash = calculate_event_hash(event)
        event["event_hash"] = event_hash
        event["signature"] = base64.b64encode(
            self.private_key.sign(event_hash.encode("ascii"))
        ).decode("ascii")
        return event

    def test_signed_batch_applies_existing_business_rules_and_is_idempotent(self):
        event = self.signed_event()
        first = sync_offline_batch(self.device, [event], app_version="0.1.1")

        self.assertEqual(first["acknowledged_through"], 1)
        self.assertEqual(first["results"][0]["result"], "accepted")
        self.assertEqual(KioskAttendanceEvent.objects.count(), 1)
        self.assertEqual(AttendanceSession.objects.count(), 1)
        self.assertEqual(
            AttendanceEvent.objects.get().source,
            AttendanceEvent.Source.OFFLINE_KIOSK,
        )

        second = sync_offline_batch(self.device, [event])
        self.assertEqual(second["results"][0]["result"], "already_received")
        self.assertEqual(KioskAttendanceEvent.objects.count(), 1)
        self.assertEqual(AttendanceSession.objects.count(), 1)

    def test_tampering_is_rejected_without_creating_attendance(self):
        event = self.signed_event()
        event["employee_id"] = self.owner.id

        result = sync_offline_batch(self.device, [event])

        self.assertEqual(result["results"][0]["result"], "rejected")
        self.assertIn("hash", result["results"][0]["reason"].lower())
        self.assertFalse(KioskAttendanceEvent.objects.exists())
        self.assertFalse(AttendanceSession.objects.exists())

    def test_sequence_gap_is_retained_for_review_without_advancing_ack(self):
        event = self.signed_event(sequence=2, previous_hash="missing")

        result = sync_offline_batch(self.device, [event])

        self.assertEqual(result["results"][0]["result"], "needs_review")
        self.assertEqual(result["acknowledged_through"], 0)
        stored = KioskAttendanceEvent.objects.get()
        self.assertIn("SEQUENCE_GAP", stored.integrity_flags)
        self.assertIsNone(stored.attendance_event)

    def test_revoked_device_cannot_use_batch_endpoint(self):
        revoke_kiosk_device(self.owner, self.device)
        response = APIClient().post(
            "/attendance/kiosk/sync/batch/",
            {"events": [self.signed_event()]},
            format="json",
            HTTP_X_DEVICE_TOKEN=self.raw_token,
        )
        self.assertEqual(response.status_code, 401)

    def test_batch_endpoint_returns_contiguous_receipt(self):
        response = APIClient().post(
            "/attendance/kiosk/sync/batch/",
            {"events": [self.signed_event()], "app_version": "0.1.2"},
            format="json",
            HTTP_X_DEVICE_TOKEN=self.raw_token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["acknowledged_through"], 1)
        self.assertEqual(response.data["results"][0]["result"], "accepted")
