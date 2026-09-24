from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import django.db.models.deletion
from django.db import migrations, models


def backfill_legacy_leave(apps, schema_editor):
    LegacyLeave = apps.get_model("client_profile", "LeaveRequest")
    Membership = apps.get_model("client_profile", "Membership")
    Assignment = apps.get_model("client_profile", "ShiftSlotAssignment")
    WorkforceLeave = apps.get_model("workforce", "WorkforceLeaveRequest")

    for legacy in LegacyLeave.objects.all().iterator():
        assignment = (
            Assignment.objects.filter(pk=legacy.slot_assignment_id)
            .select_related("shift__pharmacy", "slot")
            .first()
        )
        if not assignment:
            continue

        pharmacy = assignment.shift.pharmacy
        work_date = assignment.slot_date or assignment.slot.date
        timezone_name = getattr(pharmacy, "timezone", None) or "Australia/Brisbane"
        try:
            tz = ZoneInfo(timezone_name)
        except Exception:
            tz = ZoneInfo("Australia/Brisbane")

        start_at = datetime.combine(work_date, assignment.slot.start_time, tzinfo=tz)
        end_date = work_date + timedelta(days=1) if assignment.slot.end_time <= assignment.slot.start_time else work_date
        end_at = datetime.combine(end_date, assignment.slot.end_time, tzinfo=tz)

        memberships = Membership.objects.filter(
            user_id=legacy.user_id,
            pharmacy_id=pharmacy.pk,
        )
        membership = (
            memberships.filter(is_active=True, status="ACCEPTED").order_by("-id").first()
            or memberships.filter(status="ACCEPTED").order_by("-id").first()
            or memberships.order_by("-id").first()
        )

        row = WorkforceLeave.objects.filter(legacy_leave_id=legacy.pk).first()
        if row is None:
            row = WorkforceLeave.objects.filter(
                user_id=legacy.user_id,
                pharmacy_id=pharmacy.pk,
                leave_type=legacy.leave_type,
                status=legacy.status,
                start_at=start_at,
                end_at=end_at,
            ).order_by("id").first()

        if row is None:
            row = WorkforceLeave.objects.create(
                pharmacy_id=pharmacy.pk,
                membership_id=membership.pk if membership else None,
                user_id=legacy.user_id,
                slot_assignment_id=assignment.pk,
                leave_type=legacy.leave_type,
                start_at=start_at,
                end_at=end_at,
                status=legacy.status,
                note=legacy.note or "",
                decided_at=legacy.date_resolved,
                legacy_leave_id=legacy.pk,
            )
        else:
            row.pharmacy_id = pharmacy.pk
            row.membership_id = membership.pk if membership else None
            row.user_id = legacy.user_id
            row.slot_assignment_id = assignment.pk
            row.leave_type = legacy.leave_type
            row.start_at = start_at
            row.end_at = end_at
            row.status = legacy.status
            row.note = legacy.note or ""
            row.decided_at = legacy.date_resolved
            row.legacy_leave_id = legacy.pk
            row.save()

        if legacy.date_applied:
            WorkforceLeave.objects.filter(pk=row.pk).update(created_at=legacy.date_applied)


class Migration(migrations.Migration):
    dependencies = [
        ("client_profile", "0059_invoice_finance_workspace_state"),
        ("workforce", "0004_employmentengagement_ordinary_hours_pattern"),
    ]

    operations = [
        migrations.AlterField(
            model_name="workforceleaverequest",
            name="membership",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="workforce_leave_requests",
                to="client_profile.membership",
            ),
        ),
        migrations.AddField(
            model_name="workforceleaverequest",
            name="slot_assignment",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="workforce_leave_requests",
                to="client_profile.shiftslotassignment",
            ),
        ),
        migrations.RunPython(backfill_legacy_leave, migrations.RunPython.noop),
        migrations.AddIndex(
            model_name="workforceleaverequest",
            index=models.Index(fields=["slot_assignment", "status"], name="wf_leave_slot_status_idx"),
        ),
    ]
