"""The same booking protection applies to direct and parent cascade deletion."""
from rest_framework import status

from shifts.access import ShiftActionRefused
from shifts.models import Shift, ShiftOffer


def protect_shift_deletion(shift):
    """Require the caller to hold the Shift row lock until deletion commits."""
    if shift.slot_assignments.exists():
        raise ShiftActionRefused(
            'This shift has assigned workers and cannot be deleted.',
            status.HTTP_409_CONFLICT,
        )
    if (shift.payment_status == 'PENDING'
            or shift.offers.filter(status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT).exists()
            or shift.payments.filter(status='pending').exists()):
        raise ShiftActionRefused(
            'This shift has a pending payment. Complete payment before deleting it.',
            status.HTTP_409_CONFLICT,
        )


def protect_pharmacy_shift_deletion(pharmacy_ids):
    """Lock descendants in the caller's parent-deletion transaction, then guard."""
    shifts = Shift.objects.select_for_update().filter(pharmacy_id__in=pharmacy_ids).order_by('pk')
    for shift in shifts:
        protect_shift_deletion(shift)
