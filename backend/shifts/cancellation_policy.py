"""Read-only, unapproved-for-charging external owner cancellation fee schedule.

This is an owner-selected product schedule, NOT authority to collect funds.
Australian unfair-contract-term and employment protections require review,
accepted terms and case-specific loss/compensation handling before activation.
"""
from decimal import Decimal, ROUND_HALF_UP
from datetime import timedelta

OWNER_FEE_RATES = (
    (timedelta(days=7), Decimal("0")),
    (timedelta(hours=72), Decimal("0")),
    (timedelta(hours=24), Decimal("10")),
    (timedelta(hours=12), Decimal("15")),
    (timedelta(hours=2), Decimal("20")),
    (timedelta(seconds=0), Decimal("25")),
)


def owner_cancellation_percentage(*, start_at, cancelled_at):
    """Proposed rate; exact boundaries use the less severe adjacent band."""
    lead = start_at - cancelled_at
    if lead <= timedelta(seconds=0):
        return Decimal("30")
    if lead >= timedelta(days=7):
        return Decimal("0")
    if lead >= timedelta(hours=72):
        return Decimal("0")
    if lead >= timedelta(hours=24):
        return Decimal("10")
    if lead >= timedelta(hours=12):
        return Decimal("15")
    if lead >= timedelta(hours=2):
        return Decimal("20")
    return Decimal("25")


def estimate_owner_cancellation_fee(*, affected_occurrences, cancelled_at):
    """Per-occurrence preview only; returns no authorization to charge.

    Each input is a mapping with aware 'start_at' and a frozen agreed
    'wages' Decimal; unrelated dates cannot be rolled into the base.
    """
    total = Decimal("0")
    detail = []
    for occurrence in affected_occurrences:
        start_at = occurrence["start_at"]
        wage = Decimal(str(occurrence["wages"]))
        if timezone_naive(start_at) or timezone_naive(cancelled_at):
            raise ValueError("Both timestamps must be timezone-aware")
        if wage < 0:
            raise ValueError("Wages must not be negative")
        pct = owner_cancellation_percentage(start_at=start_at, cancelled_at=cancelled_at)
        amount = (wage * pct / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total += amount
        detail.append({"start_at": start_at, "agreed_wages": wage, "percentage": pct, "preview_amount": amount})
    return {"preview_only": True, "currency": "AUD", "total": total, "occurrences": detail}


def timezone_naive(moment):
    return moment.utcoffset() is None
