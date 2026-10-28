"""Section D / E5-E7 / E12 contracts, run with core.postgres_test_settings.

PIN authority requires an active, ACCEPTED, non-CONTACT membership. Booking
authority remains separate: a booked locum uses mobile QR without a membership.
"""
import base64
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.core.cache.backends.locmem import LocMemCache
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import connection
from django.test import TestCase
from django.utils import timezone

from attendance import credentials, kiosk_review
from attendance.eligibility import resolve_attendance_eligibility
from attendance.models import (
    AttendanceEvent, AttendanceSession, KioskAttendanceEvent, KioskAttendanceReview,
    ProvisionalAttendance, WorkerPIN,
)
from attendance.protocol import calculate_event_hash, sync_offline_batch
from attendance.test_kiosk_review import KioskReviewFixture
from client_profile.characterization_support import (
    client_for, make_assignment, make_owner_with_pharmacy, make_user,
)
from memberships.models import Membership
from organizations.models import Chain, Organization, Pharmacy


BASE = "/api/v1/attendance/"
INELIGIBLE = {
    "pending": {"status": "PENDING"},
    "contact": {"role": "CONTACT"},
    "left": {"status": "LEFT"},
    "rejected": {"status": "REJECTED"},
    "inactive": {"is_active": False},
}
PIN_FLAG = "PIN_MEMBERSHIP_INELIGIBLE"


class PinEligibilityTests(KioskReviewFixture, TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if connection.vendor != "postgresql":
            raise RuntimeError("PIN eligibility contracts require PostgreSQL.")

    def setUp(self):
        super().setUp()
        self.cache = LocMemCache(str(uuid4()), {})
        for target, kwargs in (
            ("attendance.credentials.security_cache", {"new": self.cache}),
            ("users.tasks.send_async_email", {"return_value": True}),
            ("notifications.services.notify_users", {}),
            ("attendance.kiosk_api.KioskWorkerEnrolView.throttle_classes", {"new": []}),
            ("attendance.kiosk_api.KioskPinClockView.throttle_classes", {"new": []}),
        ):
            patcher = patch(target, **kwargs)
            mocked = patcher.start()
            self.addCleanup(patcher.stop)
            if target == "users.tasks.send_async_email":
                self.mail = mocked
            elif target == "notifications.services.notify_users":
                self.notify = mocked
        self.kiosk = client_for()
        self.kiosk.credentials(HTTP_X_DEVICE_TOKEN=self.device.device_token)
        self.sites = {"local": self.pharmacy}
        self.sites["owner"] = Pharmacy.objects.create(
            name="Same owner sister", owner=self.pharmacy.owner,
        )
        _, self.sites["chain"] = make_owner_with_pharmacy("Same chain sister")
        chain = Chain.objects.create(name="PIN chain", is_active=True)
        chain.pharmacies.add(self.pharmacy, self.sites["chain"])
        _, self.sites["org"] = make_owner_with_pharmacy("Same organization sister")
        organization = Organization.objects.create(name="PIN organization")
        for pharmacy in (self.pharmacy, self.sites["org"]):
            pharmacy.organization = organization
            pharmacy.save(update_fields=["organization"])

    def member(self, site="local", *, employment_type="FULL_TIME", role="PHARMACIST"):
        return Membership.objects.create(
            user=make_user("PHARMACIST"), pharmacy=self.sites[site], role=role,
            employment_type=employment_type, status="ACCEPTED", is_active=True,
        )

    def change(self, membership, state):
        for field, value in INELIGIBLE[state].items():
            setattr(membership, field, value)
        membership.save(update_fields=list(INELIGIBLE[state]))

    def seed_pin(self, membership, *, enabled=True):
        pin = WorkerPIN(membership=membership, is_enabled=enabled)
        pin.set_pin("1357")
        pin.save()
        return pin

    def otp_key(self, worker):
        return f"{credentials.WORKER_PIN_OTP_CACHE_PREFIX}{worker.pk}"

    def seed_otp(self, membership):
        # Issued while eligible, before the membership changes; not a fake OTP failure.
        self.cache.set(self.otp_key(membership.user), {
            "otp": "123456", "worker_id": membership.user_id,
            "membership_id": membership.pk, "pharmacy_id": self.pharmacy.pk,
            "created_at": timezone.now().isoformat(),
        }, 600)

    def security_snapshot(self, worker):
        key = self.otp_key(worker)
        keys = [key, *(f"{key}:{suffix}" for suffix in ("send", "fail", "claim", "locked"))]
        return (
            list(WorkerPIN.objects.filter(membership__user=worker).order_by("pk").values()),
            self.cache.get_many(keys),
        )

    def refused(self, worker, operation):
        before = self.security_snapshot(worker)
        self.mail.reset_mock()
        self.notify.reset_mock()
        rejected = False
        with self.captureOnCommitCallbacks(execute=True):
            try:
                result = operation()
            except (ValidationError, PermissionDenied):
                rejected = True
            else:
                if hasattr(result, "status_code"):
                    self.assertNotEqual(result.status_code, 500, result.data)
                    rejected = result.status_code in (400, 401, 403, 404)
                elif isinstance(result, tuple):
                    rejected = result[0] is False
        after = self.security_snapshot(worker)
        self.assertEqual(
            (rejected, self.mail.call_count, self.notify.call_count,
             before[0] == after[0], before[1] == after[1]),
            (True, 0, 0, True, True),
            "Eligibility refusal must deny access, send no email/push, and preserve PIN rows and OTP state.",
        )

    def post(self, path, membership, **body):
        return self.kiosk.post(BASE + path, {
            "identifier": membership.user.email, **body,
        }, format="json")

    def matrix(self, sites, operation, *, existing=False, otp=False):
        for site in sites:
            for state in INELIGIBLE:
                with self.subTest(site=site, state=state):
                    membership = self.member(site)
                    if existing:
                        self.seed_pin(membership)
                    if otp:
                        self.seed_otp(membership)
                    self.change(membership, state)
                    self.refused(membership.user, lambda: operation(membership))

    def test_lookup_local_excludes_ineligible_with_and_without_pin(self):
        self.lookup_matrix(("local",))

    def test_lookup_sisters_excludes_ineligible_with_and_without_pin(self):
        self.lookup_matrix(("owner", "chain", "org"))

    def lookup_matrix(self, sites):
        for site in sites:
            for state in INELIGIBLE:
                for require_pin in (False, True):
                    with self.subTest(site=site, state=state, require_pin=require_pin):
                        membership = self.member(site)
                        if require_pin:
                            self.seed_pin(membership)
                        self.change(membership, state)
                        self.assertIsNone(credentials._find_kiosk_candidate_membership(
                            self.device, membership.user.email, require_pin=require_pin,
                        ), "PIN lookup returned an ineligible membership")

    def test_status_local_sends_no_setup_otp_to_ineligible(self):
        self.matrix(("local",), lambda m: self.post("kiosk/worker-pin/status/", m))

    def test_status_sisters_sends_no_setup_otp_to_ineligible(self):
        self.matrix(("owner", "chain", "org"), lambda m: self.post("kiosk/worker-pin/status/", m))

    def test_status_reset_cannot_send_otp_for_existing_ineligible_pin(self):
        self.matrix(self.sites, lambda m: self.post(
            "kiosk/worker-pin/status/", m, reset=True, resend=True,
        ), existing=True)

    def test_status_existing_pin_is_not_ready_after_membership_changes(self):
        self.matrix(self.sites, lambda m: self.post(
            "kiosk/worker-pin/status/", m,
        ), existing=True)

    def test_send_setup_code_helper_refuses_ineligible(self):
        self.matrix(self.sites, lambda m: credentials.send_worker_pin_setup_code(
            self.device, m.user.email,
        ))

    def test_setup_helper_cannot_create_pin_after_membership_changes(self):
        self.matrix(self.sites, lambda m: credentials.setup_worker_kiosk_pin(
            self.device, m.user.email, "123456", "2468",
        ), otp=True)

    def test_setup_helper_cannot_replace_pin_after_membership_changes(self):
        self.matrix(self.sites, lambda m: credentials.setup_worker_kiosk_pin(
            self.device, m.user.email, "123456", "2468",
        ), existing=True, otp=True)

    def test_setup_endpoint_cannot_create_pin_after_membership_changes(self):
        self.matrix(self.sites, lambda m: self.post(
            "kiosk/worker-pin/setup/", m, verification_code="123456", new_pin="2468",
        ), otp=True)

    def test_setup_endpoint_cannot_replace_pin_after_membership_changes(self):
        self.matrix(self.sites, lambda m: self.post(
            "kiosk/worker-pin/setup/", m, verification_code="123456", new_pin="2468",
        ), existing=True, otp=True)

    def test_existing_local_pin_stops_authenticating_after_membership_changes(self):
        self.matrix(("local",), lambda m: credentials.verify_kiosk_worker_pin(
            self.device, m.user.email, "1357",
        ), existing=True)

    def test_existing_sister_pin_stops_authenticating_after_membership_changes(self):
        self.matrix(("owner", "chain", "org"), lambda m: credentials.verify_kiosk_worker_pin(
            self.device, m.user.email, "1357",
        ), existing=True)

    def test_native_online_enrol_refuses_changed_membership(self):
        self.matrix(self.sites, lambda m: self.post(
            "kiosk/workers/enrol/", m, pin="1357",
        ), existing=True)
        self.assertFalse(AttendanceEvent.objects.exists())
        self.assertFalse(AttendanceSession.objects.exists())

    def test_online_pin_clock_out_refuses_changed_membership_and_keeps_session_open(self):
        for site in self.sites:
            for state in INELIGIBLE:
                with self.subTest(site=site, state=state):
                    membership = self.member(site)
                    self.seed_pin(membership)
                    session = AttendanceSession.objects.create(
                        user=membership.user, pharmacy=self.pharmacy, source_membership=membership,
                        started_at=self.now - timedelta(hours=2),
                    )
                    self.change(membership, state)
                    with self.subTest(check="credential refusal"):
                        self.refused(membership.user, lambda: self.post(
                            "kiosk/pin-clock/", membership, pin="1357",
                        ))
                    session.refresh_from_db()
                    self.assertTrue(session.is_open)
                    self.assertFalse(session.events.exists())

    def test_manager_cannot_create_pin_for_ineligible_membership(self):
        self.matrix(("local", "owner"), lambda m: credentials.set_worker_personal_code(
            self.owner, m, "2468",
        ))

    def test_manager_cannot_replace_pin_for_ineligible_membership(self):
        self.matrix(("local", "owner"), lambda m: credentials.set_worker_personal_code(
            self.owner, m, "2468",
        ), existing=True)

    def test_manager_enable_cannot_create_pin_for_ineligible_membership(self):
        self.matrix(("local", "owner"), lambda m: credentials.toggle_worker_personal_code(
            self.owner, m, True,
        ))

    def test_manager_cannot_enable_existing_ineligible_pin(self):
        for state in INELIGIBLE:
            with self.subTest(state=state):
                membership = self.member()
                self.seed_pin(membership, enabled=False)
                self.change(membership, state)
                self.refused(membership.user, lambda: credentials.toggle_worker_personal_code(
                    self.owner, membership, True,
                ))

    def test_self_service_options_exclude_contact_but_keep_accepted_staff(self):
        contact = self.member(role="CONTACT")
        accepted = Membership.objects.create(
            user=contact.user, pharmacy=self.sites["owner"], role="PHARMACIST",
            employment_type="FULL_TIME", status="ACCEPTED", is_active=True,
        )
        response = client_for(contact.user).get(BASE + "worker/pin/update/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([row["id"] for row in response.data["pharmacies"]], [accepted.pharmacy_id])

    def test_self_service_helper_cannot_create_ineligible_pin(self):
        self.matrix(("local",), lambda m: credentials.worker_update_own_pin(
            m.user, "2468", m.pharmacy_id,
        ))

    def test_self_service_helper_cannot_replace_ineligible_pin(self):
        self.matrix(("local",), lambda m: credentials.worker_update_own_pin(
            m.user, "2468", m.pharmacy_id,
        ), existing=True)

    def test_self_service_without_pharmacy_cannot_create_contact_pin(self):
        membership = self.member(role="CONTACT")
        self.refused(membership.user, lambda: credentials.worker_update_own_pin(
            membership.user, "2468",
        ))

    def test_self_service_endpoint_cannot_create_ineligible_pin(self):
        self.matrix(("local",), lambda m: client_for(m.user).post(
            BASE + "worker/pin/update/", {"new_pin": "2468", "pharmacy_id": m.pharmacy_id},
            format="json",
        ))

    def test_self_service_endpoint_cannot_replace_ineligible_pin(self):
        self.matrix(("local",), lambda m: client_for(m.user).post(
            BASE + "worker/pin/update/", {"new_pin": "2468", "pharmacy_id": m.pharmacy_id},
            format="json",
        ), existing=True)

    def signed_event(self, worker, event_type):
        self.sequence += 1
        payload = {
            "protocol_version": 1, "event_id": str(uuid4()),
            "device_id": str(self.device.installation_id), "device_seq": self.sequence,
            "employee_id": worker.pk, "shift_id": None, "event_type": event_type,
            "device_timestamp": self.now.isoformat(), "trusted_time_estimate": self.now.isoformat(),
            "monotonic_elapsed_ms": self.sequence * 1000, "boot_session_id": "pin-eligibility",
            "previous_event_hash": self.previous_hash,
        }
        digest = calculate_event_hash(payload)
        self.previous_hash = digest
        return {
            **payload, "event_hash": digest,
            "signature": base64.b64encode(self.private_key.sign(digest.encode("ascii"))).decode("ascii"),
        }

    def offline_matrix(self, event_type):
        for site in self.sites:
            for state in INELIGIBLE:
                with self.subTest(site=site, state=state):
                    membership = self.member(site)
                    self.seed_pin(membership)
                    session = None
                    if event_type == "CLOCK_OUT":
                        session = AttendanceSession.objects.create(
                            user=membership.user, pharmacy=self.pharmacy, source_membership=membership,
                            started_at=self.now - timedelta(hours=2),
                        )
                        AttendanceEvent.objects.create(
                            session=session, event_type="CLOCK_IN", occurred_at=session.started_at,
                            source="OFFLINE_KIOSK", device=self.device,
                        )
                    signed = self.signed_event(membership.user, event_type)
                    self.change(membership, state)
                    before = self.security_snapshot(membership.user)
                    event_ids = list(AttendanceEvent.objects.values_list("pk", flat=True))
                    session_ids = list(AttendanceSession.objects.values_list("pk", flat=True))
                    self.mail.reset_mock()
                    self.notify.reset_mock()
                    result = sync_offline_batch(self.device, [signed])
                    evidence = KioskAttendanceEvent.objects.get(event_id=signed["event_id"])
                    # All assertions run even when the missing flag is the first failure.
                    with self.subTest(check="retained for review"):
                        self.assertEqual(
                            (result["results"][0]["result"], evidence.processing_status, evidence.integrity_flags),
                            ("needs_review", "NEEDS_REVIEW", [PIN_FLAG]),
                        )
                    with self.subTest(check="no live attendance"):
                        self.assertIsNone(evidence.attendance_event_id)
                        self.assertEqual(list(AttendanceEvent.objects.values_list("pk", flat=True)), event_ids)
                        self.assertEqual(list(AttendanceSession.objects.values_list("pk", flat=True)), session_ids)
                    if session:
                        with self.subTest(check="session stays open"):
                            session.refresh_from_db()
                            self.assertTrue(session.is_open)
                    self.assertEqual(self.security_snapshot(membership.user), before)
                    self.mail.assert_not_called()
                    self.notify.assert_not_called()
                    self.assertEqual(evidence.canonical_payload, {
                        k: v for k, v in signed.items() if k not in ("event_hash", "signature")
                    })
                    self.assertEqual(evidence.device_signature, signed["signature"])

    def test_offline_clock_in_ineligible_membership_is_reviewable_evidence(self):
        self.offline_matrix("CLOCK_IN")

    def test_offline_clock_out_ineligible_membership_leaves_session_open(self):
        self.offline_matrix("CLOCK_OUT")

    def offline_deleted_membership(self, event_type, *, delete_pin_first=False):
        membership = self.member()
        worker = membership.user
        pin = self.seed_pin(membership)
        session = None
        if event_type == "CLOCK_OUT":
            session = AttendanceSession.objects.create(
                user=worker, pharmacy=self.pharmacy, source_membership=membership,
                started_at=self.now - timedelta(hours=2),
            )
            AttendanceEvent.objects.create(
                session=session, event_type="CLOCK_IN", occurred_at=session.started_at,
                source="OFFLINE_KIOSK", device=self.device,
            )
        signed = self.signed_event(worker, event_type)
        pin_pk, membership_pk = pin.pk, membership.pk
        if delete_pin_first:
            pin.delete()
        membership.delete()
        self.assertFalse(Membership.objects.filter(pk=membership_pk).exists())
        self.assertFalse(WorkerPIN.objects.filter(pk=pin_pk).exists())
        event_ids = list(AttendanceEvent.objects.values_list("pk", flat=True))
        session_ids = list(AttendanceSession.objects.values_list("pk", flat=True))

        response = self.kiosk.post(BASE + "kiosk/sync/batch/", {"events": [signed]}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        evidence = KioskAttendanceEvent.objects.get(event_id=signed["event_id"])
        with self.subTest(check="retained for review"):
            self.assertEqual(
                (response.data["results"][0]["result"], evidence.processing_status, evidence.integrity_flags),
                ("needs_review", "NEEDS_REVIEW", [PIN_FLAG]),
            )
        with self.subTest(check="no live attendance"):
            self.assertEqual(
                (evidence.attendance_event_id,
                 list(AttendanceEvent.objects.values_list("pk", flat=True)),
                 list(AttendanceSession.objects.values_list("pk", flat=True))),
                (None, event_ids, session_ids),
            )
        if session:
            with self.subTest(check="session stays open"):
                session.refresh_from_db()
                self.assertTrue(session.is_open)
                self.assertIsNone(session.ended_at)
        self.assertEqual(evidence.canonical_payload, {
            k: v for k, v in signed.items() if k not in ("event_hash", "signature")
        })
        self.assertEqual(evidence.device_signature, signed["signature"])
        self.assertFalse(KioskAttendanceReview.objects.filter(evidence=evidence).exists())

    def test_offline_clock_in_after_membership_cascades_pin_is_reviewable(self):
        self.offline_deleted_membership("CLOCK_IN")

    def test_offline_clock_out_after_membership_cascades_pin_keeps_session_open(self):
        self.offline_deleted_membership("CLOCK_OUT")

    def test_offline_clock_in_after_pin_and_membership_deleted_is_reviewable(self):
        self.offline_deleted_membership("CLOCK_IN", delete_pin_first=True)

    def test_offline_clock_out_after_pin_and_membership_deleted_keeps_session_open(self):
        self.offline_deleted_membership("CLOCK_OUT", delete_pin_first=True)

    def test_offline_pin_flag_allows_review_but_rechecks_clock_in_eligibility(self):
        self.assertNotIn(PIN_FLAG, kiosk_review.BLOCKED_APPROVAL_FLAGS)
        for state in INELIGIBLE:
            with self.subTest(state=state):
                membership = self.member()
                self.seed_pin(membership)
                evidence = self.queue(membership.user, blocked_flag=PIN_FLAG)
                self.change(membership, state)
                self.assertFalse(resolve_attendance_eligibility(membership.user, self.pharmacy).is_eligible)
                # Observe the real clock_in resolver: a generic blocked-flag refusal is insufficient.
                with patch("attendance.transitions.resolve_attendance_eligibility",
                           wraps=resolve_attendance_eligibility) as eligibility:
                    self.refused(membership.user, lambda: self.decide(evidence))
                    eligibility.assert_called_once()
                self.assertFalse(KioskAttendanceReview.objects.filter(evidence=evidence).exists())
                self.assertFalse(AttendanceSession.objects.filter(user=membership.user).exists())
                evidence.refresh_from_db()
                self.assertEqual(evidence.processing_status, "NEEDS_REVIEW")
                self.assertIsNone(evidence.attendance_event_id)
                membership.status, membership.role, membership.is_active = "ACCEPTED", "PHARMACIST", True
                membership.save(update_fields=["status", "role", "is_active"])
                response = self.decide(evidence)
                self.assertEqual(response.status_code, 200, response.data)
                review = KioskAttendanceReview.objects.get(evidence=evidence)
                self.assertEqual(review.decision, "APPROVED")
                self.assertEqual(review.attendance_event.event_type, "CLOCK_IN")
                self.assertEqual(review.attendance_event.session.source_membership_id, membership.pk)

    def eligible_flow(self, membership):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.post("kiosk/worker-pin/status/", membership)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["status"], "NEEDS_SETUP")
            otp = self.cache.get(self.otp_key(membership.user))["otp"]
            self.assertEqual(self.mail.call_count, 1)
            self.assertFalse(WorkerPIN.objects.filter(membership=membership).exists())
            response = self.post("kiosk/worker-pin/setup/", membership,
                                 verification_code=otp, new_pin="1357")
            self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNone(self.cache.get(self.otp_key(membership.user)))
        pin = WorkerPIN.objects.get(membership=membership)
        self.assertTrue(pin.check_pin("1357"))
        self.assertTrue(credentials.verify_kiosk_worker_pin(self.device, membership.user.email, "1357")[0])
        response = self.post("kiosk/workers/enrol/", membership, pin="1357")
        self.assertEqual(response.status_code, 200, response.data)
        session = AttendanceSession.objects.get(user=membership.user)
        self.assertEqual(session.source_membership_id, membership.pk)
        self.assertTrue(session.is_open)
        self.assertEqual(AttendanceEvent.objects.filter(session=session).count(), 1)
        self.mail.reset_mock()
        return session

    def test_positive_accepted_staff_setup_and_authenticate(self):
        self.eligible_flow(self.member())

    def test_positive_accepted_locum_and_shift_hero_favourites(self):
        for employment_type in ("LOCUM", "SHIFT_HERO"):
            with self.subTest(employment_type=employment_type):
                session = self.eligible_flow(self.member(employment_type=employment_type))
                self.assertTrue(session.is_provisional)
                self.assertEqual(session.provisional_review.cover_type, ProvisionalAttendance.CoverType.FAVOURITE_COVER)

    def test_positive_accepted_sisters_same_owner_chain_and_org(self):
        for site in ("owner", "chain", "org"):
            with self.subTest(site=site):
                self.eligible_flow(self.member(site))

    def test_positive_manager_set_enable_and_worker_self_service(self):
        for employment_type in ("FULL_TIME", "LOCUM", "SHIFT_HERO"):
            with self.subTest(employment_type=employment_type):
                membership = self.member(employment_type=employment_type)
                credentials.set_worker_personal_code(self.owner, membership, "1357")
                credentials.toggle_worker_personal_code(self.owner, membership, False)
                pin = credentials.toggle_worker_personal_code(self.owner, membership, True)
                self.assertTrue(pin.check_pin("1357"))
                pin = credentials.worker_update_own_pin(membership.user, "2468", membership.pharmacy_id)
                self.assertTrue(pin.check_pin("2468"))
                api = client_for(membership.user)
                response = api.get(BASE + "worker/pin/update/")
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual([p["id"] for p in response.data["pharmacies"]], [membership.pharmacy_id])
                response = api.post(BASE + "worker/pin/update/", {
                    "new_pin": "3579", "pharmacy_id": membership.pharmacy_id,
                }, format="json")
                self.assertEqual(response.status_code, 200, response.data)
                pin.refresh_from_db()
                self.assertTrue(pin.check_pin("3579"))

    def test_positive_offline_eligible_staff_favourites_and_sisters(self):
        cases = [("local", kind) for kind in ("FULL_TIME", "LOCUM", "SHIFT_HERO")]
        cases += [(site, "FULL_TIME") for site in ("owner", "chain", "org")]
        for site, employment_type in cases:
            with self.subTest(site=site, employment_type=employment_type):
                membership = self.member(site, employment_type=employment_type)
                self.seed_pin(membership)
                for event_type in ("CLOCK_IN", "CLOCK_OUT"):
                    result = sync_offline_batch(self.device, [self.signed_event(membership.user, event_type)])
                    self.assertEqual(result["results"][0]["result"], "accepted", result)
                session = AttendanceSession.objects.get(user=membership.user)
                self.assertFalse(session.is_open)
                self.assertEqual(session.source_membership_id, membership.pk)
                self.assertEqual(session.events.count(), 2)

    def booked_locum(self):
        worker = make_user("PHARMACIST")
        local_now = self.now.astimezone(ZoneInfo(self.pharmacy.timezone)).replace(hour=10, minute=0)
        _, _, assignment = make_assignment(self.pharmacy, self.owner, worker, day=local_now.date())
        return worker, assignment, local_now

    def test_booked_locum_without_membership_cannot_setup_or_use_kiosk_pin(self):
        worker, assignment, stamp = self.booked_locum()
        eligibility = resolve_attendance_eligibility(worker, self.pharmacy, target_time=stamp)
        self.assertTrue(eligibility.is_eligible)
        self.assertEqual(eligibility.assignment, assignment)
        self.assertFalse(Membership.objects.filter(user=worker).exists())
        operations = {
            "send helper": lambda: credentials.send_worker_pin_setup_code(self.device, worker.email),
            "setup helper": lambda: credentials.setup_worker_kiosk_pin(self.device, worker.email, "123456", "1357"),
            "verify helper": lambda: credentials.verify_kiosk_worker_pin(self.device, worker.email, "1357"),
            "self service": lambda: credentials.worker_update_own_pin(worker, "1357", self.pharmacy.pk),
        }
        for path, body in (
            ("kiosk/worker-pin/status/", {}),
            ("kiosk/worker-pin/setup/", {"verification_code": "123456", "new_pin": "1357"}),
            ("kiosk/workers/enrol/", {"pin": "1357"}),
            ("kiosk/pin-clock/", {"pin": "1357"}),
        ):
            operations[path] = lambda path=path, body=body: self.kiosk.post(
                BASE + path, {"identifier": worker.email, **body}, format="json",
            )
        for name, operation in operations.items():
            with self.subTest(path=name), patch("django.utils.timezone.now", return_value=stamp):
                self.refused(worker, operation)
        self.assertFalse(AttendanceSession.objects.filter(user=worker).exists())

    def test_positive_booked_locum_without_membership_mobile_qr_clock_in(self):
        worker, assignment, stamp = self.booked_locum()
        with patch("django.utils.timezone.now", return_value=stamp):
            qr = credentials.generate_signed_pharmacy_qr(self.device)
            response = client_for(worker).post(BASE + "worker/clock-in/", {
                "qr_token": qr["signed_token"],
            }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        session = AttendanceSession.objects.get(user=worker)
        self.assertEqual(session.assignment_id, assignment.pk)
        self.assertFalse(session.is_provisional)
        self.assertIsNone(session.source_membership_id)
        self.assertEqual(session.events.get().source, "MOBILE_QR")
        self.assertFalse(Membership.objects.filter(user=worker).exists())
        self.assertFalse(WorkerPIN.objects.filter(membership__user=worker).exists())
