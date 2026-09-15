import os
import unittest
from datetime import date, time, timedelta

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")
import django

django.setup()

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import connection
from rest_framework.test import APIClient

from client_profile.models import (
    AttendanceSession,
    Chain,
    LeaveRequest,
    Membership,
    OwnerOnboarding,
    Pharmacy,
    PharmacyAdmin,
    ProvisionalAttendance,
    RosterAcknowledgement,
    RosterActionAudit,
    RosterPeriod,
    RosterPublicationAudit,
    RosterTemplate,
    Shift,
    ShiftOffer,
    ShiftSlot,
    ShiftSlotAssignment,
    UserAvailability,
    WorkerShiftRequest,
)
from client_profile.roster_worker_actions import (
    approve_cover_replacement,
    approve_direct_swap,
    reject_worker_shift_request,
    release_worker_from_assignment,
    request_direct_swap,
    submit_cover_request,
    validate_worker_replacement_eligibility,
)

User = get_user_model()


class RosterWorkerActionsTests(unittest.TestCase):
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
            ShiftOffer,
            ShiftSlot,
            ShiftSlotAssignment,
            LeaveRequest,
            UserAvailability,
            RosterPeriod,
            RosterPublicationAudit,
            RosterAcknowledgement,
            RosterTemplate,
            WorkerShiftRequest,
            RosterActionAudit,
            AttendanceSession,
            ProvisionalAttendance,
            Chain,
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
            Chain,
            ProvisionalAttendance,
            AttendanceSession,
            RosterActionAudit,
            WorkerShiftRequest,
            RosterTemplate,
            RosterAcknowledgement,
            RosterPublicationAudit,
            RosterPeriod,
            UserAvailability,
            LeaveRequest,
            ShiftSlotAssignment,
            ShiftSlot,
            ShiftOffer,
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
        super().tearDownClass()

    def _clean_tables(self):
        with connection.cursor() as cursor:
            for table in (
                "client_profile_chain_pharmacies",
                "client_profile_chain",
                "client_profile_provisionalattendance",
                "client_profile_attendancesession",
                "client_profile_rosteractionaudit",
                "client_profile_workershiftrequest",
                "client_profile_rostertemplate",
                "client_profile_rosteracknowledgement",
                "client_profile_rosterpublicationaudit",
                "client_profile_rosterperiod",
                "client_profile_useravailability",
                "client_profile_leaverequest",
                "client_profile_shiftslotassignment",
                "client_profile_shiftslot",
                "client_profile_shiftoffer",
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
        # Create users
        self.owner_user = User.objects.create(
            username=f"owner_{id(self)}",
            email=f"owner_{id(self)}@test.com",
            role="OWNER",
        )
        self.owner_profile = OwnerOnboarding.objects.create(
            user=self.owner_user,
            phone_number="0400000002",
            role="PHARMACIST",
        )
        self.pharmacy = Pharmacy.objects.create(
            name=f"Pharmacy {id(self)}",
            owner=self.owner_profile,
        )

        self.manager_user = User.objects.create(
            username=f"manager_{id(self)}",
            email=f"manager_{id(self)}@test.com",
            role="PHARMACIST",
        )
        PharmacyAdmin.objects.create(
            user=self.manager_user,
            pharmacy=self.pharmacy,
            is_active=True,
            admin_level=PharmacyAdmin.AdminLevel.MANAGER,
        )

        self.worker_a = User.objects.create(
            username=f"worker_a_{id(self)}",
            email=f"worker_a_{id(self)}@test.com",
            first_name="Alice",
            last_name="Smith",
            role="PHARMACIST",
        )
        Membership.objects.create(
            user=self.worker_a,
            pharmacy=self.pharmacy,
            role="PHARMACIST",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        self.worker_b = User.objects.create(
            username=f"worker_b_{id(self)}",
            email=f"worker_b_{id(self)}@test.com",
            first_name="Bob",
            last_name="Jones",
            role="PHARMACIST",
        )
        Membership.objects.create(
            user=self.worker_b,
            pharmacy=self.pharmacy,
            role="PHARMACIST",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        self.other_staff_user = User.objects.create(
            username=f"staff_{id(self)}",
            email=f"staff_{id(self)}@test.com",
            first_name="Sam",
            last_name="Staff",
            role="OTHER_STAFF",
        )
        Membership.objects.create(
            user=self.other_staff_user,
            pharmacy=self.pharmacy,
            role="OTHER_STAFF",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        self.unauthorized_user = User.objects.create(
            username=f"random_{id(self)}",
            email=f"random_{id(self)}@test.com",
            role="PHARMACIST",
        )

        # Baseline dates (Next Monday)
        today = date.today()
        self.monday = today + timedelta(days=(7 - today.weekday()))
        self.shift_date = self.monday + timedelta(days=1)  # Tuesday

        # Create Shift & Slot
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="PHARMACIST",
            visibility="FULL_PART_TIME",
            single_user_only=True,
            created_by=self.owner_user,
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift,
            date=self.shift_date,
            start_time=time(9, 0),
            end_time=time(17, 0),
        )
        self.assignment = ShiftSlotAssignment.objects.create(
            shift=self.shift,
            slot=self.slot,
            slot_date=self.shift_date,
            user=self.worker_a,
            is_rostered=True,
        )

    def test_direct_swap_request_preserves_assignment(self):
        """Worker requesting direct swap must keep their assignment intact."""
        req, audit = request_direct_swap(
            assignment=self.assignment,
            requesting_user=self.worker_a,
            target_user=self.worker_b,
            notes="Need to swap Tuesday shift.",
        )

        # Assignment is strictly preserved
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.user, self.worker_a)

        # WorkerShiftRequest created in PENDING status
        self.assertEqual(req.status, "PENDING")
        self.assertEqual(req.requested_by, self.worker_a)
        self.assertEqual(req.shift, self.assignment)

        # Audit created
        self.assertEqual(audit.action_type, RosterActionAudit.ActionType.SWAP_REQUESTED)
        self.assertEqual(audit.performed_by, self.worker_a)
        self.assertEqual(audit.target_user, self.worker_b)

    def test_direct_swap_validation_role_mismatch(self):
        """Worker with incompatible role cannot be requested for direct swap."""
        with self.assertRaises(ValidationError) as ctx:
            request_direct_swap(
                assignment=self.assignment,
                requesting_user=self.worker_a,
                target_user=self.other_staff_user,  # OTHER_STAFF vs required PHARMACIST
            )
        self.assertIn("does not match required role", str(ctx.exception))

    def test_direct_swap_validation_shift_overlap(self):
        """Target worker who already has an overlapping shift cannot be requested."""
        # Create an overlapping assignment for worker_b
        shift2 = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="PHARMACIST",
            visibility="FULL_PART_TIME",
        )
        slot2 = ShiftSlot.objects.create(
            shift=shift2,
            date=self.shift_date,
            start_time=time(14, 0),
            end_time=time(20, 0),
        )
        ShiftSlotAssignment.objects.create(
            shift=shift2,
            slot=slot2,
            slot_date=self.shift_date,
            user=self.worker_b,
            is_rostered=True,
        )

        with self.assertRaises(ValidationError) as ctx:
            request_direct_swap(
                assignment=self.assignment,
                requesting_user=self.worker_a,
                target_user=self.worker_b,
            )
        self.assertIn("overlapping shift", str(ctx.exception))

    def test_direct_swap_validation_approved_leave(self):
        """Target worker on approved leave cannot be requested."""
        LeaveRequest.objects.create(
            user=self.worker_b,
            slot_assignment=self.assignment,  # reference assignment
            leave_type="ANNUAL",
            status="APPROVED",
        )

        with self.assertRaises(ValidationError) as ctx:
            request_direct_swap(
                assignment=self.assignment,
                requesting_user=self.worker_a,
                target_user=self.worker_b,
            )
        self.assertIn("approved leave", str(ctx.exception))

    def test_direct_swap_cannot_swap_with_self(self):
        """Worker cannot request a swap with themselves."""
        with self.assertRaises(ValidationError) as ctx:
            request_direct_swap(
                assignment=self.assignment,
                requesting_user=self.worker_a,
                target_user=self.worker_a,
            )
        self.assertIn("Cannot swap a shift with yourself", str(ctx.exception))

    def test_direct_swap_unauthorized_requester(self):
        """Only the currently assigned worker can request a swap."""
        with self.assertRaises(PermissionDenied):
            request_direct_swap(
                assignment=self.assignment,
                requesting_user=self.worker_b,  # Not assigned to this shift
                target_user=self.worker_a,
            )

    def test_manager_approve_direct_swap_atomic(self):
        """Manager approves swap: atomically transfers assignment to target worker."""
        req, _ = request_direct_swap(
            assignment=self.assignment,
            requesting_user=self.worker_a,
            target_user=self.worker_b,
        )

        updated_assignment = approve_direct_swap(
            request_id_or_obj=req,
            manager=self.manager_user,
        )

        # Assignment transferred to Worker B
        self.assertEqual(updated_assignment.user, self.worker_b)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.user, self.worker_b)

        # Request marked APPROVED
        req.refresh_from_db()
        self.assertEqual(req.status, "APPROVED")
        self.assertEqual(req.resolved_by, self.manager_user)
        self.assertIsNotNone(req.resolved_at)

        # Audit recorded
        audit = RosterActionAudit.objects.filter(
            action_type=RosterActionAudit.ActionType.SWAP_APPROVED
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.performed_by, self.manager_user)
        self.assertEqual(audit.target_user, self.worker_b)
        self.assertEqual(audit.details["previous_user_id"], self.worker_a.id)

    def test_manager_reject_direct_swap(self):
        """Manager rejects swap: original assignment stays with Worker A."""
        req, _ = request_direct_swap(
            assignment=self.assignment,
            requesting_user=self.worker_a,
            target_user=self.worker_b,
        )

        reject_worker_shift_request(
            request_id_or_obj=req,
            manager=self.manager_user,
            reason="Role coverage conflict.",
        )

        # Assignment remains with Worker A
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.user, self.worker_a)

        # Request marked REJECTED
        req.refresh_from_db()
        self.assertEqual(req.status, "REJECTED")

        # Audit recorded
        audit = RosterActionAudit.objects.filter(
            action_type=RosterActionAudit.ActionType.SWAP_REJECTED
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.details["reason"], "Role coverage conflict.")

    def test_cover_request_preserves_assignment(self):
        """Worker submits 'can't work' cover request; assignment must be preserved."""
        req, audit = submit_cover_request(
            assignment=self.assignment,
            requesting_user=self.worker_a,
            reason="Sudden family emergency.",
        )

        # Assignment remains with Worker A
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.user, self.worker_a)

        self.assertEqual(req.status, "PENDING")
        self.assertEqual(audit.action_type, RosterActionAudit.ActionType.COVER_REQUESTED)

    def test_manager_approve_cover_replacement_atomic(self):
        """Manager approves replacement worker: atomically transfers assignment."""
        req, _ = submit_cover_request(
            assignment=self.assignment,
            requesting_user=self.worker_a,
            reason="Unwell.",
        )

        updated_assignment = approve_cover_replacement(
            request_id_or_obj=req,
            replacement_user=self.worker_b,
            manager=self.manager_user,
        )

        self.assertEqual(updated_assignment.user, self.worker_b)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.user, self.worker_b)

        req.refresh_from_db()
        self.assertEqual(req.status, "APPROVED")

        audit = RosterActionAudit.objects.filter(
            action_type=RosterActionAudit.ActionType.COVER_APPROVED
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.target_user, self.worker_b)

    def test_manager_release_worker_reuses_existing_shift_escalation(self):
        """
        Manager releases worker without replacement:
        Deletes the filled assignment and escalates existing shift without duplicate shift creation.
        """
        req, _ = submit_cover_request(
            assignment=self.assignment,
            requesting_user=self.worker_a,
            reason="Cannot work.",
        )

        initial_shift_count = Shift.objects.count()

        escalated_shift = release_worker_from_assignment(
            request_id_or_obj=req,
            manager=self.manager_user,
            escalate_to_visibility="LOCUM_CASUAL",
        )

        # 1. Assignment is deleted
        with self.assertRaises(ShiftSlotAssignment.DoesNotExist):
            self.assignment.refresh_from_db()

        # 2. Existing shift is reused & escalated (NO duplicate marketplace shift)
        self.assertEqual(Shift.objects.count(), initial_shift_count)
        self.assertEqual(escalated_shift.id, self.shift.id)
        self.assertEqual(escalated_shift.visibility, "LOCUM_CASUAL")

        # 3. Request is marked APPROVED and audit logged
        req.refresh_from_db()
        self.assertEqual(req.status, "APPROVED")

        audit = RosterActionAudit.objects.filter(
            action_type=RosterActionAudit.ActionType.WORKER_RELEASED
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.performed_by, self.manager_user)
        self.assertEqual(audit.target_user, self.worker_a)
        self.assertEqual(audit.details["escalate_to_visibility"], "LOCUM_CASUAL")

    def test_unauthorized_user_cannot_approve_or_release(self):
        """Non-manager users are forbidden from approving swaps or releasing workers."""
        req, _ = request_direct_swap(
            assignment=self.assignment,
            requesting_user=self.worker_a,
            target_user=self.worker_b,
        )

        with self.assertRaises(PermissionDenied):
            approve_direct_swap(req, manager=self.unauthorized_user)

        with self.assertRaises(PermissionDenied):
            approve_cover_replacement(req, replacement_user=self.worker_b, manager=self.unauthorized_user)

        with self.assertRaises(PermissionDenied):
            release_worker_from_assignment(req, manager=self.unauthorized_user)

        with self.assertRaises(PermissionDenied):
            reject_worker_shift_request(req, manager=self.unauthorized_user)

    def test_api_endpoints_end_to_end(self):
        """Verify REST API views for worker actions and manager decisions."""
        client = APIClient()

        # 1. Worker A submits swap request via API
        client.force_authenticate(user=self.worker_a)
        resp = client.post(
            "/attendance/roster/worker/swap-request/",
            {"assignment_id": self.assignment.id, "target_user_id": self.worker_b.id, "notes": "Swap via API"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        req_id = resp.data["request_id"]

        # 2. Manager approves swap via API
        client.force_authenticate(user=self.manager_user)
        resp = client.post(
            "/attendance/roster/manager/approve-swap/",
            {"request_id": req_id},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "APPROVED")

        # Verify assignment now belongs to Worker B
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.user, self.worker_b)

        # 3. Worker B submits cover request via API
        client.force_authenticate(user=self.worker_b)
        resp = client.post(
            "/attendance/roster/worker/cover-request/",
            {"assignment_id": self.assignment.id, "reason": "Sick leave"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        cover_req_id = resp.data["request_id"]

        # 4. Manager releases worker via API
        client.force_authenticate(user=self.manager_user)
        resp = client.post(
            "/attendance/roster/manager/release-worker/",
            {"request_id": cover_req_id, "escalate_to_visibility": "LOCUM_CASUAL"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "WORKER_RELEASED")

        # 5. Manager queries audit logs via API
        resp = client.get(f"/attendance/roster/audits/?pharmacy_id={self.pharmacy.id}")
        self.assertEqual(resp.status_code, 200)
        audits = resp.data["audits"]
        self.assertGreaterEqual(len(audits), 3)

    def test_worker_roster_view_excludes_draft_roster_periods(self):
        """
        RosterWorkerViewSet must strictly exclude rostered shifts falling into DRAFT periods,
        while showing published rostered shifts and non-rostered marketplace shifts.
        """
        client = APIClient()
        client.force_authenticate(user=self.worker_a)

        # Period 1: DRAFT period on self.monday
        draft_period = RosterPeriod.objects.create(
            pharmacy=self.pharmacy,
            week_start=self.monday,
            status=RosterPeriod.Status.DRAFT,
        )

        # Period 2: PUBLISHED period on next Monday
        next_monday = self.monday + timedelta(days=7)
        pub_period = RosterPeriod.objects.create(
            pharmacy=self.pharmacy,
            week_start=next_monday,
            status=RosterPeriod.Status.PUBLISHED,
        )

        # Shift in Draft period (is_rostered=True) -> already self.assignment on self.shift_date
        self.assignment.is_rostered = True
        self.assignment.save(update_fields=["is_rostered"])

        # Shift in Published period (is_rostered=True)
        pub_shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="PHARMACIST",
            visibility="FULL_PART_TIME",
            created_by=self.owner_user,
        )
        pub_slot = ShiftSlot.objects.create(
            shift=pub_shift,
            date=next_monday + timedelta(days=1),
            start_time=time(9, 0),
            end_time=time(17, 0),
        )
        pub_assignment = ShiftSlotAssignment.objects.create(
            shift=pub_shift,
            slot=pub_slot,
            slot_date=next_monday + timedelta(days=1),
            user=self.worker_a,
            is_rostered=True,
        )

        # Shift 3: Non-rostered marketplace shift (is_rostered=False)
        market_shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="PHARMACIST",
            visibility="LOCUM_CASUAL",
            created_by=self.owner_user,
        )
        market_slot = ShiftSlot.objects.create(
            shift=market_shift,
            date=self.shift_date,
            start_time=time(10, 0),
            end_time=time(18, 0),
        )
        market_assignment = ShiftSlotAssignment.objects.create(
            shift=market_shift,
            slot=market_slot,
            slot_date=self.shift_date,
            user=self.worker_a,
            is_rostered=False,
        )

        # Call RosterWorkerViewSet API
        resp = client.get(f"/roster-worker/?pharmacy={self.pharmacy.id}")
        self.assertEqual(resp.status_code, 200)

        data_items = resp.data.get("results") if isinstance(resp.data, dict) else resp.data
        returned_assignment_ids = [item["id"] for item in data_items]

        # Draft assignment MUST be excluded!
        self.assertNotIn(self.assignment.id, returned_assignment_ids)

        # Published assignment MUST be included!
        self.assertIn(pub_assignment.id, returned_assignment_ids)

        # Marketplace non-rostered assignment MUST be included!
        self.assertIn(market_assignment.id, returned_assignment_ids)
