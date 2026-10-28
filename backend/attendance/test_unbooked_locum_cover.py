"""PR-L / E8 / E11, A6-A9 contracts on the migrated PostgreSQL schema.

QR admission is exercised separately from seeded review rows so a missing entry
tier cannot hide manager/payment regressions. No product decisions are mocked.
"""
import base64
from datetime import datetime, timedelta, timezone as datetime_timezone
from unittest.mock import patch
from uuid import uuid4

from django.core import signing
from django.core.cache.backends.locmem import LocMemCache
from django.core.exceptions import ValidationError
from django.db import connection
from django.test import TestCase

from attendance import credentials
from attendance.models import (
    AttendanceEvent, AttendanceSession, KioskAttendanceEvent, ProvisionalAttendance, WorkerPIN,
)
from attendance.protocol import calculate_event_hash
from attendance.test_kiosk_review import KioskReviewFixture
from attendance.transitions import clock_in
from client_profile.characterization_support import (
    client_for, make_assignment, make_owner_with_pharmacy, make_user,
)
from memberships.models import Membership
from onboarding.models import AhpraCheck, PharmacistOnboarding
from onboarding.verification.policy import evaluate
from organizations.models import Chain, Organization, Pharmacy, PharmacyAdmin
from shifts.models import Shift, ShiftSlotAssignment


BASE = "/api/v1/attendance/"
UNBOOKED = "UNBOOKED_LOCUM_COVER"


class LocumCoverFixture(KioskReviewFixture):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if connection.vendor != "postgresql":
            raise RuntimeError("Unbooked locum contracts require core.postgres_test_settings.")

    def setUp(self):
        super().setUp()
        self.now = datetime(2026, 10, 29, 0, 0, tzinfo=datetime_timezone.utc)
        for target, kwargs in (
            ("django.utils.timezone.now", {"side_effect": lambda: self.now}),
            ("attendance.credentials.security_cache", {"new": LocMemCache(str(uuid4()), {})}),
            ("attendance.worker_api.WorkerClockInView.throttle_classes", {"new": []}),
            ("attendance.worker_api.WorkerClockOutView.throttle_classes", {"new": []}),
            ("attendance.kiosk_api.KioskPinClockView.throttle_classes", {"new": []}),
            ("workforce.signals.rebuild_timesheet_task.delay", {}),
            ("users.tasks.send_async_email", {"return_value": True}),
            ("notifications.services.notify_users", {}),
        ):
            patcher = patch(target, **kwargs)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.worker, self.profile = self.verified_worker()
        self.kiosk = client_for()
        self.kiosk.credentials(HTTP_X_DEVICE_TOKEN=self.device.device_token)

    def verified_worker(self):
        worker = make_user("PHARMACIST", is_otp_verified=True, is_mobile_verified=True)
        # Stored False deliberately proves A8 uses the live policy, not the flag.
        profile = PharmacistOnboarding.objects.create(
            user=worker, verified=False, ahpra_verified=True, ahpra_number="PHA0001234567",
            gov_id_verified=True, referee1_confirmed=True, referee2_confirmed=True,
            payment_preference="TFN",
        )
        AhpraCheck.objects.create(
            model_name="PharmacistOnboarding", object_pk=profile.pk,
            registration_number=profile.ahpra_number, reason="onboarding", status="done",
            outcome="verified", completed_at=self.now,
            register_data={"registration_status": "Registered", "registration_type": "General"},
        )
        self.assertTrue(evaluate(profile)["verified"])
        return worker, profile

    def member(self, *, pharmacy=None, **changes):
        return Membership.objects.create(**{
            "user": self.worker, "pharmacy": pharmacy or self.pharmacy,
            "role": "PHARMACIST", "employment_type": "FULL_TIME",
            "status": "ACCEPTED", "is_active": True, **changes,
        })

    def qr(self, device=None):
        return credentials.generate_signed_pharmacy_qr(device or self.device)["signed_token"]

    def scan(self, *, worker=None, token=None, platform="mobile"):
        with self.captureOnCommitCallbacks(execute=True):
            return client_for(worker or self.worker).post(BASE + "worker/clock-in/", {
                "qr_token": token if token is not None else self.qr(),
                "request_id": str(uuid4()),
            }, format="json", HTTP_X_CLIENT_PLATFORM=platform)

    def assert_no_attendance(self, worker=None):
        worker = worker or self.worker
        self.assertFalse(AttendanceSession.objects.filter(user=worker).exists())
        self.assertFalse(ProvisionalAttendance.objects.filter(session__user=worker).exists())
        self.assertFalse(AttendanceEvent.objects.filter(session__user=worker).exists())

    def assert_refused(self, response, worker=None):
        self.assertIn(response.status_code, (400, 401, 403), response.data)
        self.assert_no_attendance(worker)

    def assert_cover(self, response, cover_type=UNBOOKED, *, source_membership=None):
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data["is_provisional"])
        session = AttendanceSession.objects.get(pk=response.data["session_id"])
        self.assertTrue(session.is_provisional)
        self.assertEqual(session.pharmacy_id, self.pharmacy.pk)
        self.assertEqual(session.user_id, self.worker.pk)
        self.assertIsNone(session.assignment_id)
        self.assertEqual(session.source_membership_id, getattr(source_membership, "pk", None))
        review = ProvisionalAttendance.objects.get(session=session)
        self.assertEqual((review.cover_type, review.status), (cover_type, "PENDING"))
        self.assertIsNone(review.backfill_assignment_id)
        self.assertIsNone(review.backfill_shift_id)
        self.assertEqual(session.events.get().event_type, "CLOCK_IN")
        return session

    def seed_review(self):
        # Isolate downstream contracts while the QR tier is absent. Choices are
        # deliberately strings so missing enum support produces assertions, not imports.
        session = AttendanceSession.objects.create(
            user=self.worker, pharmacy=self.pharmacy, is_provisional=True,
            started_at=self.now - timedelta(hours=2), ended_at=self.now - timedelta(hours=1),
        )
        for kind, stamp in (("CLOCK_IN", session.started_at), ("CLOCK_OUT", session.ended_at)):
            AttendanceEvent.objects.create(
                session=session, event_type=kind, occurred_at=stamp, source="MOBILE_QR",
            )
        return ProvisionalAttendance.objects.create(session=session, cover_type=UNBOOKED)

    def decide_review(self, review, *, decision="approve", actor=None):
        with self.captureOnCommitCallbacks(execute=True):
            return client_for(actor or self.manager).post(BASE + f"manager/{decision}/", {
                "provisional_id": review.pk, "reason": "Checked unbooked cover with the destination manager.",
            }, format="json")


class UnbookedLocumAdmissionTests(LocumCoverFixture, TestCase):
    def check_unbooked_scan(self, **kwargs):
        before = (Membership.objects.count(), Shift.objects.count(), ShiftSlotAssignment.objects.count())
        session = self.assert_cover(self.scan(**kwargs))
        self.assertEqual(
            (Membership.objects.count(), Shift.objects.count(), ShiftSlotAssignment.objects.count()), before,
        )
        return session

    def test_mobile_verified_unbooked_pharmacist_starts_provisional_cover(self):
        self.check_unbooked_scan()

    def test_web_verified_unbooked_pharmacist_starts_provisional_cover(self):
        self.check_unbooked_scan(platform="web")

    def test_pending_local_membership_allows_unbooked_cover(self):
        self.member(status="PENDING")
        self.check_unbooked_scan()

    def test_contact_local_membership_allows_unbooked_cover(self):
        self.member(role="CONTACT", employment_type="LOCUM")
        self.check_unbooked_scan()

    def test_unrelated_membership_allows_unbooked_cover(self):
        _, other = make_owner_with_pharmacy("Unrelated employer")
        self.member(pharmacy=other)
        self.check_unbooked_scan()

    def test_unbooked_cover_type_is_a_supported_model_choice(self):
        self.assertIn(UNBOOKED, dict(ProvisionalAttendance._meta.get_field("cover_type").choices))

    def test_inactive_local_membership_blocks_unbooked_cover(self):
        self.member(is_active=False)
        self.assert_refused(self.scan())

    def test_rejected_local_membership_blocks_unbooked_cover(self):
        self.member(status="REJECTED")
        self.assert_refused(self.scan())

    def test_left_local_membership_blocks_unbooked_cover(self):
        self.member(status="LEFT")
        self.assert_refused(self.scan())

    def test_unverified_pharmacist_is_refused(self):
        self.profile.ahpra_verified = False
        self.profile.save(update_fields=["ahpra_verified"])
        self.assertFalse(evaluate(self.profile)["verified"])
        self.assert_refused(self.scan())

    def test_stale_verified_flag_with_suspended_ahpra_is_refused(self):
        self.profile.verified = True
        self.profile.save(update_fields=["verified"])
        AhpraCheck.objects.create(
            model_name="PharmacistOnboarding", object_pk=self.profile.pk,
            registration_number=self.profile.ahpra_number, reason="recheck", status="done",
            outcome="rejected", completed_at=self.now + timedelta(seconds=1),
            register_data={"registration_status": "Suspended", "registration_type": "General"},
        )
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.verified)
        self.assertFalse(evaluate(self.profile)["verified"])
        self.assert_refused(self.scan())

    def test_other_staff_without_favourite_is_refused(self):
        worker = make_user("OTHER_STAFF", is_otp_verified=True, is_mobile_verified=True)
        self.assert_refused(self.scan(worker=worker), worker)

    def test_non_pharmacist_account_with_pharmacist_profile_is_refused(self):
        self.worker.role = "EXPLORER"
        self.worker.save(update_fields=["role"])
        self.assertTrue(evaluate(self.profile)["verified"])
        self.assert_refused(self.scan())

    def test_inactive_account_is_refused(self):
        self.worker.is_active = False
        self.worker.save(update_fields=["is_active"])
        self.assertTrue(evaluate(self.profile)["verified"])
        self.assert_refused(self.scan())

    def test_forged_qr_is_refused(self):
        response = self.scan(token=self.qr() + "forged")
        self.assert_refused(response)
        self.assertIn("TAMPERED_OR_INVALID_SIGNATURE", response.data["error"])

    def test_qr_older_than_thirty_seconds_is_refused(self):
        token = self.qr()
        self.now += timedelta(seconds=31)
        response = self.scan(token=token)
        self.assert_refused(response)
        self.assertIn("QR_EXPIRED", response.data["error"])

    def test_cross_bound_pharmacy_and_qr_code_are_refused_by_api(self):
        payload = signing.loads(self.qr(), salt=credentials.QR_SALT)
        _, other = make_owner_with_pharmacy("Other QR pharmacy")
        payload["pharmacy_id"] = other.pk
        response = self.scan(token=signing.dumps(payload, salt=credentials.QR_SALT))
        self.assert_refused(response)
        self.assertIn("QR_SESSION_NOT_FOUND", response.data["error"])

    def test_other_pharmacy_qr_cannot_authorize_destination_clock_in(self):
        other_owner, other = make_owner_with_pharmacy("Other live QR")
        device, _ = credentials.activate_kiosk_device(other_owner, other, "Other counter")
        # Worker API derives the destination from QR; it has no separate target
        # argument. The service is the actual boundary with an explicit pharmacy.
        with self.assertRaisesMessage(ValidationError, "PHARMACY_CONTEXT_MISMATCH"):
            clock_in(self.worker, self.pharmacy, signed_qr_token=self.qr(device))
        self.assert_no_attendance()

    def test_confirmed_booking_precedes_unbooked_cover(self):
        _, _, assignment = make_assignment(self.pharmacy, self.owner, self.worker, self.now.date())
        response = self.scan()
        self.assertEqual(response.status_code, 201, response.data)
        session = AttendanceSession.objects.get(pk=response.data["session_id"])
        self.assertFalse(session.is_provisional)
        self.assertFalse(response.data["is_provisional"])
        self.assertEqual(session.assignment_id, assignment.pk)
        self.assertFalse(ProvisionalAttendance.objects.filter(session=session).exists())
        self.assertFalse(Membership.objects.filter(user=self.worker).exists())

    def test_local_staff_keeps_unrostered_local_cover_type(self):
        membership = self.member()
        self.assert_cover(self.scan(), "UNROSTERED_LOCAL", source_membership=membership)

    def test_favourite_keeps_favourite_cover_type(self):
        membership = self.member(employment_type="LOCUM")
        self.assert_cover(self.scan(), "FAVOURITE_COVER", source_membership=membership)

    def test_other_staff_favourite_keeps_existing_cover_access(self):
        self.worker = make_user("OTHER_STAFF")
        membership = self.member(role="ASSISTANT", employment_type="SHIFT_HERO")
        self.assert_cover(self.scan(), "FAVOURITE_COVER", source_membership=membership)

    def test_unverified_local_staff_keeps_existing_cover_access(self):
        self.profile.ahpra_verified = False
        self.profile.save(update_fields=["ahpra_verified"])
        self.assertFalse(evaluate(self.profile)["verified"])
        membership = self.member()
        self.assert_cover(self.scan(), "UNROSTERED_LOCAL", source_membership=membership)

    def test_same_owner_sister_keeps_cross_site_chain_cover_type(self):
        sister = Pharmacy.objects.create(name="Same owner sister", owner=self.pharmacy.owner)
        membership = self.member(pharmacy=sister)
        self.assert_cover(self.scan(), "CROSS_SITE_CHAIN", source_membership=membership)

    def test_chain_sister_keeps_cross_site_chain_cover_type(self):
        _, sister = make_owner_with_pharmacy("Chain sister")
        chain = Chain.objects.create(name="Locum test chain", is_active=True)
        chain.pharmacies.add(self.pharmacy, sister)
        membership = self.member(pharmacy=sister)
        self.assert_cover(self.scan(), "CROSS_SITE_CHAIN", source_membership=membership)

    def test_organization_sister_keeps_cross_site_org_cover_type(self):
        _, sister = make_owner_with_pharmacy("Organization sister")
        org = Organization.objects.create(name="Locum test organization")
        for pharmacy in (self.pharmacy, sister):
            pharmacy.organization = org
            pharmacy.save(update_fields=["organization"])
        membership = self.member(pharmacy=sister)
        self.assert_cover(self.scan(), "CROSS_SITE_ORG", source_membership=membership)

    def test_kiosk_pin_cannot_admit_unbooked_pharmacist(self):
        for state in ("none", "pending", "contact"):
            with self.subTest(membership=state):
                if state != "none":
                    membership = self.member(**({"status": "PENDING"} if state == "pending" else {
                        "role": "CONTACT", "employment_type": "LOCUM",
                    }))
                    pin = WorkerPIN(membership=membership, is_enabled=True)
                    pin.set_pin("1357")
                    pin.save()
                response = self.kiosk.post(BASE + "kiosk/pin-clock/", {
                    "identifier": self.worker.email, "pin": "1357", "request_id": str(uuid4()),
                }, format="json")
                self.assert_refused(response)
                if state != "none":
                    membership.delete()

    def test_pin_setup_auto_clock_in_cannot_admit_unbooked_pharmacist(self):
        for state in ("none", "pending", "contact"):
            with self.subTest(membership=state):
                membership = None
                if state != "none":
                    membership = self.member(**({"status": "PENDING"} if state == "pending" else {
                        "role": "CONTACT", "employment_type": "LOCUM",
                    }))
                key = f"{credentials.WORKER_PIN_OTP_CACHE_PREFIX}{self.worker.pk}"
                otp = {"otp": "123456", "worker_id": self.worker.pk,
                       "membership_id": getattr(membership, "pk", None), "pharmacy_id": self.pharmacy.pk,
                       "created_at": self.now.isoformat()}
                credentials.security_cache.set(key, otp, 600)
                with self.captureOnCommitCallbacks(execute=True):
                    response = self.kiosk.post(BASE + "kiosk/worker-pin/setup/", {
                        "identifier": self.worker.email, "verification_code": "123456", "new_pin": "1357",
                        "confirm_opposite": True,
                    }, format="json")
                self.assert_refused(response)
                self.assertFalse(WorkerPIN.objects.filter(membership__user=self.worker).exists())
                self.assertEqual(credentials.security_cache.get(key), otp)
                if membership:
                    membership.delete()

    def test_offline_signed_sync_keeps_unbooked_cover_as_review_evidence(self):
        payload = {
            "protocol_version": 1, "event_id": str(uuid4()),
            "device_id": str(self.device.installation_id), "device_seq": 1,
            "employee_id": self.worker.pk, "shift_id": None, "event_type": "CLOCK_IN",
            "device_timestamp": self.now.isoformat(), "trusted_time_estimate": self.now.isoformat(),
            "monotonic_elapsed_ms": 1000, "boot_session_id": "locum-cover",
            "previous_event_hash": "",
        }
        digest = calculate_event_hash(payload)
        signature = base64.b64encode(self.private_key.sign(digest.encode("ascii"))).decode("ascii")
        with self.captureOnCommitCallbacks(execute=True):
            response = self.kiosk.post(BASE + "kiosk/sync/batch/", {
                "events": [{**payload, "event_hash": digest, "signature": signature}],
            }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["results"][0]["result"], "needs_review")
        evidence = KioskAttendanceEvent.objects.get(event_id=payload["event_id"])
        self.assertEqual(evidence.processing_status, "NEEDS_REVIEW")
        self.assertIn("PIN_MEMBERSHIP_INELIGIBLE", evidence.integrity_flags)
        self.assertIsNone(evidence.attendance_event_id)
        self.assertEqual(evidence.canonical_payload, payload)
        self.assertEqual(evidence.device_signature, signature)
        self.assert_no_attendance()


class UnbookedLocumReviewTests(LocumCoverFixture, TestCase):
    def test_destination_queue_serializes_unbooked_cover_with_null_source(self):
        review = self.seed_review()
        response = self.api.get(BASE + "manager/pending/", {"pharmacy_id": self.pharmacy.pk})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data), 1)
        row = response.data[0]
        self.assertEqual((row["provisional_id"], row["worker_id"], row["cover_type"]),
                         (review.pk, self.worker.pk, UNBOOKED))
        self.assertIsNone(row["source_pharmacy_name"])

    def test_other_pharmacy_manager_cannot_see_or_decide_unbooked_cover(self):
        review = self.seed_review()
        _, other = make_owner_with_pharmacy("Wrong manager's pharmacy")
        manager = make_user("PHARMACIST")
        PharmacyAdmin.objects.create(pharmacy=other, user=manager, admin_level="MANAGER")
        api = client_for(manager)
        denied = api.get(BASE + "manager/pending/", {"pharmacy_id": self.pharmacy.pk})
        self.assertEqual(denied.status_code, 403, denied.data)
        own_queue = api.get(BASE + "manager/pending/", {"pharmacy_id": other.pk})
        self.assertEqual(own_queue.status_code, 200, own_queue.data)
        self.assertEqual(own_queue.data, [])
        for decision in ("approve", "reject"):
            with self.subTest(decision=decision):
                denied = self.decide_review(review, decision=decision, actor=manager)
                self.assertEqual(denied.status_code, 403, denied.data)
                review.refresh_from_db()
                review.session.refresh_from_db()
                self.assertEqual(review.status, "PENDING")
                self.assertIsNone(review.decided_by_id)
                self.assertIsNone(review.session.assignment_id)
                self.assertTrue(review.session.is_provisional)
                self.assertFalse(ShiftSlotAssignment.objects.exists())

    def test_destination_approval_backfills_pharmacist_without_membership(self):
        review = self.seed_review()
        response = self.decide_review(review)
        self.assertEqual(response.status_code, 200, response.data)
        review.refresh_from_db()
        session = AttendanceSession.objects.get(pk=review.session_id)
        assignment = review.backfill_assignment
        self.assertEqual(review.status, "APPROVED")
        self.assertEqual(review.decided_by_id, self.manager.pk)
        self.assertIsNotNone(review.decided_at)
        self.assertEqual(session.assignment_id, assignment.pk)
        self.assertFalse(session.is_provisional)
        self.assertEqual(assignment.user_id, self.worker.pk)
        self.assertEqual(assignment.shift.pharmacy_id, self.pharmacy.pk)
        self.assertEqual(assignment.shift.role_needed, "PHARMACIST")
        self.assertEqual(assignment.shift_id, review.backfill_shift_id)
        self.assertEqual(assignment.slot.start_time.hour, 8)
        self.assertEqual(assignment.slot.end_time.hour, 9)
        self.assertFalse(Membership.objects.filter(user=self.worker).exists())
        replay = self.decide_review(review)
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual(replay.data, response.data)
        self.assertEqual(Shift.objects.count(), 1)
        self.assertEqual(ShiftSlotAssignment.objects.count(), 1)

    def check_payment_terms(self, preference, kind):
        self.profile.payment_preference = preference
        self.profile.save(update_fields=["payment_preference"])
        review = self.seed_review()
        response = self.decide_review(review)
        self.assertEqual(response.status_code, 200, response.data)
        review.refresh_from_db()
        assignment = review.backfill_assignment
        # Incomplete payment profiles must preserve the chosen pathway too,
        # using the same real fallback already used for favourite cover.
        self.assertEqual(assignment.payment_preference_snapshot, preference)
        self.assertEqual(assignment.engagement_kind, kind)
        self.assertEqual(assignment.settlement_channel, "TIMESHEET_ONLY")
        self.assertEqual(assignment.engagement_terms_snapshot["payment_preference"], preference)
        self.assertTrue(assignment.engagement_terms_snapshot["payment_profile_incomplete"])

    def test_approval_applies_worker_tfn_payment_terms(self):
        self.check_payment_terms("TFN", "SHIFT_EMPLOYMENT")

    def test_approval_applies_worker_abn_payment_terms(self):
        self.check_payment_terms("ABN", "INDEPENDENT_CONTRACTOR")


class LocumWorkerStatusTests(LocumCoverFixture, TestCase):
    def assert_worker_status(self, session, cover_type):
        response = client_for(self.worker).get(BASE + "worker/status/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["has_active_session"])
        self.assertEqual(response.data["session_id"], session.pk)
        self.assertEqual(response.data["is_provisional"], session.is_provisional)
        self.assertEqual(response.data.get("cover_type"), cover_type, response.data)
        # The service and public response must both preserve the cover identity.
        from attendance.transitions import get_active_session_status
        summary = get_active_session_status(self.worker)
        self.assertEqual(summary.get("cover_type"), cover_type, summary)

    def test_worker_status_exposes_open_unbooked_cover_type(self):
        session = self.assert_cover(self.scan())
        self.assertIsNone(session.ended_at)
        self.assert_worker_status(session, UNBOOKED)

    def test_worker_status_exposes_open_favourite_cover_type(self):
        membership = self.member(employment_type="LOCUM")
        session = self.assert_cover(self.scan(), "FAVOURITE_COVER", source_membership=membership)
        self.assertIsNone(session.ended_at)
        self.assert_worker_status(session, "FAVOURITE_COVER")

    def test_worker_status_non_provisional_booking_has_no_cover_type(self):
        make_assignment(self.pharmacy, self.owner, self.worker, self.now.date())
        response = self.scan()
        self.assertEqual(response.status_code, 201, response.data)
        session = AttendanceSession.objects.get(pk=response.data["session_id"])
        self.assertFalse(session.is_provisional)
        self.assert_worker_status(session, None)

    def test_worker_status_without_session_has_no_cover_type(self):
        response = client_for(self.worker).get(BASE + "worker/status/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data["has_active_session"])
        self.assertIsNone(response.data.get("cover_type"))
