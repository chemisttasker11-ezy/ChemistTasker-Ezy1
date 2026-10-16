"""High-value contracts for calendar-authoritative pharmacy operations.

All cases run through /api/v1/ using the real authentication and scope code.
The existing calendar characterization suite stays unchanged.
"""
from datetime import date, time
import uuid

from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import (
    client_for, make_owner_with_pharmacy, make_staff_member,
)
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment
from workforce.models import RosterPeriod
from team_calendar.models import WorkNote, WorkNoteCompletion
from team_calendar.operations_models import (
    OperationPlan, OperationTask, OperationTemplate, OperationVerification,
    OperationKpiRecord, OperationStep, OperationAudit,
)
from team_calendar.operations_rules import template_dates

BASE = "/api/v1/"
PLAN = BASE + "operation-plans/"
ITEM = BASE + "operation-items/"
TEMPLATE = BASE + "operation-templates/"
CATALOG = BASE + "operation-catalog/"
CONTEXT = BASE + "operation-context/"


class PharmacyOperationsContracts(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.worker, self.membership = make_staff_member(self.pharmacy)
        self.other_worker, self.other_membership = make_staff_member(self.pharmacy)
        self.foreign_owner, self.foreign_pharmacy = make_owner_with_pharmacy("Foreign store")
        self.stranger, self.stranger_membership = make_staff_member(self.foreign_pharmacy)
        self.day = "2026-10-19"

    def new_plan(self, user=None):
        res = client_for(user or self.owner).post(PLAN, {
            "pharmacy": self.pharmacy.id, "name": "Monday pharmacy run",
            "period": "daily", "starts_on": self.day, "ends_on": self.day,
        }, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def new_item(self, plan, **changes):
        data = {
            "plan": plan["id"], "title": "Daily opening", "description": "Check dispensary readiness",
            "date": self.day, "area": "dispensary", "audience": "NAMED",
            "membership_ids": [self.membership.id], "role_codes": ["ASSISTANT"],
            "checklist": [{"id": "s1", "label": "Check workstation", "required": True}],
            "requires_verification": True,
        }
        data.update(changes)
        res = client_for(self.owner).post(ITEM, data, format="json")
        self.assertEqual(res.status_code, 201, res.content)
        return res.json()

    def revision(self, plan):
        return client_for(self.owner).get(PLAN + str(plan["id"]) + "/").json()["revision"]

    def publish(self, plan, revision=None):
        return client_for(self.owner).post(PLAN + str(plan["id"]) + "/publish/", {
            "revision": revision if revision is not None else self.revision(plan),
        }, format="json")

    def publish_named(self, **changes):
        plan = self.new_plan()
        item = self.new_item(plan, **changes)
        res = self.publish(plan)
        self.assertEqual(res.status_code, 200, res.content)
        note_id = res.json()["plan"]["items"][0]["calendar_note_id"]
        self.assertIsInstance(note_id, int)
        return plan, item, note_id

    def published_roster_for_worker(self, *, user=None):
        person = user or self.worker
        period = RosterPeriod.objects.create(
            pharmacy=self.pharmacy, week_start=date(2026, 10, 19),
            status=RosterPeriod.Status.DRAFT, created_by=self.owner,
        )
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            role_needed="ASSISTANT", employment_type="LOCUM",
        )
        slot = ShiftSlot.objects.create(
            shift=shift, roster_period=period,
            date=date(2026, 10, 19), start_time=time(9, 0), end_time=time(17, 0),
        )
        ShiftSlotAssignment.objects.create(
            shift=shift, slot=slot, user=person, slot_date=date(2026, 10, 19),
            is_rostered=True,
        )
        period.status = RosterPeriod.Status.PUBLISHED
        period.published_at = timezone.now()
        period.save(update_fields=["status", "published_at"])
        return period

    def test_context_restricts_managed_pharmacies_and_catalog(self):
        data = client_for(self.owner).get(CONTEXT).json()
        self.assertEqual([p["id"] for p in data["pharmacies"]], [self.pharmacy.id])
        self.assertGreater(len(client_for(self.owner).get(CATALOG).json()["templates"]), 20)
        self.assertIn(client_for().get(CATALOG).status_code, [401, 403])
        self.assertEqual(client_for(self.worker).get(CATALOG).status_code, 403)

    def test_staff_cannot_create_or_publish_manager_plans(self):
        payload = {
            "pharmacy": self.pharmacy.id, "name": "Unapproved",
            "starts_on": self.day, "ends_on": self.day,
        }
        self.assertEqual(client_for(self.worker).post(PLAN, payload, format="json").status_code, 403)
        plan = self.new_plan()
        self.assertEqual(client_for(self.worker).post(
            PLAN + str(plan["id"]) + "/publish/", {"revision": 1}, format="json",
        ).status_code, 404)

    def test_planner_drafts_never_appear_on_calendar(self):
        plan = self.new_plan()
        self.new_item(plan)
        note_ids = list(WorkNote.objects.filter(pharmacy=self.pharmacy).values_list("id", flat=True))
        self.assertEqual(note_ids, [])
        feed = client_for(self.worker).get(
            BASE + "calendar-feed/?pharmacy_id=" + str(self.pharmacy.id) +
            "&date_from=2026-10-19&date_to=2026-10-19",
        )
        self.assertEqual(feed.status_code, 200)
        self.assertEqual(feed.json()["work_notes"], [])

    def test_named_publication_creates_exactly_one_authoritative_work_note(self):
        plan, task, note_id = self.publish_named()
        task_obj = OperationTask.objects.get(pk=task["id"])
        self.assertEqual(task_obj.calendar_note_id, note_id)
        self.assertEqual(task_obj.calendar_note.assignees.first().membership_id, self.membership.id)
        self.assertEqual(WorkNote.objects.filter(pharmacy=self.pharmacy).count(), 1)
        self.assertEqual(OperationAudit.objects.filter(plan_id=plan["id"], action="PUBLISHED").count(), 1)
        second = self.publish(plan)
        self.assertEqual(second.status_code, 200, second.content)
        self.assertEqual(WorkNote.objects.filter(pharmacy=self.pharmacy).count(), 1)

    def test_stale_revision_does_not_publish(self):
        plan = self.new_plan()
        self.new_item(plan)
        res = self.publish(plan, revision=1)
        self.assertEqual(res.status_code, 400)
        self.assertEqual(WorkNote.objects.count(), 0)

    def test_invalid_foreign_member_blocks_all_writes(self):
        plan = self.new_plan()
        self.new_item(plan, membership_ids=[self.stranger_membership.id])
        res = self.publish(plan)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(WorkNote.objects.count(), 0)
        self.assertEqual(OperationPlan.objects.get(pk=plan["id"]).status, "DRAFT")

    def test_roster_rule_blocks_unpublished_and_publishes_after_valid_coverage(self):
        plan = self.new_plan()
        self.new_item(plan, audience="ROLE_ON_DUTY", membership_ids=[],
                      start_time="10:00", end_time="11:00")
        no_roster = client_for(self.owner).get(
            PLAN + str(plan["id"]) + "/preview/"
        ).json()
        self.assertFalse(no_roster["ready"])
        self.assertEqual(WorkNote.objects.count(), 0)
        self.published_roster_for_worker()
        ready = client_for(self.owner).get(PLAN + str(plan["id"]) + "/preview/").json()
        self.assertTrue(ready["ready"], ready)
        self.assertEqual(ready["assignments"][0]["membership_ids"], [self.membership.id])
        res = self.publish(plan)
        self.assertEqual(res.status_code, 200, res.content)

    def test_published_work_hidden_from_unassigned_pharmacy_member(self):
        _, _, note_id = self.publish_named()
        feed = BASE + "calendar-feed/?pharmacy_id=" + str(self.pharmacy.id) + (
            "&date_from=2026-10-19&date_to=2026-10-19"
        )
        self.assertEqual([n["id"] for n in client_for(self.worker).get(feed).json()["work_notes"]], [note_id])
        self.assertEqual(client_for(self.other_worker).get(feed).json()["work_notes"], [])
        self.assertEqual(client_for(self.stranger).get(
            BASE + "work-notes/" + str(note_id) + "/"
        ).status_code, 404)
        self.assertEqual(client_for(self.stranger).get(feed).status_code, 403)

    def test_published_note_cannot_be_edited_or_deleted_as_informal_note(self):
        _, _, note_id = self.publish_named()
        note = BASE + "work-notes/" + str(note_id) + "/"
        self.assertEqual(client_for(self.worker).patch(note, {"title": "Changed"}, format="json").status_code, 403)
        self.assertEqual(client_for(self.owner).delete(note).status_code, 403)
        self.assertTrue(WorkNote.objects.filter(pk=note_id).exists())

    def test_required_steps_gate_calendar_completion_and_supervisor_signoff(self):
        _, task, note_id = self.publish_named()
        finish = BASE + "work-notes/" + str(note_id) + "/mark_done/"
        self.assertEqual(client_for(self.worker).post(
            finish, {"occurrence_date": self.day}, format="json",
        ).status_code, 400)
        step = client_for(self.worker).post(
            ITEM + str(task["id"]) + "/step/",
            {"step_id": "s1", "done": True, "evidence_note": "Workstation ready"},
            format="json",
        )
        self.assertEqual(step.status_code, 200, step.content)
        self.assertEqual(OperationStep.objects.filter(task_id=task["id"]).count(), 1)
        self.assertEqual(client_for(self.worker).post(
            finish, {"occurrence_date": self.day}, format="json",
        ).status_code, 200)
        self.assertEqual(WorkNoteCompletion.objects.count(), 1)
        self.assertEqual(client_for(self.worker).post(
            ITEM + str(task["id"]) + "/step/", {"step_id": "s1", "done": False},
            format="json",
        ).status_code, 400)
        verified = client_for(self.owner).post(
            ITEM + str(task["id"]) + "/verify/", {"note": "Independent check completed"},
            format="json",
        )
        self.assertEqual(verified.status_code, 200, verified.content)
        self.assertTrue(OperationVerification.objects.filter(task_id=task["id"]).exists())
        self.assertEqual(client_for(self.worker).post(
            BASE + "work-notes/" + str(note_id) + "/mark_open/",
            {"occurrence_date": self.day}, format="json",
        ).status_code, 403)

    def test_nonassignee_cannot_record_or_claim_operations(self):
        _, task, note_id = self.publish_named()
        for action, payload in (
            ("step", {"step_id": "s1", "done": True}),
            ("record_kpi", {"value": 1, "key": str(uuid.uuid4())}),
        ):
            self.assertEqual(client_for(self.other_worker).post(
                ITEM + str(task["id"]) + "/" + action + "/", payload, format="json",
            ).status_code, 404)
        self.assertEqual(client_for(self.other_worker).post(
            BASE + "work-notes/" + str(note_id) + "/mark_done/",
            {"occurrence_date": self.day}, format="json",
        ).status_code, 403)

    def test_kpi_idempotency_preserves_single_actual_value(self):
        _, task, _ = self.publish_named(target_value=20, target_unit="contacts")
        key = str(uuid.uuid4())
        uri = ITEM + str(task["id"]) + "/record_kpi/"
        first = client_for(self.worker).post(uri, {"key": key, "value": 7}, format="json")
        self.assertEqual(first.status_code, 201, first.content)
        again = client_for(self.worker).post(uri, {"key": key, "value": 7}, format="json")
        self.assertEqual(again.status_code, 200)
        mismatched = client_for(self.worker).post(uri, {"key": key, "value": 15}, format="json")
        self.assertEqual(mismatched.status_code, 400)
        self.assertEqual(OperationKpiRecord.objects.filter(task_id=task["id"]).count(), 1)
        self.assertEqual(OperationKpiRecord.objects.get(task_id=task["id"]).value, 7)

    def test_org_and_foreign_pharmacy_templates_are_not_usable_cross_tenant(self):
        plan = self.new_plan()
        foreign = OperationTemplate.objects.create(pharmacy=self.foreign_pharmacy, name="Foreign")
        res = client_for(self.owner).post(
            PLAN + str(plan["id"]) + "/apply_template/",
            {"template_id": foreign.id}, format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(OperationTask.objects.filter(plan_id=plan["id"]).count(), 0)

    def test_inactive_membership_is_not_eligible(self):
        self.membership.is_active = False
        self.membership.save(update_fields=["is_active"])
        plan = self.new_plan()
        self.new_item(plan)
        self.assertEqual(self.publish(plan).status_code, 400)
        self.assertEqual(WorkNote.objects.count(), 0)

    def test_overnight_roster_presence(self):
        """Shift beginning the previous evening may cover today's early task."""
        from unittest.mock import Mock
        from team_calendar.operations_rules import _rostered_user_ids
        p = self.pharmacy
        period = RosterPeriod.objects.create(
            pharmacy=p, week_start=date(2026, 10, 19),
            status=RosterPeriod.Status.DRAFT, created_by=self.owner,
        )
        shift = Shift.objects.create(
            pharmacy=p, created_by=self.owner,
            role_needed="ASSISTANT", employment_type="LOCUM",
        )
        slot = ShiftSlot.objects.create(
            shift=shift, roster_period=period,
            date=date(2026, 10, 19), start_time=time(22, 0), end_time=time(6, 0),
        )
        ShiftSlotAssignment.objects.create(
            shift=shift, slot=slot, user=self.worker,
            slot_date=date(2026, 10, 19), is_rostered=True,
        )
        period.status = RosterPeriod.Status.PUBLISHED
        period.published_at = timezone.now()
        period.save(update_fields=["status", "published_at"])
        task = Mock(date=date(2026, 10, 20), start_time=time(3), end_time=time(4))
        task.plan.pharmacy_id = p.id
        self.assertEqual(_rostered_user_ids(task), {self.worker.id})
        task.start_time = time(14)
        task.end_time = time(15)
        self.assertEqual(_rostered_user_ids(task), set())

    def test_unassigned_manager_cannot_sign_off_worker_completion(self):
        """A manager cannot impersonate a target worker in calendar completion."""
        manager_worker, manager_membership = make_staff_member(self.pharmacy)
        _, item, note_id = self.publish_named()
        uri = BASE + "work-notes/" + str(note_id) + "/mark_done/"
        self.assertEqual(client_for(manager_worker).post(
            uri, {"occurrence_date": self.day}, format="json",
        ).status_code, 403)
        self.assertEqual(WorkNoteCompletion.objects.count(), 0)

    def test_clinical_work_blocks_noncredentialed_and_unrostered_pharmacist(self):
        from client_profile.characterization_support import make_user
        from memberships.models import Membership
        pharmacist = make_user("PHARMACIST")
        pharmacist_membership = Membership.objects.create(
            user=pharmacist, pharmacy=self.pharmacy, role="PHARMACIST",
            status=Membership.Status.ACCEPTED,
        )
        plan = self.new_plan()
        self.new_item(
            plan, title="Clinical service", target_kind="clinical",
            membership_ids=[pharmacist_membership.id], role_codes=["PHARMACIST"],
        )
        response = self.publish(plan)
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(WorkNote.objects.count(), 0)
        self.assertIn("preflight", response.json())


class OperationsTemplateDates(TestCase):
    def test_weekly_dates_and_month_boundaries(self):
        dates = template_dates(
            {"freq": "WEEKLY", "byweekday": [0, 4]},
            date(2026, 10, 19), date(2026, 11, 1),
        )
        self.assertEqual(dates, [
            date(2026, 10, 19), date(2026, 10, 23),
            date(2026, 10, 26), date(2026, 10, 30),
        ])

    def test_first_weekday_does_not_pretend_holidays_are_business_days(self):
        dates = template_dates(
            {"freq": "FIRST_WEEKDAY_MONTH"},
            date(2026, 10, 29), date(2026, 12, 5),
        )
        self.assertEqual(dates, [date(2026, 11, 2), date(2026, 12, 1)])

    def test_last_weekday_and_28th(self):
        dates = template_dates(
            {"freq": "LAST_WEEKDAY_MONTH"},
            date(2026, 10, 19), date(2026, 11, 30),
        )
        self.assertEqual(dates, [date(2026, 10, 30), date(2026, 11, 30)])
        dates28 = template_dates({"freq": "MONTHLY_28"}, date(2026, 10, 19), date(2026, 11, 30))
        self.assertEqual(dates28, [date(2026, 10, 28), date(2026, 11, 28)])

    def test_bounded_expansion_rejects_unbounded_plans(self):
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            template_dates({"freq": "DAILY"}, date(2026, 1, 1), date(2026, 12, 31))
