"""M4-01 server authority: real HTTP views, actual organization/roster fixtures.

All are preservation controls. The client, not the server, has the regression.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from attendance.models import AttendanceEvent, AttendanceSession, ProvisionalAttendance, AttendanceCorrection
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from organizations.models import Organization, PharmacyAdmin
from users.models import OrganizationMembership
from shifts.models import ShiftSlotAssignment

BASE = "/api/v1/attendance/manager/"


class M4AttendanceScopeContracts(TestCase):
    def setUp(self):
        self.tom, self.site_a = make_owner_with_pharmacy("M4 Tom A")
        self.nadia, self.site_b = make_owner_with_pharmacy("M4 Nadia B")
        self.other_owner, self.uncovered = make_owner_with_pharmacy("M4 same org C")
        self.org = Organization.objects.create(name="M4 umbrella organization")
        for pharmacy in (self.site_a, self.uncovered):
            pharmacy.organization = self.org
            pharmacy.save(update_fields=["organization"])
        self.lina = make_user("EXPLORER")
        OrganizationMembership.objects.create(
            user=self.lina, organization=self.org, role="ORG_ADMIN",
            admin_level="MANAGER",
        )
        self.grace = make_user("EXPLORER")
        scope = OrganizationMembership.objects.create(
            user=self.grace, organization=self.org, role="REGION_ADMIN",
            admin_level="ROSTER_MANAGER", region="M4 region",
            job_title="Regional roster manager",
        )
        scope.pharmacies.add(self.site_a)
        self.roster_delegate = make_user("PHARMACIST")
        PharmacyAdmin.objects.create(
            user=self.roster_delegate, pharmacy=self.site_a,
            admin_level="ROSTER_MANAGER",
        )
        self.comms_delegate = make_user("PHARMACIST")
        PharmacyAdmin.objects.create(
            user=self.comms_delegate, pharmacy=self.site_a,
            admin_level="COMMUNICATION_MANAGER",
        )
        self.worker = make_user("PHARMACIST")
        self.explorer = make_user("EXPLORER")
        self.allowed = (self.tom, self.lina, self.grace, self.roster_delegate)
        self.denied = (self.nadia, self.comms_delegate, self.worker, self.explorer)

    def review(self):
        now = timezone.now() - timedelta(days=5)
        session = AttendanceSession.objects.create(
            pharmacy=self.site_a, user=self.worker,
            started_at=now, ended_at=now + timedelta(hours=8), is_provisional=True,
        )
        event = AttendanceEvent.objects.create(
            session=session, event_type=AttendanceEvent.EventType.CLOCK_IN,
            source=AttendanceEvent.Source.MOBILE_QR, occurred_at=now,
        )
        review = ProvisionalAttendance.objects.create(
            session=session, cover_type=ProvisionalAttendance.CoverType.UNROSTERED_LOCAL,
        )
        return session, event, review

    def test_all_scoped_managers_can_read_pending_and_timeline(self):
        session, event, review = self.review()
        for user in self.allowed:
            with self.subTest(user=user.email):
                pending = client_for(user).get(BASE + f"pending/?pharmacy_id={self.site_a.pk}")
                self.assertEqual(pending.status_code, 200, pending.data)
                self.assertTrue(any(item["provisional_id"] == review.pk for item in pending.data))
                timeline = client_for(user).get(BASE + f"timeline/{session.pk}/")
                self.assertEqual(timeline.status_code, 200, timeline.data)
                self.assertEqual(timeline.data["pharmacy_id"], self.site_a.pk)
                self.assertIn("pharmacy_timezone", timeline.data)
                self.assertEqual(timeline.data["timeline"][0]["event_id"], event.pk)

    def test_wrong_scope_and_worker_have_no_manager_read_access(self):
        session, _, _ = self.review()
        for user in self.denied:
            with self.subTest(user=user.email):
                self.assertEqual(client_for(user).get(
                    BASE + f"pending/?pharmacy_id={self.site_a.pk}").status_code, 403)
                self.assertEqual(client_for(user).get(
                    BASE + f"timeline/{session.pk}/").status_code, 403)
        for user in (self.grace, self.roster_delegate):
            self.assertEqual(client_for(user).get(
                BASE + f"pending/?pharmacy_id={self.uncovered.pk}").status_code, 403)
        self.assertEqual(client_for().get(
            BASE + f"pending/?pharmacy_id={self.site_a.pk}").status_code, 401)
        self.assertEqual(client_for(self.tom).get(BASE + "pending/").status_code, 400)
        self.assertEqual(client_for(self.tom).get(BASE + "pending/?pharmacy_id=nope").status_code, 400)
        self.assertEqual(client_for(self.tom).get(BASE + "pending/?pharmacy_id=999999").status_code, 404)
        self.assertEqual(client_for(self.tom).get(BASE + "timeline/999999/").status_code, 404)

    def test_manager_mutation_matrix_denies_outsiders_without_writes(self):
        for action in ("correct", "approve", "reject"):
            for user in self.denied:
                session, event, review = self.review()
                request = {
                    "correct": {"event_id": event.pk,
                                "corrected_timestamp": (session.started_at - timedelta(minutes=2)).isoformat(),
                                "reason": "Verified original clock"},
                    "approve": {"provisional_id": review.pk, "reason": "Verified cover"},
                    "reject": {"provisional_id": review.pk, "reason": "Duplicate cover"},
                }[action]
                with self.subTest(action=action, user=user.email):
                    response = client_for(user).post(BASE + action + "/", request, format="json")
                    self.assertEqual(response.status_code, 403, response.data)
                    self.assertFalse(AttendanceCorrection.objects.filter(original_event=event).exists())
                    self.assertFalse(ShiftSlotAssignment.objects.filter(user=self.worker).exists())
                    review.refresh_from_db()
                    self.assertEqual(review.status, ProvisionalAttendance.Status.PENDING)

    def test_authorized_correction_appends_audit_and_preserves_raw_event(self):
        for manager in self.allowed:
            session, event, _ = self.review()
            original = event.occurred_at
            corrected = original - timedelta(minutes=2)
            response = client_for(manager).post(BASE + "correct/", {
                "event_id": event.pk,
                "corrected_timestamp": corrected.isoformat(),
                "reason": "M4 verified clock time",
            }, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data["status"], "CORRECTED")
            event.refresh_from_db()
            self.assertEqual(event.occurred_at, original)
            self.assertTrue(AttendanceCorrection.objects.filter(original_event=event).exists())

    def test_denials_for_invalid_manager_payloads_do_not_mutate(self):
        session, event, review = self.review()
        client = client_for(self.tom)
        self.assertEqual(client.post(BASE + "reject/", {
            "provisional_id": review.pk, "reason": "",
        }, format="json").status_code, 400)
        self.assertEqual(client.post(BASE + "correct/", {
            "event_id": event.pk, "corrected_timestamp": "nonsense", "reason": "M4",
        }, format="json").status_code, 400)
        review.refresh_from_db()
        self.assertEqual(review.status, ProvisionalAttendance.Status.PENDING)
        self.assertFalse(AttendanceCorrection.objects.filter(original_event=event).exists())


    def test_C_all_authorized_managers_approve_and_reject_real_attendance(self):
        """#8: successful service writes for owner, org admin, region, roster delegate."""
        for action in ("approve", "reject"):
            for manager in self.allowed:
                with self.subTest(action=action, manager=manager.email):
                    session, event, review = self.review()
                    original = event.occurred_at
                    reason = "M4 verified attendance before closing"
                    response = client_for(manager).post(
                        BASE + action + "/",
                        {"provisional_id": review.pk, "reason": reason},
                        format="json",
                    )
                    self.assertEqual(response.status_code, 200, response.data)
                    review.refresh_from_db()
                    session.refresh_from_db()
                    event.refresh_from_db()
                    self.assertEqual(event.occurred_at, original, "raw scan evidence is immutable")
                    self.assertEqual(review.decided_by_id, manager.pk)
                    self.assertEqual(review.decision_reason, reason)
                    if action == "approve":
                        self.assertEqual(response.data["status"], "APPROVED")
                        self.assertEqual(review.status, ProvisionalAttendance.Status.APPROVED)
                        self.assertIsNotNone(session.assignment_id)
                        self.assertFalse(session.is_provisional)
                        self.assertEqual(review.backfill_assignment_id, session.assignment_id)
                        self.assertEqual(response.data["assignment_id"], session.assignment_id)
                        self.assertTrue(ShiftSlotAssignment.objects.filter(
                            pk=session.assignment_id, user=self.worker, shift__pharmacy=self.site_a,
                        ).exists())
                        self.assertEqual(response.data["shift_id"], review.backfill_shift_id)
                        # Repeat approval must be idempotent, not backfill twice.
                        repeat = client_for(manager).post(
                            BASE + "approve/",
                            {"provisional_id": review.pk, "reason": reason},
                            format="json",
                        )
                        self.assertEqual(repeat.status_code, 200, repeat.data)
                        self.assertEqual(repeat.data["assignment_id"], session.assignment_id)
                    else:
                        self.assertEqual(response.data["status"], "REJECTED")
                        self.assertEqual(review.status, ProvisionalAttendance.Status.REJECTED)
                        self.assertIsNone(session.assignment_id)
                        self.assertTrue(session.is_provisional)
                        self.assertEqual(response.data["reason"], reason)

    def test_C_staff_only_pharmacy_delegate_is_unrepresentable_in_real_capability_matrix(self):
        """No synthetic STAFF-only pharmacy assignment: backend role levels do not grant it."""
        from access_control.pharmacy_roles import PharmacyAdminPolicy
        from users.org_roles import ROLE_DEFINITIONS, OrgCapability

        for level, capabilities in PharmacyAdminPolicy.CAPABILITY_MATRIX.items():
            with self.subTest(level=level):
                self.assertFalse(
                    PharmacyAdminPolicy.CAPABILITY_MANAGE_STAFF in capabilities
                    and PharmacyAdminPolicy.CAPABILITY_MANAGE_ROSTER not in capabilities
                )
        for role, definition in ROLE_DEFINITIONS.items():
            for level in definition.allowed_admin_levels:
                capabilities = definition.consolidated_capabilities(level)
                with self.subTest(role=role, level=level):
                    self.assertFalse(
                        OrgCapability.MANAGE_STAFF in capabilities
                        and OrgCapability.MANAGE_ROSTER not in capabilities
                    )
        # A communication-only pharmacy delegate is valid and remains denied
        # by the existing full HTTP negative matrix above.
