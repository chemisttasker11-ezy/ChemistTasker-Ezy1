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
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.test import APIClient, APIRequestFactory
from users.models import OrganizationMembership

from attendance_tests.roster_schema import clear_schema, create_schema, drop_schema
from client_profile.attendance_credentials import (
    activate_kiosk_device,
    generate_signed_pharmacy_qr,
    revoke_kiosk_device,
    set_worker_personal_code,
)
from client_profile.attendance_transitions import clock_in
from client_profile.attendance_protocol import (
    calculate_event_hash,
    canonical_event_payload,
    sync_offline_batch,
)
from client_profile.attendance_views import KioskOfflineSyncView, KioskWorkerEnrolView
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
        self.membership = Membership.objects.create(
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
            client_kind="NATIVE_OFFLINE",
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

    def test_qr_and_offline_pin_clock_in_converge_on_one_session(self):
        qr = generate_signed_pharmacy_qr(self.device)
        session, qr_event = clock_in(
            self.worker,
            self.pharmacy,
            signed_qr_token=qr["signed_token"],
        )

        offline_event = self.signed_event(sequence=1, event_type="CLOCK_IN")
        result = sync_offline_batch(self.device, [offline_event], app_version="0.1.1")

        self.assertEqual(result["results"][0]["result"], "accepted")
        self.assertEqual(AttendanceSession.objects.count(), 1)
        self.assertEqual(AttendanceSession.objects.get().id, session.id)
        self.assertEqual(AttendanceEvent.objects.filter(session=session).count(), 1)
        self.assertEqual(qr_event.source, AttendanceEvent.Source.MOBILE_QR)
        self.assertEqual(KioskAttendanceEvent.objects.count(), 1)

    def test_web_device_with_signing_key_is_denied_offline_sync(self):
        self.device.client_kind = "WEB_ONLINE"
        self.device.save(update_fields=["client_kind"])
        event = self.signed_event()

        with self.assertRaises(ValidationError):
            sync_offline_batch(self.device, [event])

        request = APIRequestFactory().post(
            "/attendance/kiosk/offline-sync/",
            {"events": [event]},
            format="json",
            HTTP_X_DEVICE_TOKEN=self.raw_token,
        )
        response = KioskOfflineSyncView.as_view()(request)
        self.assertEqual(response.status_code, 401)

    def test_tampering_is_rejected_without_creating_attendance(self):
        event = self.signed_event()
        event["employee_id"] = self.owner.id

        result = sync_offline_batch(self.device, [event])

        self.assertEqual(result["results"][0]["result"], "rejected")
        self.assertIn("hash", result["results"][0]["reason"].lower())
        self.assertFalse(KioskAttendanceEvent.objects.exists())
        self.assertFalse(AttendanceSession.objects.exists())

    def test_same_event_id_with_different_signed_content_is_rejected(self):
        original = self.signed_event()
        sync_offline_batch(self.device, [original])
        conflicting = self.signed_event(sequence=2, previous_hash=original["event_hash"])
        conflicting["event_id"] = original["event_id"]
        conflicting_hash = calculate_event_hash(canonical_event_payload(conflicting))
        conflicting["event_hash"] = conflicting_hash
        conflicting["signature"] = base64.b64encode(
            self.private_key.sign(conflicting_hash.encode("ascii"))
        ).decode("ascii")

        result = sync_offline_batch(self.device, [conflicting])

        self.assertEqual(result["results"][0]["result"], "rejected")
        self.assertIn("conflicts", result["results"][0]["reason"])
        self.assertEqual(KioskAttendanceEvent.objects.count(), 1)

    def test_worker_enrollment_verifies_pin_without_clocking_attendance(self):
        set_worker_personal_code(self.owner, self.membership, "2468")

        request = APIRequestFactory().post(
            "/attendance/kiosk/workers/enrol/",
            {"identifier": self.worker.email, "pin": "2468"},
            format="json",
            HTTP_X_DEVICE_TOKEN=self.raw_token,
        )
        response = KioskWorkerEnrolView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["worker_id"], self.worker.id)
        self.assertFalse(response.data["is_clocked_in"])
        self.assertFalse(AttendanceSession.objects.exists())

    def test_break_from_kiosk_at_different_pharmacy_is_rejected(self):
        clock_in = self.signed_event()
        sync_offline_batch(self.device, [clock_in])
        other_pharmacy = Pharmacy.objects.create(
            name="Other Pharmacy",
            owner=self.pharmacy.owner,
            organization=self.pharmacy.organization,
            timezone="Australia/Brisbane",
        )
        other_key = Ed25519PrivateKey.generate()
        other_public = other_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        other_device, _ = activate_kiosk_device(
            self.owner,
            other_pharmacy,
            "Other Counter",
            public_signing_key=base64.b64encode(other_public).decode("ascii"),
            client_kind="NATIVE_OFFLINE",
        )
        event = self.signed_event(event_type="BREAK_START")
        event["device_id"] = str(other_device.installation_id)
        event_hash = calculate_event_hash(canonical_event_payload(event))
        event["event_hash"] = event_hash
        event["signature"] = base64.b64encode(
            other_key.sign(event_hash.encode("ascii"))
        ).decode("ascii")

        result = sync_offline_batch(other_device, [event])

        self.assertEqual(result["results"][0]["result"], "rejected")
        self.assertIn("active session pharmacy", result["results"][0]["reason"])

    def test_sequence_gap_is_retained_for_review_without_advancing_ack(self):
        event = self.signed_event(sequence=2, previous_hash="missing")

        result = sync_offline_batch(self.device, [event])

        self.assertEqual(result["results"][0]["result"], "needs_review")
        self.assertEqual(result["acknowledged_through"], 0)
        stored = KioskAttendanceEvent.objects.get()
        self.assertIn("SEQUENCE_GAP", stored.integrity_flags)
        self.assertIsNone(stored.attendance_event)

    def test_valid_event_for_inactive_worker_is_preserved_as_rejected_evidence(self):
        self.worker.is_active = False
        self.worker.save(update_fields=["is_active"])
        event = self.signed_event()

        result = sync_offline_batch(self.device, [event])

        self.assertEqual(result["results"][0]["result"], "rejected")
        stored = KioskAttendanceEvent.objects.get()
        self.assertEqual(stored.submitted_employee_id, self.worker.id)
        self.assertEqual(stored.employee_id, self.worker.id)
        self.assertIsNone(stored.attendance_event)

    def test_revoked_native_device_can_drain_signed_evidence_without_applying_attendance(self):
        event = self.signed_event()
        revoke_kiosk_device(self.owner, self.device)
        response = APIClient().post(
            "/attendance/kiosk/sync/batch/",
            {"events": [event]},
            format="json",
            HTTP_X_DEVICE_TOKEN=self.raw_token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["device_revoked"])
        self.assertEqual(response.data["results"][0]["result"], "needs_review")
        self.assertIn("DEVICE_REVOKED_DRAIN", response.data["results"][0]["integrity_flags"])
        self.assertEqual(KioskAttendanceEvent.objects.count(), 1)
        self.assertEqual(AttendanceSession.objects.count(), 0)
        self.assertEqual(AttendanceEvent.objects.count(), 0)

    def test_native_self_revoke_requires_device_signature_and_revokes_device(self):
        client = APIClient()
        issued_at = timezone.now().isoformat()

        missing_proof = client.post(
            "/attendance/kiosk/revoke-self/",
            {"issued_at": issued_at},
            format="json",
            HTTP_X_DEVICE_TOKEN=self.raw_token,
        )
        self.assertEqual(missing_proof.status_code, 400)
        self.device.refresh_from_db()
        self.assertTrue(self.device.is_active)

        message = (
            f"chemisttasker:kiosk-disconnect:v1|{self.device.installation_id}|{issued_at}"
        ).encode("utf-8")
        proof_signature = base64.b64encode(
            self.private_key.sign(message)
        ).decode("ascii")
        response = client.post(
            "/attendance/kiosk/revoke-self/",
            {"issued_at": issued_at, "proof_signature": proof_signature},
            format="json",
            HTTP_X_DEVICE_TOKEN=self.raw_token,
        )
        self.assertEqual(response.status_code, 200)
        self.device.refresh_from_db()
        self.assertFalse(self.device.is_active)
        self.assertIsNotNone(self.device.revoked_at)

    def test_signed_self_revoke_is_idempotent_after_remote_revocation(self):
        revoke_kiosk_device(self.owner, self.device)
        issued_at = timezone.now().isoformat()
        message = (
            f"chemisttasker:kiosk-disconnect:v1|{self.device.installation_id}|{issued_at}"
        ).encode("utf-8")
        proof_signature = base64.b64encode(
            self.private_key.sign(message)
        ).decode("ascii")

        response = APIClient().post(
            "/attendance/kiosk/revoke-self/",
            {"issued_at": issued_at, "proof_signature": proof_signature},
            format="json",
            HTTP_X_DEVICE_TOKEN=self.raw_token,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "REVOKED")
        self.device.refresh_from_db()
        self.assertFalse(self.device.is_active)

    def test_manager_can_list_and_revoke_kiosk_device(self):
        manager_client = APIClient()
        manager_client.force_authenticate(user=self.owner)

        listing = manager_client.get(
            f"/attendance/manager/kiosk-devices/?pharmacy_id={self.pharmacy.id}"
        )
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data["devices"]), 1)
        self.assertEqual(listing.data["devices"][0]["id"], self.device.id)
        self.assertTrue(listing.data["devices"][0]["is_active"])

        response = manager_client.post(
            "/attendance/manager/kiosk-devices/",
            {"device_id": self.device.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.device.refresh_from_db()
        self.assertFalse(self.device.is_active)
        self.assertIsNotNone(self.device.revoked_at)

    def test_scoped_organization_manager_can_manage_kiosk_devices(self):
        org_admin = User.objects.create(
            email="org-admin@offline.test", role="PHARMACIST", is_active=True
        )
        membership = OrganizationMembership.objects.create(
            user=org_admin,
            organization=self.pharmacy.organization,
            role="CHIEF_ADMIN",
            admin_level="MANAGER",
        )
        membership.pharmacies.add(self.pharmacy)

        client = APIClient()
        client.force_authenticate(user=org_admin)
        listing = client.get(
            f"/attendance/manager/kiosk-devices/?pharmacy_id={self.pharmacy.id}"
        )

        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data["devices"]), 1)

    def test_roster_only_organization_admin_cannot_manage_kiosk_devices(self):
        org_admin = User.objects.create(
            email="roster-admin@offline.test", role="PHARMACIST", is_active=True
        )
        membership = OrganizationMembership.objects.create(
            user=org_admin,
            organization=self.pharmacy.organization,
            role="REGION_ADMIN",
            admin_level="ROSTER_MANAGER",
        )
        membership.pharmacies.add(self.pharmacy)

        client = APIClient()
        client.force_authenticate(user=org_admin)
        listing = client.get(
            f"/attendance/manager/kiosk-devices/?pharmacy_id={self.pharmacy.id}"
        )

        self.assertEqual(listing.status_code, 403)

    def test_unrelated_user_cannot_manage_kiosk_devices(self):
        outsider = User.objects.create(
            email="outsider@offline.test", role="PHARMACIST", is_active=True
        )
        client = APIClient()
        client.force_authenticate(user=outsider)

        listing = client.get(
            f"/attendance/manager/kiosk-devices/?pharmacy_id={self.pharmacy.id}"
        )
        self.assertEqual(listing.status_code, 403)

        revoke = client.post(
            "/attendance/manager/kiosk-devices/",
            {"device_id": self.device.id},
            format="json",
        )
        self.assertEqual(revoke.status_code, 403)
        self.device.refresh_from_db()
        self.assertTrue(self.device.is_active)

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
        self.assertGreater(response.data["max_offline_hours"], 0)
