"""Shift-owned lifecycle events consumed by other installed domains."""
from django.dispatch import Signal


# Sent inside the activation transaction, after assignment settlement is updated.
# Receivers must persist invalidation now and defer background work until commit.
payroll_activated = Signal()
