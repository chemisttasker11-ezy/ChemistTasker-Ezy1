from celery import shared_task


@shared_task(ignore_result=True, autoretry_for=(Exception,), retry_backoff=True, retry_jitter=True, max_retries=5)
def rebuild_timesheet_task(period_id: int, user_id: int):
    from .models import Timesheet
    from .timesheets import build_timesheet, ensure_period_timesheets
    from .models import TimesheetPeriod

    period = TimesheetPeriod.objects.get(pk=period_id)
    if period.status == TimesheetPeriod.Status.LOCKED:
        return {"status": "locked"}
    ensure_period_timesheets(period)
    timesheet = Timesheet.objects.filter(period=period, user_id=user_id).first()
    if not timesheet:
        return {"status": "not_applicable"}
    revision = build_timesheet(timesheet.pk)
    return {"status": "rebuilt", "timesheet_id": timesheet.pk, "revision": revision.revision_number}


@shared_task(ignore_result=True, autoretry_for=(Exception,), retry_backoff=True, retry_jitter=True, max_retries=5)
def rebuild_timesheet_period_task(period_id: int):
    from .timesheets import rebuild_period
    revisions = rebuild_period(period_id)
    return {"status": "rebuilt", "count": len(revisions)}
