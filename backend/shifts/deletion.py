"""A hard-delete guard, not a cancellation policy.

D04-D11 have not been approved. Until an explicit audited cancellation
transition exists, never cascade-delete a booking, financial record,
published roster or candidate history through the ordinary shift DELETE API.
This guard deliberately retains the pre-existing ability to remove a
pristine shift with no participation or financial effects.
"""


def hard_delete_block_reason(shift):
    if shift.is_roster_container or shift.slots.filter(roster_period__isnull=False).exists():
        return "Rostered shifts must use the roster publication and adjustment workflow."

    # ShiftOffer and ShiftSlotAssignment can encode signed terms and pay.
    # A cascade would destroy those legal and financial histories.
    if (
        shift.slot_assignments.exists()
        or shift.offers.exists()
        or shift.payments.exists()
        or shift.payment_status != "NOT_REQUIRED"
    ):
        return "A booked, offered or paid shift needs an audited cancellation action, not deletion."

    # Also preserve records of applicants, counteroffers, and visibility audits.
    if (
        shift.interests.exists()
        or shift.counter_offers.exists()
        or shift.rejections.exists()
    ):
        return "A shift with candidate history cannot be hard-deleted."

    from shifts.models import ShiftProfileAccessAudit
    if ShiftProfileAccessAudit.objects.filter(shift_id=shift.pk).exists():
        return "A shift with profile access audit history cannot be hard-deleted."

    return None
