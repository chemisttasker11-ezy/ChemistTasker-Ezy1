"""E17: a worker accepts the invoice engagement terms of their own approved emergency cover.

Manager approval never stamps acceptance; only this worker step makes approved INVOICE cover an invoice source.
Lock order: ProvisionalAttendance + AttendanceSession (one statement, same as approve/reject) -> ShiftSlotAssignment.
"""
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from attendance.models import ProvisionalAttendance
from shifts.models import ShiftSlotAssignment


def _occurrence(assignment):
    # The manager's assignment rate is the agreed rate, never the request payload.
    return {
        "slot_id": assignment.slot_id,
        "date": str(assignment.slot_date),
        "start_time": str(assignment.slot.start_time),
        "end_time": str(assignment.slot.end_time),
        "agreed_rate": str(assignment.unit_rate) if assignment.unit_rate is not None else None,
    }


def _price(assignment, user):
    """Approval creates the cover without a rate: price it the way a posted shift is priced; a set rate stays.
    Returns False when there is no positive rate to invoice (in memory only; the caller saves nothing)."""
    if assignment.unit_rate is None:
        from shifts.pricing import get_locked_rate_for_slot
        assignment.unit_rate, assignment.rate_reason = get_locked_rate_for_slot(
            assignment.slot, assignment.shift, user, override_date=assignment.slot_date,
        )
    return assignment.unit_rate is not None and assignment.unit_rate > 0


def _invoice_terms(provisional, assignment, user):
    """Server-built INVOICE terms for this cover, or (None, notice) when the worker cannot accept invoice terms."""
    from shifts.engagement import (
        PAYMENT_TFN, SETTLEMENT_INVOICE, SETTLEMENT_TIMESHEET_ONLY, build_shift_engagement_terms,
        direct_pharmacy_staff_membership, worker_payment_profile_status,
    )

    try:
        terms = build_shift_engagement_terms(shift=assignment.shift, user=user)
    except ValidationError as exc:
        if (
            direct_pharmacy_staff_membership(user=user, pharmacy=assignment.shift.pharmacy)
            or worker_payment_profile_status(user)["payment_preference"] == PAYMENT_TFN
        ):
            # Local staff (E18: staff wins) and TFN cover are never invoiced, so their failure is not an ABN repair.
            terms = {"settlement_channel": SETTLEMENT_TIMESHEET_ONLY, "engagement_kind": assignment.engagement_kind}
        else:
            return None, {
                "settlement_channel": SETTLEMENT_TIMESHEET_ONLY,
                "notice": "Your payment details are incomplete; complete your ABN details to accept invoice terms for this cover.",
                "missing": getattr(exc, "message_dict", None) or list(exc.messages),
                "payment_profile_incomplete": True,
            }
    if terms.get("settlement_channel") != SETTLEMENT_INVOICE:
        # Staff employment and TFN cover keep their existing payroll/timesheet routing; nothing to accept.
        return None, {
            "settlement_channel": terms.get("settlement_channel"),
            "engagement_kind": terms.get("engagement_kind"),
            "notice": "This cover is settled through timesheets or payroll, not by invoice; there are no invoice terms to accept.",
            "payment_profile_incomplete": False,
        }
    if not _price(assignment, user):
        return None, {
            "settlement_channel": SETTLEMENT_TIMESHEET_ONLY,
            "notice": "This pharmacy has no usable pay rate for this cover yet; the pharmacy must set its rates before you can accept invoice terms.",
            "payment_profile_incomplete": False,
        }
    return {
        **terms,
        "occurrences": [_occurrence(assignment)],
        "source": "COVER_TERMS_ACCEPTANCE",
        "provisional_id": provisional.pk,
        "cover_type": provisional.cover_type,
    }, None


def _row(provisional, assignment, user):
    if assignment.engagement_terms_accepted_at:
        preview = {**assignment.engagement_terms_snapshot, "blocked": False, "payment_profile_incomplete": False}
    else:
        terms, blocked = _invoice_terms(provisional, assignment, user)
        preview = {**terms, "blocked": False, "payment_profile_incomplete": False} if terms else {
            **blocked, "blocked": True, "accepted_at": None, "occurrences": [_occurrence(assignment)],
        }
    return {
        "provisional_id": provisional.pk,
        "assignment_id": assignment.pk,
        "session_id": provisional.session_id,
        "status": provisional.status,
        "cover_type": provisional.cover_type,
        "pharmacy_id": assignment.shift.pharmacy_id,
        "pharmacy_name": assignment.shift.pharmacy.name,
        "engagement_terms_accepted_at": assignment.engagement_terms_accepted_at,
        "engagement_terms_preview": preview,
    }


def worker_cover_terms(user):
    # shortcut: unpaginated list of the worker's approved cover; paginate if workers accumulate many.
    reviews = (
        ProvisionalAttendance.objects.filter(
            status=ProvisionalAttendance.Status.APPROVED,
            session__user=user,
            backfill_assignment__user=user,
            session__assignment_id=F("backfill_assignment_id"),
        )
        .select_related("backfill_assignment__shift__pharmacy", "backfill_assignment__slot")
        .order_by("-decided_at", "-pk")
    )
    return [_row(review, review.backfill_assignment, user) for review in reviews]


def accept_cover_terms(user, assignment_id, data):
    with transaction.atomic():
        provisional = (
            ProvisionalAttendance.objects.select_for_update(of=("self", "session"))
            .select_related("session")
            .filter(backfill_assignment_id=assignment_id)
            .first()
        )
        if provisional is None:
            raise ValidationError("This assignment is not approved emergency cover.")
        assignment = (
            ShiftSlotAssignment.objects.select_for_update(of=("self",))
            .select_related("shift__pharmacy", "slot")
            .get(pk=assignment_id)
        )
        if assignment.user_id != user.id:
            raise PermissionDenied("Only the worker who covered this shift can accept its terms.")
        session = provisional.session
        if (
            provisional.status != ProvisionalAttendance.Status.APPROVED
            or session.user_id != user.id
            or session.assignment_id != assignment.pk
            or session.ended_at is None
        ):
            raise ValidationError("Only closed cover approved by the pharmacy can be accepted.")
        if assignment.engagement_terms_accepted_at:
            return _row(provisional, assignment, user)  # idempotent replay keeps the original terms

        from shifts.engagement import freeze_accepted_terms, require_acceptance_payload
        terms, blocked = _invoice_terms(provisional, assignment, user)
        if terms is None:
            raise ValidationError({"detail": blocked["notice"]})
        require_acceptance_payload(terms=terms, data=data)
        accepted_terms, accepted_at = freeze_accepted_terms(terms=terms, user=user)
        assignment.payment_preference_snapshot = accepted_terms["payment_preference"]
        assignment.settlement_channel = accepted_terms["settlement_channel"]
        assignment.engagement_kind = accepted_terms["engagement_kind"]
        assignment.engagement_terms_snapshot = accepted_terms
        assignment.engagement_terms_accepted_at = accepted_at
        assignment.save(update_fields=[
            "unit_rate",
            "rate_reason",
            "payment_preference_snapshot",
            "settlement_channel",
            "engagement_kind",
            "engagement_terms_snapshot",
            "engagement_terms_accepted_at",
        ])
        return _row(provisional, assignment, user)


class WorkerCoverTermsView(APIView):
    """GET /api/v1/attendance/worker/cover-terms/ : the worker's approved cover and its engagement terms."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(worker_cover_terms(request.user))


class WorkerAcceptCoverTermsView(APIView):
    """
    POST /api/v1/attendance/worker/cover-terms/<assignment_id>/accept/
    Body: {"engagement_terms_accepted": true, "independent_contractor_status_confirmed": true}
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, assignment_id):
        assignment = get_object_or_404(ShiftSlotAssignment.objects.only("id", "user_id"), pk=assignment_id)
        if assignment.user_id != request.user.id:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        try:
            return Response(accept_cover_terms(request.user, assignment_id, request.data))
        except PermissionDenied as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except ValidationError as exc:
            return Response(getattr(exc, "message_dict", {"detail": exc.messages}), status=status.HTTP_400_BAD_REQUEST)
