"""
Focused regression tests for Roster Safety:
1. Roster period assignment isolation (is_rostered=True only).
2. Protection of marketplace/open shifts, slots, and assignments during copy/template/bulk overwrite.
3. Side-effect-free owner roster-period GET (no draft row created on read).
4. Explicit POST action to initialize draft roster periods.
5. Preservation of legacy worker roster visibility until Roster V2 is published.
6. Hiding newly drafted assignments from workers until published.
7. Bulk operations protection against mutating marketplace slots/assignments.
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
from rest_framework.test import APIRequestFactory, force_authenticate

from client_profile.models import (
    AttendanceCorrection,
    AttendanceEvent,
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
from client_profile.roster_services import (
    apply_roster_template,
    bulk_edit_roster_period,
    copy_roster_week,
    get_or_create_roster_period,
    get_roster_period_assignments,
    get_roster_period_grid,
    publish_roster_period,
)
from client_profile.attendance_views import RosterPeriodDetailView, RosterPublishView, RosterValidateView
from client_profile.views import RosterWorkerViewSet

User = get_user_model()


class RosterSafetyRegressionTests(unittest.TestCase):
    def test_forbidden_initialization_does_not_create_period(self):
        for view_class in (RosterPublishView, RosterValidateView):
            with self.subTest(view=view_class.__name__):
                request = self.factory.post("/", {
                    "pharmacy_id": self.pharmacy.pk,
                    "week_start": self.monday.isoformat(),
                }, format="json")
                force_authenticate(request, user=self.locum_worker)
                response = view_class.as_view()(request)
                self.assertEqual(response.status_code, 403)
                self.assertFalse(RosterPeriod.objects.exists())

    def test_all_bulk_slot_mutations_preserve_marketplace_booking(self):
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)
        shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST", visibility="LOCUM_CASUAL")
        slot = ShiftSlot.objects.create(shift=shift, date=self.monday, start_time=time(9), end_time=time(17))
        assignment = ShiftSlotAssignment.objects.create(
            shift=shift, slot=slot, slot_date=self.monday, user=self.locum_worker, is_rostered=False,
        )
        for operation in (
            {"action": "assign_worker", "user_id": self.worker1.pk},
            {"action": "update_slot_times", "start_time": "10:00", "end_time": "18:00"},
            {"action": "move_shift", "target_date": (self.monday + timedelta(days=1)).isoformat(), "target_user_id": self.worker1.pk},
            {"action": "delete_slot"},
        ):
            with self.subTest(action=operation["action"]):
                with self.assertRaises(ValidationError):
                    bulk_edit_roster_period(period, [dict(operation, slot_id=slot.pk)], self.owner_user)
                slot.refresh_from_db()
                assignment.refresh_from_db()
                self.assertEqual(slot.date, self.monday)
                self.assertEqual(slot.start_time, time(9))
                self.assertEqual(assignment.user_id, self.locum_worker.pk)
                self.assertFalse(assignment.is_rostered)

        grid = get_roster_period_grid(self.pharmacy, self.monday, period.week_end)
        self.assertNotIn(slot.pk, [item["slot_id"] for item in grid["vacant_slots"]])

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

    def setUp(self):
        self._clean_tables()

        self.owner_user = User.objects.create_user(
            username="owner_safety", email="owner_safety@example.com", password="password", role="OWNER"
        )
        self.owner_onboarding = OwnerOnboarding.objects.create(
            user=self.owner_user,
            phone_number="0400000001",
            role="PHARMACIST",
        )
        self.pharmacy = Pharmacy.objects.create(
            name="Safety Chemist",
            owner=self.owner_onboarding,
            suburb="Brisbane",
            state="QLD",
        )
        self.worker1 = User.objects.create_user(
            username="worker1_safety", email="worker1@example.com", password="password", role="PHARMACIST"
        )
        self.locum_worker = User.objects.create_user(
            username="locum_safety", email="locum@example.com", password="password", role="PHARMACIST"
        )
        Membership.objects.create(
            user=self.worker1,
            pharmacy=self.pharmacy,
            status=Membership.Status.ACCEPTED,
            is_active=True,
            role="PHARMACIST",
        )

        today = date.today()
        self.monday = today - timedelta(days=today.weekday()) + timedelta(days=28)
        self.next_monday = self.monday + timedelta(days=7)
        self.factory = APIRequestFactory()

    def tearDown(self):
        self._clean_tables()

    def test_get_roster_period_assignments_excludes_marketplace_assignments(self):
        """
        Verify get_roster_period_assignments strictly returns is_rostered=True assignments
        and excludes marketplace (is_rostered=False) assignments.
        """
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, user=self.owner_user)

        # 1. Internal roster shift
        roster_shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="PHARMACIST",
            created_by=self.owner_user,
        )
        roster_slot = ShiftSlot.objects.create(
            shift=roster_shift,
            date=self.monday,
            start_time=time(9, 0),
            end_time=time(17, 0),
        )
        roster_assign = ShiftSlotAssignment.objects.create(
            shift=roster_shift,
            slot=roster_slot,
            slot_date=self.monday,
            user=self.worker1,
            is_rostered=True,
        )

        # 2. Marketplace shift (is_rostered=False)
        mkt_shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="PHARMACIST",
            visibility="PLATFORM",
            created_by=self.owner_user,
        )
        mkt_slot = ShiftSlot.objects.create(
            shift=mkt_shift,
            date=self.monday,
            start_time=time(10, 0),
            end_time=time(18, 0),
        )
        mkt_assign = ShiftSlotAssignment.objects.create(
            shift=mkt_shift,
            slot=mkt_slot,
            slot_date=self.monday,
            user=self.locum_worker,
            is_rostered=False,
        )

        assignments = list(get_roster_period_assignments(period))
        self.assertEqual(len(assignments), 1)
        self.assertEqual(assignments[0].id, roster_assign.id)
        self.assertTrue(assignments[0].is_rostered)

    def test_copy_roster_week_overwrite_preserves_marketplace_shifts(self):
        """
        Verify that copy_roster_week with overwrite=True replaces roster shifts
        but strictly preserves marketplace shifts, slots, and assignments.
        """
        # Source week: 1 roster shift
        source_period, _ = get_or_create_roster_period(self.pharmacy, self.monday, user=self.owner_user)
        src_shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="PHARMACIST",
            created_by=self.owner_user,
        )
        src_slot = ShiftSlot.objects.create(
            shift=src_shift,
            date=self.monday,
            start_time=time(9, 0),
            end_time=time(17, 0),
        )
        ShiftSlotAssignment.objects.create(
            shift=src_shift,
            slot=src_slot,
            slot_date=self.monday,
            user=self.worker1,
            is_rostered=True,
        )

        # Target week: already has an existing marketplace shift and an old roster shift
        old_roster_shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="PHARMACIST",
            created_by=self.owner_user,
        )
        old_roster_slot = ShiftSlot.objects.create(
            shift=old_roster_shift,
            date=self.next_monday,
            start_time=time(8, 0),
            end_time=time(16, 0),
        )
        ShiftSlotAssignment.objects.create(
            shift=old_roster_shift,
            slot=old_roster_slot,
            slot_date=self.next_monday,
            user=self.worker1,
            is_rostered=True,
        )

        marketplace_shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="PHARMACIST",
            visibility="PLATFORM",
            created_by=self.owner_user,
        )
        marketplace_slot = ShiftSlot.objects.create(
            shift=marketplace_shift,
            date=self.next_monday,
            start_time=time(12, 0),
            end_time=time(20, 0),
        )
        marketplace_assign = ShiftSlotAssignment.objects.create(
            shift=marketplace_shift,
            slot=marketplace_slot,
            slot_date=self.next_monday,
            user=self.locum_worker,
            is_rostered=False,
        )

        # Perform copy with overwrite=True
        target_period, summary = copy_roster_week(
            source_period=source_period,
            target_week_start=self.next_monday,
            user=self.owner_user,
            include_assignments=True,
            overwrite=True,
        )

        # Old roster shift was cleaned up
        self.assertFalse(Shift.objects.filter(pk=old_roster_shift.id).exists())

        # Marketplace shift, slot, and assignment are 100% PRESERVED!
        self.assertTrue(Shift.objects.filter(pk=marketplace_shift.id).exists())
        self.assertTrue(ShiftSlot.objects.filter(pk=marketplace_slot.id).exists())
        self.assertTrue(ShiftSlotAssignment.objects.filter(pk=marketplace_assign.id).exists())

        # Target period assignments include only the newly copied roster shift
        target_assignments = list(get_roster_period_assignments(target_period))
        self.assertEqual(len(target_assignments), 1)
        self.assertEqual(target_assignments[0].user, self.worker1)
        self.assertTrue(target_assignments[0].is_rostered)

    def test_owner_roster_period_get_is_side_effect_free(self):
        """
        GET /api/attendance/roster/period/ must be completely read-only.
        It must not create a RosterPeriod record in the database.
        """
        self.assertEqual(RosterPeriod.objects.filter(pharmacy=self.pharmacy, week_start=self.monday).count(), 0)

        view = RosterPeriodDetailView.as_view()
        request = self.factory.get(
            f"/api/attendance/roster/period/?pharmacy_id={self.pharmacy.id}&week_start={self.monday.isoformat()}"
        )
        force_authenticate(request, user=self.owner_user)
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["period_id"])
        self.assertEqual(response.data["status"], "DRAFT")
        self.assertFalse(response.data["created"])

        # Crucial check: zero rows created in the database!
        self.assertEqual(RosterPeriod.objects.filter(pharmacy=self.pharmacy, week_start=self.monday).count(), 0)

    def test_owner_roster_period_post_explicitly_creates_draft(self):
        """
        POST /api/attendance/roster/period/ is the explicit write action to create a draft period.
        """
        self.assertEqual(RosterPeriod.objects.filter(pharmacy=self.pharmacy, week_start=self.monday).count(), 0)

        view = RosterPeriodDetailView.as_view()
        request = self.factory.post(
            "/api/attendance/roster/period/",
            {"pharmacy_id": self.pharmacy.id, "week_start": self.monday.isoformat()},
            format="json",
        )
        force_authenticate(request, user=self.owner_user)
        response = view(request)

        self.assertEqual(response.status_code, 201)
        self.assertIsNotNone(response.data["period_id"])
        self.assertTrue(response.data["created"])

        # Exactly 1 row created in database
        self.assertEqual(RosterPeriod.objects.filter(pharmacy=self.pharmacy, week_start=self.monday).count(), 1)

    def test_legacy_worker_assignments_remain_visible_with_draft_period(self):
        """
        Legacy worker assignments created BEFORE draft period initialization
        must remain visible to the worker in RosterWorkerViewSet.
        """
        # Create an existing assignment timestamped slightly in the past
        past_time = timezone.now() - timedelta(hours=2)
        shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="PHARMACIST",
            created_by=self.owner_user,
        )
        slot = ShiftSlot.objects.create(
            shift=shift,
            date=self.monday,
            start_time=time(9, 0),
            end_time=time(17, 0),
        )
        legacy_assign = ShiftSlotAssignment.objects.create(
            shift=shift,
            slot=slot,
            slot_date=self.monday,
            user=self.worker1,
            is_rostered=False,
        )

        # Now owner initializes a draft period
        period = RosterPeriod.objects.create(
            pharmacy=self.pharmacy,
            week_start=self.monday,
            status=RosterPeriod.Status.DRAFT,
            created_by=self.owner_user,
        )

        # Worker calls RosterWorkerViewSet
        view = RosterWorkerViewSet.as_view({"get": "list"})
        request = self.factory.get(
            f"/api/client-profile/roster-worker/?pharmacy={self.pharmacy.id}&start_date={self.monday.isoformat()}"
        )
        force_authenticate(request, user=self.worker1)
        response = view(request)

        self.assertEqual(response.status_code, 200)
        result_ids = [r["id"] for r in response.data] if isinstance(response.data, list) else [r["id"] for r in response.data.get("results", [])]
        self.assertIn(legacy_assign.id, result_ids)

    def test_newly_drafted_assignments_hidden_until_published(self):
        """
        Assignments created AFTER draft period creation are hidden from workers
        while in DRAFT, and become visible once the period is PUBLISHED.
        """
        # Owner creates draft period at T0
        t0 = timezone.now() - timedelta(minutes=10)
        period = RosterPeriod.objects.create(
            pharmacy=self.pharmacy,
            week_start=self.monday,
            status=RosterPeriod.Status.DRAFT,
            created_by=self.owner_user,
        )
        RosterPeriod.objects.filter(pk=period.pk).update(created_at=t0)
        period.refresh_from_db()

        # Owner drafts a shift at T1 (> T0)
        shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="PHARMACIST",
            created_by=self.owner_user,
        )
        slot = ShiftSlot.objects.create(
            shift=shift,
            date=self.monday,
            start_time=time(9, 0),
            end_time=time(17, 0),
        )
        draft_assign = ShiftSlotAssignment.objects.create(
            shift=shift,
            slot=slot,
            slot_date=self.monday,
            user=self.worker1,
            is_rostered=True,
        )
        ShiftSlotAssignment.objects.filter(pk=draft_assign.pk).update(assigned_at=timezone.now())

        # 1. While DRAFT: hidden from worker in RosterWorkerViewSet
        view = RosterWorkerViewSet.as_view({"get": "list"})
        request = self.factory.get(
            f"/api/client-profile/roster-worker/?pharmacy={self.pharmacy.id}&start_date={self.monday.isoformat()}"
        )
        force_authenticate(request, user=self.worker1)
        response = view(request)

        self.assertEqual(response.status_code, 200)
        result_ids = [r["id"] for r in response.data] if isinstance(response.data, list) else [r["id"] for r in response.data.get("results", [])]
        self.assertNotIn(draft_assign.id, result_ids)

        # 2. Publish period
        publish_roster_period(period, published_by=self.owner_user)

        # 3. After PUBLISHED: visible to worker!
        response_published = view(request)
        result_ids_pub = [r["id"] for r in response_published.data] if isinstance(response_published.data, list) else [r["id"] for r in response_published.data.get("results", [])]
        self.assertIn(draft_assign.id, result_ids_pub)

    def test_bulk_edit_rejects_modifying_or_deleting_marketplace_slots(self):
        """
        bulk_edit_roster_slots must raise ValidationError if an operation attempts
        to delete a marketplace slot or unassign a marketplace worker.
        """
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, user=self.owner_user)

        mkt_shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="PHARMACIST",
            visibility="PLATFORM",
            created_by=self.owner_user,
        )
        mkt_slot = ShiftSlot.objects.create(
            shift=mkt_shift,
            date=self.monday,
            start_time=time(9, 0),
            end_time=time(17, 0),
        )
        mkt_assign = ShiftSlotAssignment.objects.create(
            shift=mkt_shift,
            slot=mkt_slot,
            slot_date=self.monday,
            user=self.locum_worker,
            is_rostered=False,
        )

        # Try to unassign marketplace worker
        with self.assertRaises(ValidationError) as ctx:
            bulk_edit_roster_period(
                period,
                operations=[{"action": "unassign_worker", "assignment_id": mkt_assign.id}],
                user=self.owner_user,
            )
        self.assertIn("marketplace", str(ctx.exception).lower())

        # Try to delete marketplace slot
        with self.assertRaises(ValidationError) as ctx2:
            bulk_edit_roster_period(
                period,
                operations=[{"action": "delete_slot", "slot_id": mkt_slot.id}],
                user=self.owner_user,
            )
        self.assertIn("marketplace", str(ctx2.exception).lower())


if __name__ == "__main__":
    unittest.main()
