"""Backward-compatible import facade for shift models.

Shift model source is owned by `shifts.models`. During this phase the models
retain `Meta.app_label = "client_profile"`, preserving migration state,
ContentTypes and existing physical table names.
"""
from shifts.models import (
    LeaveRequest,
    Shift,
    ShiftCounterOffer,
    ShiftCounterOfferSlot,
    ShiftDescriptionTemplate,
    ShiftInterest,
    ShiftOffer,
    ShiftProfileAccessAudit,
    ShiftRejection,
    ShiftSaved,
    ShiftSlot,
    ShiftSlotAssignment,
    WorkerShiftRequest,
    _assert_roster_assignment_mutable,
    _assert_roster_shift_mutable,
    _assert_roster_slot_mutable,
    _published_period_for_slot,
    _published_roster_period,
)

__all__ = [
    "Shift",
    "ShiftDescriptionTemplate",
    "_published_roster_period",
    "_published_period_for_slot",
    "_assert_roster_slot_mutable",
    "_assert_roster_shift_mutable",
    "_assert_roster_assignment_mutable",
    "ShiftSlot",
    "ShiftInterest",
    "ShiftSlotAssignment",
    "ShiftProfileAccessAudit",
    "ShiftRejection",
    "ShiftCounterOffer",
    "ShiftOffer",
    "ShiftCounterOfferSlot",
    "ShiftSaved",
    "LeaveRequest",
    "WorkerShiftRequest",
]
