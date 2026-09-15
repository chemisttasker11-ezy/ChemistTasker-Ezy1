import os
import unittest
from datetime import date, time, timedelta

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")
import django

django.setup()

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError, PermissionDenied
from django.db import connection
from rest_framework.test import APIClient

from client_profile.models import (
    Chain,
    LeaveRequest,
    Membership,
    Organization,
    OwnerOnboarding,
    Pharmacy,
    PharmacyAdmin,
    RosterAcknowledgement,
    RosterPeriod,
    RosterPublicationAudit,
    RosterTemplate,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
    UserAvailability,
)
from client_profile.roster_services import (
    apply_roster_template,
    bulk_edit_roster_period,
    copy_roster_week,
    create_roster_template,
    get_or_create_roster_period,
    publish_roster_period,
    save_period_as_template,
    validate_roster_template_data,
)

User = get_user_model()


class RosterCopyTemplatesBulkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from attendance_tests.roster_schema import create_schema
        create_schema()

    @classmethod
    def tearDownClass(cls):
        from attendance_tests.roster_schema import drop_schema
        drop_schema()

    def setUp(self):
        self._clean_tables()

        # Pharmacy 1 and Owner
        self.owner_user = User.objects.create_user(
            username="owner1", email="owner1@pharmacy.com", password="pass", role="OWNER"
        )
        self.owner_onboarding = OwnerOnboarding.objects.create(user=self.owner_user)
        self.pharmacy = Pharmacy.objects.create(
            name="Alpha Pharmacy",
            owner=self.owner_onboarding,
        )

        # Pharmacy 2 (for cross-pharmacy isolation tests)
        self.other_owner_user = User.objects.create_user(
            username="owner2", email="owner2@pharmacy.com", password="pass", role="OWNER"
        )
        self.other_owner_onboarding = OwnerOnboarding.objects.create(user=self.other_owner_user)
        self.other_pharmacy = Pharmacy.objects.create(
            name="Beta Pharmacy",
            owner=self.other_owner_onboarding,
        )

        # Workers
        self.pharmacist = User.objects.create_user(
            username="pharma_alice", email="alice@test.com", password="pass", role="PHARMACIST"
        )
        self.intern = User.objects.create_user(
            username="intern_bob", email="bob@test.com", password="pass", role="OTHER_STAFF"
        )

        # Memberships
        Membership.objects.create(
            user=self.pharmacist,
            pharmacy=self.pharmacy,
            role="PHARMACIST",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )
        Membership.objects.create(
            user=self.intern,
            pharmacy=self.pharmacy,
            role="INTERN",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        # Standard test week: Monday 2026-10-05
        self.monday = date(2026, 10, 5)
        self.period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)

        # Add shift, slot, assignment to source period
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="PHARMACIST",
            created_by=self.owner_user,
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift,
            date=self.monday,
            start_time=time(9, 0),
            end_time=time(17, 0),
            rate=65.0,
        )
        self.assignment = ShiftSlotAssignment.objects.create(
            shift=self.shift,
            slot=self.slot,
            slot_date=self.monday,
            user=self.pharmacist,
            unit_rate=65.0,
            is_rostered=True,
        )

        self.client = APIClient()

    def tearDown(self):
        self._clean_tables()

    def _clean_tables(self):
        from attendance_tests.roster_schema import clear_schema
        clear_schema()

    # -----------------------------------------------------------------------
    # 1. Roster Copy Week Tests
    # -----------------------------------------------------------------------
    def test_copy_roster_week_preserves_structure_and_marks_draft(self):
        target_monday = date(2026, 10, 12)
        target_period, counts = copy_roster_week(
            source_period=self.period,
            target_week_start=target_monday,
            user=self.owner_user,
            include_assignments=True,
        )

        self.assertEqual(target_period.status, RosterPeriod.Status.DRAFT)
        self.assertEqual(target_period.copied_from, self.period)
        self.assertEqual(target_period.week_start, target_monday)
        self.assertEqual(counts["shifts_copied"], 1)
        self.assertEqual(counts["slots_copied"], 1)
        self.assertEqual(counts["assignments_copied"], 1)

        # Verify new slot date offset by 7 days
        new_slots = ShiftSlot.objects.filter(shift__pharmacy=self.pharmacy, date__gte=target_monday)
        self.assertEqual(new_slots.count(), 1)
        copied_slot = new_slots.first()
        self.assertEqual(copied_slot.date, target_monday)
        self.assertEqual(copied_slot.start_time, time(9, 0))
        self.assertEqual(copied_slot.end_time, time(17, 0))

        # Verify assignment copied
        new_assignments = ShiftSlotAssignment.objects.filter(slot=copied_slot)
        self.assertEqual(new_assignments.count(), 1)
        self.assertEqual(new_assignments.first().user, self.pharmacist)
        self.assertEqual(new_assignments.first().slot_date, target_monday)
        self.assertTrue(new_assignments.first().is_rostered)

    def test_copy_roster_week_without_assignments(self):
        target_monday = date(2026, 10, 12)
        target_period, counts = copy_roster_week(
            source_period=self.period,
            target_week_start=target_monday,
            user=self.owner_user,
            include_assignments=False,
        )
        self.assertEqual(counts["shifts_copied"], 1)
        self.assertEqual(counts["slots_copied"], 1)
        self.assertEqual(counts["assignments_copied"], 0)

        copied_slot = ShiftSlot.objects.get(shift__pharmacy=self.pharmacy, date=target_monday)
        self.assertEqual(copied_slot.assignments.count(), 0)

    def test_copy_roster_week_rejects_non_monday_and_same_week(self):
        # Tuesday
        with self.assertRaises(ValidationError) as ctx:
            copy_roster_week(self.period, date(2026, 10, 6), self.owner_user)
        self.assertIn("must be a Monday", str(ctx.exception))

        # Same Monday
        with self.assertRaises(ValidationError) as ctx:
            copy_roster_week(self.period, self.monday, self.owner_user)
        self.assertIn("Cannot copy a roster period onto its own week", str(ctx.exception))

    def test_copy_roster_week_prevents_accidental_publication_and_duplicate(self):
        target_monday = date(2026, 10, 12)
        # Create published target period
        pub_period, _ = get_or_create_roster_period(self.pharmacy, target_monday, self.owner_user)
        pub_period.status = RosterPeriod.Status.PUBLISHED
        pub_period.save()

        with self.assertRaises(ValidationError) as ctx:
            copy_roster_week(self.period, target_monday, self.owner_user)
        self.assertIn("Cannot copy into an already published roster period", str(ctx.exception))

    def test_copy_roster_week_overwrite_behavior(self):
        target_monday = date(2026, 10, 12)
        # First copy
        copy_roster_week(self.period, target_monday, self.owner_user)

        # Second copy without overwrite should fail
        with self.assertRaises(ValidationError) as ctx:
            copy_roster_week(self.period, target_monday, self.owner_user, overwrite=False)
        self.assertIn("already has shifts", str(ctx.exception))

        # With overwrite=True, succeeds cleanly
        target_period, counts = copy_roster_week(
            self.period, target_monday, self.owner_user, overwrite=True
        )
        self.assertEqual(counts["slots_copied"], 1)
        total_target_slots = ShiftSlot.objects.filter(
            shift__pharmacy=self.pharmacy, date=target_monday
        ).count()
        self.assertEqual(total_target_slots, 1)

    def test_copy_roster_week_cross_pharmacy_isolation(self):
        # Other owner tries to copy Alpha Pharmacy's roster
        with self.assertRaises(ValidationError) as ctx:
            copy_roster_week(self.period, date(2026, 10, 12), self.other_owner_user)
        self.assertIn("not authorized", str(ctx.exception))

    # -----------------------------------------------------------------------
    # 2. Roster Template Tests
    # -----------------------------------------------------------------------
    def test_validate_roster_template_data_schema(self):
        # Valid template
        valid_data = [
            {"day_of_week": 0, "start_time": "09:00", "end_time": "17:00", "role": "PHARMACIST"},
            {"day_of_week": 1, "start_time": "10:00", "end_time": "18:00", "role": "INTERN", "user_id": self.intern.id},
        ]
        validate_roster_template_data(valid_data)

        # Invalid: ambiguous zero-length/full-day time pair
        with self.assertRaises(ValidationError) as ctx:
            validate_roster_template_data([
                {"day_of_week": 0, "start_time": "17:00", "end_time": "17:00", "role": "PHARMACIST"}
            ])
        self.assertIn("start_time and end_time must differ", str(ctx.exception))

        # Invalid: day out of bounds
        with self.assertRaises(ValidationError) as ctx:
            validate_roster_template_data([
                {"day_of_week": 7, "start_time": "09:00", "end_time": "17:00", "role": "PHARMACIST"}
            ])
        self.assertIn("day_of_week must be an integer between 0", str(ctx.exception))

        # Invalid: role not recognised
        with self.assertRaises(ValidationError) as ctx:
            validate_roster_template_data([
                {"day_of_week": 0, "start_time": "09:00", "end_time": "17:00", "role": "SUPERHERO"}
            ])
        self.assertIn("role must be one of", str(ctx.exception))

    def test_create_and_apply_roster_template(self):
        template_data = [
            {"day_of_week": 0, "start_time": "08:30", "end_time": "16:30", "role": "PHARMACIST", "user_id": self.pharmacist.id},
            {"day_of_week": 2, "start_time": "09:00", "end_time": "17:00", "role": "INTERN", "user_id": self.intern.id},
        ]
        template = create_roster_template(
            pharmacy=self.pharmacy,
            name="Standard Week A",
            template_data=template_data,
            user=self.owner_user,
        )
        self.assertEqual(template.name, "Standard Week A")
        self.assertEqual(len(template.template_data), 2)

        # Apply to future week
        target_monday = date(2026, 11, 2)
        period, counts = apply_roster_template(
            pharmacy=self.pharmacy,
            template=template,
            target_week_start=target_monday,
            user=self.owner_user,
        )
        self.assertEqual(period.status, RosterPeriod.Status.DRAFT)
        self.assertEqual(counts["slots_created"], 2)
        self.assertEqual(counts["assignments_created"], 2)

        # Verify Wednesday slot created on 2026-11-04 (Monday + 2 days)
        wednesday_slot = ShiftSlot.objects.filter(
            shift__pharmacy=self.pharmacy, date=date(2026, 11, 4)
        ).first()
        self.assertIsNotNone(wednesday_slot)
        self.assertEqual(wednesday_slot.shift.role_needed, "INTERN")
        self.assertEqual(wednesday_slot.start_time, time(9, 0))

    def test_save_period_as_template(self):
        # Save self.period as template
        template = save_period_as_template(
            roster_period=self.period,
            name="Extracted Week",
            user=self.owner_user,
            include_users=True,
        )
        self.assertEqual(template.name, "Extracted Week")
        self.assertEqual(len(template.template_data), 1)
        self.assertEqual(template.template_data[0]["day_of_week"], 0)
        self.assertEqual(template.template_data[0]["role"], "PHARMACIST")
        self.assertEqual(template.template_data[0]["user_id"], self.pharmacist.id)

    def test_apply_template_cross_pharmacy_isolation(self):
        # Template created for Pharmacy 1 cannot be applied to Pharmacy 2
        template = create_roster_template(
            pharmacy=self.pharmacy,
            name="Pharm 1 Template",
            template_data=[{"day_of_week": 0, "start_time": "09:00", "end_time": "17:00", "role": "PHARMACIST"}],
            user=self.owner_user,
        )
        with self.assertRaises(ValidationError) as ctx:
            apply_roster_template(
                pharmacy=self.other_pharmacy,
                template=template,
                target_week_start=date(2026, 10, 12),
                user=self.other_owner_user,
            )
        self.assertIn("Template belongs to a different pharmacy", str(ctx.exception))

    # -----------------------------------------------------------------------
    # 3. Bulk Operations Tests (All-or-Nothing Rollback)
    # -----------------------------------------------------------------------
    def test_bulk_edit_successful_batch(self):
        tuesday = self.monday + timedelta(days=1)

        operations = [
            {
                "action": "create_shift",
                "date": str(tuesday),
                "start_time": "10:00",
                "end_time": "16:00",
                "role": "INTERN",
                "user_id": self.intern.id,
            },
            {
                "action": "update_slot_times",
                "slot_id": self.slot.id,
                "start_time": "08:30",
                "end_time": "17:30",
            },
        ]

        summary = bulk_edit_roster_period(self.period, operations, self.owner_user)
        self.assertEqual(summary["created"], 1)
        self.assertEqual(summary["updated"], 1)

        # Verify updated times
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.start_time, time(8, 30))
        self.assertEqual(self.slot.end_time, time(17, 30))

        # Verify created shift
        tue_slot = ShiftSlot.objects.filter(shift__pharmacy=self.pharmacy, date=tuesday).first()
        self.assertIsNotNone(tue_slot)
        self.assertEqual(tue_slot.shift.role_needed, "INTERN")
        self.assertEqual(tue_slot.assignments.first().user, self.intern)

    def test_bulk_edit_all_or_nothing_rollback_on_error(self):
        tuesday = self.monday + timedelta(days=1)

        # Batch where 1st is valid, but 2nd touches a non-existent slot
        operations = [
            {
                "action": "create_shift",
                "date": str(tuesday),
                "start_time": "10:00",
                "end_time": "16:00",
                "role": "INTERN",
            },
            {
                "action": "update_slot_times",
                "slot_id": 999999,  # Non-existent!
                "start_time": "08:00",
                "end_time": "16:00",
            },
        ]

        with self.assertRaises(ValidationError) as ctx:
            bulk_edit_roster_period(self.period, operations, self.owner_user)
        self.assertIn("Slot 999999 not found", str(ctx.exception))

        # The 1st operation MUST NOT have persisted
        tue_slots = ShiftSlot.objects.filter(shift__pharmacy=self.pharmacy, date=tuesday)
        self.assertEqual(tue_slots.count(), 0)

    def test_bulk_edit_cross_pharmacy_isolation(self):
        # Create a slot in other pharmacy
        other_shift = Shift.objects.create(pharmacy=self.other_pharmacy, role_needed="PHARMACIST")
        other_slot = ShiftSlot.objects.create(
            shift=other_shift, date=self.monday, start_time=time(9, 0), end_time=time(17, 0)
        )

        operations = [
            {
                "action": "update_slot_times",
                "slot_id": other_slot.id,
                "start_time": "10:00",
                "end_time": "18:00",
            }
        ]

        with self.assertRaises(ValidationError) as ctx:
            bulk_edit_roster_period(self.period, operations, self.owner_user)
        self.assertIn("Slot belongs to a different pharmacy", str(ctx.exception))

    def test_bulk_edit_rejects_published_roster(self):
        publish_roster_period(self.period, self.owner_user, force_warnings=True)

        operations = [
            {
                "action": "update_slot_times",
                "slot_id": self.slot.id,
                "start_time": "10:00",
                "end_time": "18:00",
            }
        ]
        with self.assertRaises(ValidationError) as ctx:
            bulk_edit_roster_period(self.period, operations, self.owner_user)
        self.assertIn("Cannot perform bulk edits on a published roster period", str(ctx.exception))

    # -----------------------------------------------------------------------
    # 4. REST API Endpoint Tests
    # -----------------------------------------------------------------------
    def test_api_copy_week_endpoint(self):
        self.client.force_authenticate(user=self.owner_user)
        target_monday = "2026-10-19"
        res = self.client.post(
            "/attendance/roster/copy-week/",
            {
                "source_period_id": self.period.id,
                "target_week_start": target_monday,
                "include_assignments": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "DRAFT")
        self.assertEqual(data["target_week_start"], target_monday)
        self.assertEqual(data["counts"]["slots_copied"], 1)

    def test_api_template_create_list_and_apply(self):
        self.client.force_authenticate(user=self.owner_user)

        # 1. Create template from period
        save_res = self.client.post(
            "/attendance/roster/templates/",
            {
                "from_period_id": self.period.id,
                "name": "API Template Week",
                "include_users": True,
            },
            format="json",
        )
        self.assertEqual(save_res.status_code, 201)
        template_id = save_res.json()["id"]

        # 2. List templates
        list_res = self.client.get(f"/attendance/roster/templates/?pharmacy_id={self.pharmacy.id}")
        self.assertEqual(list_res.status_code, 200)
        self.assertEqual(len(list_res.json()), 1)
        self.assertEqual(list_res.json()[0]["name"], "API Template Week")

        # 3. Apply template
        apply_res = self.client.post(
            "/attendance/roster/templates/apply/",
            {
                "template_id": template_id,
                "target_week_start": "2026-11-09",
                "include_assignments": True,
            },
            format="json",
        )
        self.assertEqual(apply_res.status_code, 200)
        self.assertEqual(apply_res.json()["status"], "DRAFT")
        self.assertEqual(apply_res.json()["counts"]["slots_created"], 1)

    def test_api_bulk_edit_endpoint(self):
        self.client.force_authenticate(user=self.owner_user)
        tuesday = str(self.monday + timedelta(days=1))

        res = self.client.post(
            "/attendance/roster/bulk-edit/",
            {
                "period_id": self.period.id,
                "operations": [
                    {
                        "action": "create_shift",
                        "date": tuesday,
                        "start_time": "11:00",
                        "end_time": "19:00",
                        "role": "PHARMACIST",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["summary"]["created"], 1)


if __name__ == "__main__":
    unittest.main()
