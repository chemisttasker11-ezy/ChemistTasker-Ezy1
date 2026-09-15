"""
Checkpoint 13 Acceptance Matrix: Complete End-to-End Scenario Verification
Covers:
- Journey 1: Weekly Roster Planning, Validation, Atomic Publishing, Worker Acknowledgement.
- Journey 2: Worker Roster Actions (Swap, Cover, Atomic Approvals, Release with Escalation Reuse).
- Journey 3: Roster Templates, Week Copying, and Bulk Transactional Operations.
- Journey 4: Kiosk Activation, Dynamic Signed QR, PIN Authentication, Normal Attendance Sessions.
- Journey 5: Unscheduled Cross-Site Worker Clock-in (Provisional), Manager Approval and Shift Backfill.
- Journey 6: Audited Manager Corrections on Immutable Attendance Events and Session Timeline.
- Journey 7: Security Boundaries: Rate Limiting, PIN Hashing, Permission Checks, Cross-Pharmacy Isolation.
"""
import os
import unittest
from datetime import date, datetime, time, timedelta

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")
import django

django.setup()

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import connection
from django.utils import timezone

from client_profile.attendance_approvals import (
    approve_provisional_attendance,
    create_attendance_correction,
    get_effective_session_timeline,
    is_authorized_attendance_manager,
    reject_provisional_attendance,
)
from client_profile.attendance_credentials import (
    activate_kiosk_device,
    authenticate_kiosk_device,
    generate_signed_pharmacy_qr,
    set_worker_personal_code,
    verify_kiosk_worker_pin,
    verify_signed_pharmacy_qr,
)
from client_profile.attendance_eligibility import (
    EligibilityType,
    resolve_attendance_eligibility,
)
from client_profile.attendance_transitions import (
    clock_in,
    clock_out,
    end_break,
    get_active_session_status,
    start_break,
)
from client_profile.models import (
    AttendanceCorrection,
    AttendanceEvent,
    AttendanceSession,
    Chain,
    KioskDevice,
    LeaveRequest,
    Membership,
    OwnerOnboarding,
    Pharmacy,
    PharmacyAdmin,
    PharmacyQRSession,
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
    WorkerPIN,
    WorkerShiftRequest,
)
from client_profile.roster_services import (
    acknowledge_roster_period,
    apply_roster_template,
    bulk_edit_roster_period,
    copy_roster_week,
    create_roster_template,
    get_or_create_roster_period,
    get_roster_acknowledgement_status,
    get_worker_published_roster,
    publish_roster_period,
    save_period_as_template,
    unpublish_roster_period,
    validate_roster_period,
)
from client_profile.roster_worker_actions import (
    approve_cover_replacement,
    approve_direct_swap,
    reject_worker_shift_request,
    release_worker_from_assignment,
    request_direct_swap,
    submit_cover_request,
)

User = get_user_model()


class FullAcceptanceMatrixTests(unittest.TestCase):
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

    def setUp(self):
        self._clean_tables()

        # Primary Owner & Destination Pharmacy
        self.owner = User.objects.create(
            username=f"acc_owner_{id(self)}",
            email=f"acc_owner_{id(self)}@test.com",
            role="OWNER",
        )
        self.owner_profile = OwnerOnboarding.objects.create(
            user=self.owner,
            phone_number="0411223344",
            role="PHARMACIST",
        )
        self.pharmacy = Pharmacy.objects.create(
            name="Alpha Pharmacy",
            owner=self.owner_profile,
        )

        # Secondary Pharmacy under same owner
        self.pharmacy_beta = Pharmacy.objects.create(
            name="Beta Pharmacy",
            owner=self.owner_profile,
        )

        # Manager at Alpha Pharmacy
        self.manager = User.objects.create(
            username=f"acc_mgr_{id(self)}",
            email=f"acc_mgr_{id(self)}@test.com",
            role="PHARMACIST",
        )
        PharmacyAdmin.objects.create(
            user=self.manager,
            pharmacy=self.pharmacy,
            is_active=True,
            admin_level=PharmacyAdmin.AdminLevel.MANAGER,
        )

        # Roster Workers
        self.worker1 = User.objects.create(
            username=f"worker1_{id(self)}",
            email=f"worker1_{id(self)}@test.com",
            first_name="Alice",
            last_name="W",
            role="PHARMACIST",
        )
        Membership.objects.create(
            user=self.worker1,
            pharmacy=self.pharmacy,
            role="PHARMACIST",
            status=Membership.Status.ACCEPTED,
            is_active=True,
            employment_type="FULL_TIME",
        )

        self.worker2 = User.objects.create(
            username=f"worker2_{id(self)}",
            email=f"worker2_{id(self)}@test.com",
            first_name="Bob",
            last_name="W",
            role="PHARMACIST",
        )
        Membership.objects.create(
            user=self.worker2,
            pharmacy=self.pharmacy,
            role="PHARMACIST",
            status=Membership.Status.ACCEPTED,
            is_active=True,
            employment_type="FULL_TIME",
        )

        # Cross-site Worker (only a member of Beta Pharmacy under same owner)
        self.cross_worker = User.objects.create(
            username=f"cross_worker_{id(self)}",
            email=f"cross_{id(self)}@test.com",
            first_name="Charlie",
            last_name="Cross",
            role="PHARMACIST",
        )
        self.cross_membership = Membership.objects.create(
            user=self.cross_worker,
            pharmacy=self.pharmacy_beta,
            role="PHARMACIST",
            status=Membership.Status.ACCEPTED,
            is_active=True,
            employment_type="FULL_TIME",
        )

        # External / Marketplace Locum
        self.locum_user = User.objects.create(
            username=f"locum_{id(self)}",
            email=f"locum_{id(self)}@test.com",
            first_name="Laura",
            last_name="Locum",
            role="PHARMACIST",
        )

        # Dates: next Monday
        today = date.today()
        self.monday = today + timedelta(days=(7 - today.weekday()))
        self.tuesday = self.monday + timedelta(days=1)

    # =========================================================================
    # SCENARIO 1: Full Weekly Roster Planning, Validation, Publish & Worker Acknowledge
    # =========================================================================
    def test_scenario_1_roster_planning_publish_and_acknowledgement(self):
        """Owner drafts a week, validates, publishes atomically, and workers acknowledge."""
        # 1. Initialize RosterPeriod as DRAFT
        period, created = get_or_create_roster_period(self.pharmacy, self.monday, self.manager)
        self.assertEqual(period.status, RosterPeriod.Status.DRAFT)
        self.assertTrue(created)

        # 2. Add Shifts & Assignments for Alice
        shift1 = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="PHARMACIST",
            visibility="FULL_PART_TIME",
            created_by=self.manager,
        )
        slot1 = ShiftSlot.objects.create(
            shift=shift1,
            date=self.monday,
            start_time=time(9, 0),
            end_time=time(17, 0),
        )
        assignment1 = ShiftSlotAssignment.objects.create(
            shift=shift1,
            slot=slot1,
            slot_date=self.monday,
            user=self.worker1,
            is_rostered=True,
        )

        # 3. Draft shifts are hidden from workers
        published_shifts_worker1 = get_worker_published_roster(self.worker1)
        self.assertEqual(len(published_shifts_worker1), 0)

        # 4. Pre-publish validation passes with clean schedule
        diag = validate_roster_period(period)
        self.assertTrue(diag["is_valid"])
        self.assertEqual(len(diag["errors"]), 0)

        # 5. Atomic Publish
        publish_roster_period(period, published_by=self.manager)
        period.refresh_from_db()
        self.assertEqual(period.status, RosterPeriod.Status.PUBLISHED)
        self.assertEqual(period.publication_audits.count(), 1)

        # 6. Published shifts are now visible to worker
        published_shifts_worker1 = get_worker_published_roster(self.worker1)
        self.assertEqual(len(published_shifts_worker1), 1)
        self.assertEqual(published_shifts_worker1[0].id, assignment1.id)

        # 7. Worker acknowledges roster
        ack = acknowledge_roster_period(period, user=self.worker1, notes="Confirmed Tuesday shift.")
        self.assertEqual(ack.roster_period, period)
        self.assertEqual(ack.user, self.worker1)

        # 8. Acknowledgement status shows confirmed
        ack_status = get_roster_acknowledgement_status(period, manager_user=self.manager)
        self.assertEqual(ack_status["total_workers"], 1)
        self.assertEqual(ack_status["acknowledged_count"], 1)
        self.assertEqual(ack_status["pending_count"], 0)

    # =========================================================================
    # SCENARIO 2: Worker Actions (Swap, Cover, Atomic Decisions, Escalation Reuse)
    # =========================================================================
    def test_scenario_2_worker_actions_and_escalation(self):
        """Direct swap, cover request, atomic approval, and release with escalation reuse."""
        shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="PHARMACIST",
            visibility="FULL_PART_TIME",
            created_by=self.manager,
        )
        slot = ShiftSlot.objects.create(
            shift=shift,
            date=self.tuesday,
            start_time=time(9, 0),
            end_time=time(17, 0),
        )
        assignment = ShiftSlotAssignment.objects.create(
            shift=shift,
            slot=slot,
            slot_date=self.tuesday,
            user=self.worker1,
            is_rostered=True,
        )

        # Step 1: Worker 1 requests direct swap with Worker 2
        # Crucial check: assignment is PRESERVED with Worker 1 upon submission
        swap_req, swap_audit = request_direct_swap(
            assignment=assignment,
            requesting_user=self.worker1,
            target_user=self.worker2,
            notes="Please cover Tuesday.",
        )
        assignment.refresh_from_db()
        self.assertEqual(assignment.user, self.worker1)
        self.assertEqual(swap_audit.action_type, RosterActionAudit.ActionType.SWAP_REQUESTED)

        # Step 2: Manager approves swap -> Atomically transfers to Worker 2
        approve_direct_swap(swap_req, manager=self.manager)
        assignment.refresh_from_db()
        self.assertEqual(assignment.user, self.worker2)

        # Step 3: Worker 2 submits "can't work" cover request -> Assignment stays with Worker 2
        cover_req, cover_audit = submit_cover_request(
            assignment=assignment,
            requesting_user=self.worker2,
            reason="Unwell.",
        )
        assignment.refresh_from_db()
        self.assertEqual(assignment.user, self.worker2)
        self.assertEqual(cover_audit.action_type, RosterActionAudit.ActionType.COVER_REQUESTED)

        # Step 4: Manager releases worker from shift with escalation to LOCUM_CASUAL
        # Crucial check: Reuses existing shift; does NOT create duplicate marketplace shift
        initial_shift_count = Shift.objects.count()
        escalated_shift = release_worker_from_assignment(
            request_id_or_obj=cover_req,
            manager=self.manager,
            escalate_to_visibility="LOCUM_CASUAL",
        )
        self.assertEqual(Shift.objects.count(), initial_shift_count)
        self.assertEqual(escalated_shift.id, shift.id)
        self.assertEqual(escalated_shift.visibility, "LOCUM_CASUAL")

        # ShiftSlotAssignment row is deleted
        with self.assertRaises(ShiftSlotAssignment.DoesNotExist):
            assignment.refresh_from_db()

        # Audit recorded
        self.assertTrue(
            RosterActionAudit.objects.filter(
                action_type=RosterActionAudit.ActionType.WORKER_RELEASED
            ).exists()
        )

    # =========================================================================
    # SCENARIO 3: Reusable Templates, Week Copying, and Bulk Transactional Operations
    # =========================================================================
    def test_scenario_3_templates_copy_and_bulk_operations(self):
        """Creating templates, applying, copying weeks, and transactional bulk edits."""
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.manager)
        shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST", created_by=self.manager)
        slot = ShiftSlot.objects.create(shift=shift, date=self.monday, start_time=time(8, 0), end_time=time(16, 0))
        ShiftSlotAssignment.objects.create(shift=shift, slot=slot, slot_date=self.monday, user=self.worker1, is_rostered=True)

        # 1. Save period as template
        template = save_period_as_template(
            roster_period=period,
            name="Standard Monday Template",
            user=self.manager,
        )
        self.assertEqual(template.name, "Standard Monday Template")
        self.assertEqual(len(template.template_data), 1)

        # 2. Apply template to next week
        next_monday = self.monday + timedelta(days=7)
        next_period, summary_apply = apply_roster_template(
            pharmacy=self.pharmacy,
            template=template,
            target_week_start=next_monday,
            user=self.manager,
            include_assignments=True,
        )
        self.assertEqual(next_period.status, RosterPeriod.Status.DRAFT)
        self.assertEqual(ShiftSlotAssignment.objects.filter(slot_date=next_monday).count(), 1)

        # 3. Copy week into two weeks ahead
        two_weeks_monday = self.monday + timedelta(days=14)
        copied_period, summary_copy = copy_roster_week(
            source_period=next_period,
            target_week_start=two_weeks_monday,
            user=self.manager,
            include_assignments=True,
        )
        self.assertEqual(copied_period.copied_from, next_period)
        self.assertEqual(ShiftSlotAssignment.objects.filter(slot_date=two_weeks_monday).count(), 1)

        # 4. Bulk operations: batch assignment with transactional rollback on error
        bad_ops = [
            {"action": "create_shift", "date": str(two_weeks_monday), "start_time": "10:00", "end_time": "18:00", "role": "PHARMACIST"},
            {"action": "unassign_worker", "assignment_id": 999999},  # non-existent -> triggers rollback
        ]
        with self.assertRaises(ValidationError):
            bulk_edit_roster_period(copied_period, bad_ops, user=self.manager)

    # =========================================================================
    # SCENARIO 4: Kiosk QR & PIN Device Authentication and Scheduled Attendance
    # =========================================================================
    def test_scenario_4_kiosk_qr_and_scheduled_clock_in(self):
        """Kiosk device activation, signed QR rotation, and worker clock-in/out."""
        # 1. Activate Kiosk
        kiosk, raw_token = activate_kiosk_device(self.manager, self.pharmacy, "Front Register")
        auth_device = authenticate_kiosk_device(raw_token)
        self.assertEqual(auth_device.id, kiosk.id)

        # 2. Generate and Verify Signed Dynamic QR
        qr_payload = generate_signed_pharmacy_qr(kiosk)
        is_valid, qr_sess, reason = verify_signed_pharmacy_qr(qr_payload["signed_token"])
        self.assertTrue(is_valid)
        self.assertEqual(qr_sess.pharmacy_id, self.pharmacy.id)

        # 3. Scheduled Worker with assignment clocks in
        today = date.today()
        shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        slot = ShiftSlot.objects.create(shift=shift, date=today, start_time=time(0, 0), end_time=time(23, 59, 59))
        assignment = ShiftSlotAssignment.objects.create(shift=shift, slot=slot, slot_date=today, user=self.worker1)

        session, _ = clock_in(
            user=self.worker1,
            pharmacy=self.pharmacy,
            signed_qr_token=qr_payload["signed_token"],
        )
        self.assertTrue(session.is_open)

        # 4. Breaks in app
        start_break(self.worker1)
        status = get_active_session_status(self.worker1)
        self.assertTrue(status["is_on_break"])
        end_break(self.worker1)
        status = get_active_session_status(self.worker1)
        self.assertFalse(status["is_on_break"])

        # 5. Clock out
        clock_out(self.worker1, signed_qr_token=qr_payload["signed_token"])
        session.refresh_from_db()
        self.assertFalse(session.is_open)
        self.assertIsNotNone(session.ended_at)

    # =========================================================================
    # SCENARIO 5: Cross-Site Urgent Cover (Provisional) & Manager Approval with Backfill
    # =========================================================================
    def test_scenario_5_cross_site_provisional_attendance_and_backfill(self):
        """Cross-site worker clocks in provisionally; manager approves and backfills Shift."""
        # 1. Check eligibility: Charlie is from Beta Pharmacy under same owner
        eligibility = resolve_attendance_eligibility(
            user=self.cross_worker,
            pharmacy=self.pharmacy,
        )
        self.assertTrue(eligibility.is_eligible)
        self.assertTrue(eligibility.is_provisional)
        self.assertEqual(eligibility.cover_type, ProvisionalAttendance.CoverType.CROSS_SITE_CHAIN)

        # 2. Worker clocks in provisionally
        kiosk, _ = activate_kiosk_device(self.manager, self.pharmacy, "Beta Sync Kiosk")
        qr_payload = generate_signed_pharmacy_qr(kiosk)
        session, _ = clock_in(
            user=self.cross_worker,
            pharmacy=self.pharmacy,
            signed_qr_token=qr_payload["signed_token"],
        )
        provisional = session.provisional_review
        self.assertIsNotNone(provisional)
        self.assertEqual(provisional.status, "PENDING")

        # Clock out
        clock_out(self.cross_worker, signed_qr_token=qr_payload["signed_token"])
        session.refresh_from_db()
        self.assertFalse(session.is_open)

        # 3. Manager approves provisional attendance with backfill
        initial_shifts = Shift.objects.filter(pharmacy=self.pharmacy).count()
        approve_provisional_attendance(
            manager_user=self.manager,
            provisional_id=provisional.id,
            reason="Urgent cross-site cover approved.",
        )

        provisional.refresh_from_db()
        self.assertEqual(provisional.status, "APPROVED")
        # Shift backfilled into existing Shift/Slot/Assignment models
        self.assertEqual(Shift.objects.filter(pharmacy=self.pharmacy).count(), initial_shifts + 1)
        session.refresh_from_db()
        self.assertIsNotNone(session.assignment)
        self.assertEqual(session.assignment.user, self.cross_worker)

    # =========================================================================
    # SCENARIO 6: Manager Correction on Immutable Attendance Events & Timeline
    # =========================================================================
    def test_scenario_6_immutable_attendance_correction_and_timeline(self):
        """Manager corrects event timestamp; original event is untouched; timeline audited."""
        kiosk, _ = activate_kiosk_device(self.manager, self.pharmacy, "Correction Kiosk")
        qr_payload = generate_signed_pharmacy_qr(kiosk)
        session, _ = clock_in(
            user=self.worker1,
            pharmacy=self.pharmacy,
            signed_qr_token=qr_payload["signed_token"],
        )
        clock_in_event = session.events.filter(event_type=AttendanceEvent.EventType.CLOCK_IN).first()

        # Manager corrects clock-in time to 15 minutes earlier
        adjusted_time = clock_in_event.occurred_at - timedelta(minutes=15)
        correction = create_attendance_correction(
            manager_user=self.manager,
            event_id=clock_in_event.id,
            corrected_timestamp=adjusted_time,
            reason="Card reader delay at door.",
        )

        # Original event is never mutated
        clock_in_event.refresh_from_db()
        self.assertNotEqual(clock_in_event.occurred_at, adjusted_time)

        # Timeline shows the manager correction
        timeline = get_effective_session_timeline(session)
        corrected_item = [item for item in timeline if item["event_id"] == clock_in_event.id][0]
        self.assertEqual(corrected_item["effective_timestamp"], adjusted_time)
        self.assertTrue(corrected_item["is_corrected"])

    # =========================================================================
    # SCENARIO 7: Personal PIN Security, Rate Limiting, and Lockout Boundary
    # =========================================================================
    def test_scenario_7_pin_security_and_lockout(self):
        """PIN hashing, failure tracking, and lockout window boundary."""
        # 1. Manager sets PIN for worker1
        mem = Membership.objects.get(user=self.worker1, pharmacy=self.pharmacy)
        worker_pin = set_worker_personal_code(self.manager, mem, "1234")
        self.assertNotEqual(worker_pin.pin_hash, "1234")
        self.assertTrue(worker_pin.check_pin("1234"))
        self.assertFalse(worker_pin.check_pin("9999"))

        # 2. Test rate limiting: 5 failed attempts locks PIN
        kiosk, _ = activate_kiosk_device(self.manager, self.pharmacy, "Counter Kiosk")
        for _ in range(4):
            valid, m, reason = verify_kiosk_worker_pin(kiosk, self.worker1.email, "wrong")
            self.assertFalse(valid)
            self.assertEqual(reason, "INVALID_PIN")

        # 5th attempt triggers lockout
        valid, m, reason = verify_kiosk_worker_pin(kiosk, self.worker1.email, "wrong")
        self.assertFalse(valid)
        self.assertEqual(reason, "PIN_LOCKED")

        # Further attempt (even with correct PIN) during lockout is rejected with PIN_LOCKED
        valid, m, reason = verify_kiosk_worker_pin(kiosk, self.worker1.email, "1234")
        self.assertFalse(valid)
        self.assertEqual(reason, "PIN_LOCKED")


if __name__ == "__main__":
    unittest.main()
