"""Shift-owned lifecycle events consumed by other installed domains."""
from django.dispatch import Signal


# Sent inside the activation transaction, after assignment settlement is updated.
# Receivers may refuse a locked period; otherwise persist invalidation now and
# defer background work until commit. The producer must roll back refusals.
payroll_activated = Signal()
