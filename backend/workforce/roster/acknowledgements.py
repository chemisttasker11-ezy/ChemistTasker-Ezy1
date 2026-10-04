"""Workers acknowledging a published roster, and the acknowledgement status managers see."""
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from workforce.models import RosterAcknowledgement, RosterPeriod
from workforce.roster.permissions import is_authorized_attendance_manager
from workforce.roster.periods import get_roster_period_assignments


@transaction.atomic
def acknowledge_roster_period(roster_period, user, notes=""):
    """
    Worker records acknowledgement of their published shifts in a roster period.
    """
    roster_period = RosterPeriod.objects.select_for_update().get(pk=roster_period.pk)
    if roster_period.status != RosterPeriod.Status.PUBLISHED:
        raise ValidationError("Cannot acknowledge an unpublished or draft roster period.")

    # Check that worker has at least one assignment in this period
    has_assignment = get_roster_period_assignments(roster_period).filter(user=user).exists()
    if not has_assignment:
        raise ValidationError("User has no assigned shifts in this roster period.")

    ack, _ = RosterAcknowledgement.objects.update_or_create(
        roster_period=roster_period,
        user=user,
        defaults={
            "acknowledged_at": timezone.now(),
            "notes": notes,
        },
    )
    return ack


def get_roster_acknowledgement_status(roster_period, manager_user):
    """
    Returns a manager summary of worker acknowledgements for a published period:
    total workers, acknowledged count, pending count, and worker breakdown.
    """
    if not is_authorized_attendance_manager(manager_user, roster_period.pharmacy):
        raise ValidationError("User is not authorized to view acknowledgements for this pharmacy.")

    roster_period.refresh_from_db()
    assignments = list(get_roster_period_assignments(roster_period))
    worker_map = {}
    for a in assignments:
        if a.user_id not in worker_map:
            worker_map[a.user_id] = {
                "id": a.user_id,
                "name": a.user.get_full_name() or a.user.username,
                "role": getattr(a.user, "role", ""),
                "shift_count": 0,
            }
        worker_map[a.user_id]["shift_count"] += 1

    ack_rows = (RosterAcknowledgement.objects.filter(roster_period=roster_period, acknowledged_at__gte=roster_period.published_at)
                if roster_period.published_at else RosterAcknowledgement.objects.none())
    acks = {
        ack.user_id: ack
        for ack in ack_rows
    }

    result_workers = []
    acknowledged_count = 0
    for worker_id, info in worker_map.items():
        is_ack = worker_id in acks
        if is_ack:
            acknowledged_count += 1
            ack_obj = acks[worker_id]
            info["is_acknowledged"] = True
            info["acknowledged_at"] = ack_obj.acknowledged_at
            info["notes"] = ack_obj.notes
        else:
            info["is_acknowledged"] = False
            info["acknowledged_at"] = None
            info["notes"] = ""
        result_workers.append(info)

    total_workers = len(worker_map)
    return {
        "period_id": roster_period.id,
        "week_start": str(roster_period.week_start),
        "status": roster_period.status,
        "total_workers": total_workers,
        "acknowledged_count": acknowledged_count,
        "pending_count": total_workers - acknowledged_count,
        "workers": result_workers,
    }
