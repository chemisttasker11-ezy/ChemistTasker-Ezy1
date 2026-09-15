"""
Comprehensive tests for Deterministic Worker Roster Actions (Checkpoint 3):
1. Request-specific swap approval strictly bound to request_id and target worker.
2. Rejection of stale swap requests when the requesting worker is no longer assigned.
3. Rejection of stale cover requests when the requesting worker is no longer assigned.
4. Rejection of stale release requests, strictly protecting replacement workers from accidental deletion.
5. Re-verification of replacement eligibility at approval time (conflict, leave, role).
6. Routing WorkerShiftRequestViewSet.approve through validated atomic release service.
"""

import os
import unittest
from datetime import date, time, timedelta

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")
import django

django.setup()

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import connection
from django.utils import timezone
from unittest.mock import patch
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from client_profile.models import (
    AttendanceSession,
    Chain,
    LeaveRequest,
    Membership,
    Organization,
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
from users.models import OrganizationMembership
from client_profile.roster_worker_actions import (
    approve_cover_replacement,
    approve_direct_swap,
    reject_worker_shift_request,
    release_worker_from_assignment,
    request_direct_swap,
    submit_cover_request,
)
from client_profile.views import WorkerShiftRequestViewSet

User = get_user_model()


class RosterWorkerActionsDeterministicTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from attendance_tests.roster_schema import create_schema
        create_schema()

    @classmethod
    def tearDownClass(cls):
        from attendance_tests.roster_schema import drop_schema
        drop_schema()

    def _clean_tables(self):
        from attendance_tests.roster_schema import clear_schema
        clear_schema()

    def tearDown(self):
        self._clean_tables()
        super().tearDown()

    def setUp(self):
        super().setUp()
        self._clean_tables()
        self.monday = date(2026, 11, 2)
        self.shift_date = self.monday + timedelta(days=2)  # Wednesday

        import uuid
        uid = uuid.uuid4().hex[:6]

        # Users
        self.owner_user = User.objects.create(
            username=f"det_owner_{uid}",
            email=f"det_owner_{uid}@pharmacy.com",
            role="OWNER",
        )
        self.owner_profile = OwnerOnboarding.objects.create(
            user=self.owner_user,
        )
        self.pharmacy = Pharmacy.objects.create(
            name=f"Deterministic Care {uid}",
            owner=self.owner_profile,
        )

        self.worker_a = User.objects.create(
            username=f"worker_a_{uid}",
            email=f"worker_a_{uid}@test.com",
            role="PHARMACIST",
        )
        self.worker_b = User.objects.create(
            username=f"worker_b_{uid}",
            email=f"worker_b_{uid}@test.com",
            role="PHARMACIST",
        )
        self.worker_c = User.objects.create(
            username=f"worker_c_{uid}",
            email=f"worker_c_{uid}@test.com",
            role="PHARMACIST",
        )

        for w in [self.worker_a, self.worker_b, self.worker_c]:
            Membership.objects.create(
                pharmacy=self.pharmacy,
                user=w,
                role="PHARMACIST",
                status=Membership.Status.ACCEPTED,
                is_active=True,
            )

        # Baseline Shift & Assignment for Worker A
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="PHARMACIST",
            visibility="FULL_PART_TIME",
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

    def test_swap_approval_strictly_bound_to_request_target_worker(self):
        """
        Swap approval must deterministically target the worker specified in the
        specific request_id, not just 'the latest audit on the assignment'.
        """
        # Worker A requests swap with Worker B
        req1, audit1 = request_direct_swap(
            assignment=self.assignment,
            requesting_user=self.worker_a,
            target_user=self.worker_b,
            notes="Swap with B please",
        )

        # In between, suppose another audit was logged for this assignment
        dummy_audit = RosterActionAudit.objects.create(
            pharmacy=self.pharmacy,
            shift_assignment=self.assignment,
            action_type=RosterActionAudit.ActionType.SWAP_REQUESTED,
            performed_by=self.worker_a,
            target_user=self.worker_c,
            details={"request_id": 99999, "notes": "Later request"},
        )

        # Approving req1 must transfer to Worker B (the intended target for req1), NOT Worker C!
        approved_assign = approve_direct_swap(
            request_id_or_obj=req1,
            manager=self.owner_user,
        )
        self.assertEqual(approved_assign.user_id, self.worker_b.id)

        # Check audit record details
        approval_audit = RosterActionAudit.objects.filter(
            action_type=RosterActionAudit.ActionType.SWAP_APPROVED,
            shift_assignment=self.assignment,
        ).first()
        self.assertIsNotNone(approval_audit)
        self.assertEqual(approval_audit.target_user_id, self.worker_b.id)
        self.assertEqual(approval_audit.details["request_id"], req1.id)

    def test_stale_swap_request_rejected_if_requester_no_longer_assigned(self):
        """
        If the assignment's user changes (e.g. through a reassignment or manual change)
        before swap approval, the stale swap request MUST be rejected.
        """
        req, _ = request_direct_swap(
            assignment=self.assignment,
            requesting_user=self.worker_a,
            target_user=self.worker_b,
        )

        # Reassign to Worker C in the meantime
        self.assignment.user = self.worker_c
        self.assignment.save(update_fields=["user"])

        # Manager tries to approve Worker A's stale swap request
        with self.assertRaises(ValidationError) as ctx:
            approve_direct_swap(
                request_id_or_obj=req,
                manager=self.owner_user,
            )
        self.assertIn("Stale request", str(ctx.exception))

        # Worker C's assignment remains 100% intact!
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.user_id, self.worker_c.id)

    def test_stale_cover_approval_rejected_if_requester_no_longer_assigned(self):
        """
        If the requesting worker is no longer assigned to the shift,
        a cover replacement approval MUST be rejected as stale.
        """
        req, _ = submit_cover_request(
            assignment=self.assignment,
            requesting_user=self.worker_a,
            reason="Sick today",
        )

        # Assignment transferred to Worker C
        self.assignment.user = self.worker_c
        self.assignment.save(update_fields=["user"])

        # Manager attempts to approve Worker B as replacement for Worker A's stale cover request
        with self.assertRaises(ValidationError) as ctx:
            approve_cover_replacement(
                request_id_or_obj=req,
                replacement_user=self.worker_b,
                manager=self.owner_user,
            )
        self.assertIn("Stale request", str(ctx.exception))

        # Worker C's assignment remains intact
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.user_id, self.worker_c.id)

    def test_stale_release_rejected_protects_replacement_worker(self):
        """
        Critical safety test: If Worker A requests release/cover, but Worker B was already
        assigned to the shift, approving Worker A's stale release request MUST NOT delete
        Worker B's assignment!
        """
        req, _ = submit_cover_request(
            assignment=self.assignment,
            requesting_user=self.worker_a,
            reason="Emergency",
        )

        # Worker B was assigned as replacement
        self.assignment.user = self.worker_b
        self.assignment.save(update_fields=["user"])

        # Manager attempts to execute release on Worker A's stale request
        with self.assertRaises(ValidationError) as ctx:
            release_worker_from_assignment(
                request_id_or_obj=req,
                manager=self.owner_user,
            )
        self.assertIn("Stale request", str(ctx.exception))

        # Worker B's assignment is NOT deleted!
        self.assertTrue(ShiftSlotAssignment.objects.filter(pk=self.assignment.id).exists())
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.user_id, self.worker_b.id)

    def test_swap_approval_reverifies_eligibility_at_decision_time(self):
        """
        If the target worker becomes unavailable (e.g. approved leave or conflict)
        between swap request and approval, the approval MUST be rejected.
        """
        req, _ = request_direct_swap(
            assignment=self.assignment,
            requesting_user=self.worker_a,
            target_user=self.worker_b,
        )

        # Worker B gets an approved leave request on slot_date
        LeaveRequest.objects.create(
            user=self.worker_b,
            slot_assignment=self.assignment,
            status="APPROVED",
            leave_type="ANNUAL",
        )

        # Approval must fail validation
        with self.assertRaises(ValidationError) as ctx:
            approve_direct_swap(
                request_id_or_obj=req,
                manager=self.owner_user,
            )
        self.assertIn("approved leave", str(ctx.exception).lower())

        # Assignment remains with Worker A
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.user_id, self.worker_a.id)

    def test_owner_viewset_approve_routes_through_validated_release(self):
        """
        Calling WorkerShiftRequestViewSet.approve routes through release_worker_from_assignment,
        reusing the existing Shift and ShiftSlot without creating duplicates, and recording an audit.
        """
        factory = APIRequestFactory()
        view = WorkerShiftRequestViewSet.as_view({"post": "approve"})

        # Worker A requests cover
        req = WorkerShiftRequest.objects.create(
            pharmacy=self.pharmacy,
            requested_by=self.worker_a,
            shift=self.assignment,
            role="PHARMACIST",
            slot_date=self.shift_date,
            start_time=time(9, 0),
            end_time=time(17, 0),
            status="PENDING",
        )

        initial_shift_count = Shift.objects.filter(pharmacy=self.pharmacy).count()

        request = factory.post(f"/api/client-profile/worker-shift-requests/{req.id}/approve/")
        force_authenticate(request, user=self.owner_user)
        with patch("client_profile.views.async_task"):
            response = view(request, pk=req.id)

        self.assertEqual(response.status_code, 200)

        # Shift count is unchanged: no duplicate shift was created!
        final_shift_count = Shift.objects.filter(pharmacy=self.pharmacy).count()
        self.assertEqual(final_shift_count, initial_shift_count)

        # Shift visibility was escalated to LOCUM_CASUAL
        self.shift.refresh_from_db()
        self.assertEqual(self.shift.visibility, "LOCUM_CASUAL")

        # Original assignment was released
        self.assertFalse(ShiftSlotAssignment.objects.filter(pk=self.assignment.id).exists())

        # Audit record was created
        audit = RosterActionAudit.objects.filter(
            action_type=RosterActionAudit.ActionType.WORKER_RELEASED,
            performed_by=self.owner_user,
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.target_user_id, self.worker_a.id)
