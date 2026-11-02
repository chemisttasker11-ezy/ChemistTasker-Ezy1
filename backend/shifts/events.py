"""Shift-owned lifecycle events consumed by other installed domains."""
from django.dispatch import Signal


# Sent inside the activation transaction, after assignment settlement is updated.
# Receivers may refuse a locked period; otherwise persist invalidation now and
# defer background work until commit. The producer must roll back refusals.
payroll_activated = Signal()

# Billing may refuse another payment route while a card checkout can collect.
before_fulfillment = Signal()

# Sent inside the model save transaction before settlement-linked assignment inputs change.
assignment_changing = Signal()
