"""Backward-compatible role-label imports."""
from memberships.labels import membership_role_label
from users.role_labels import (
    OTHER_STAFF_ROLE_LABELS,
    other_staff_role_label,
    user_work_role_label,
)

__all__ = [
    "OTHER_STAFF_ROLE_LABELS",
    "other_staff_role_label",
    "user_work_role_label",
    "membership_role_label",
]
