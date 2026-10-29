"""Operations the organisation API needs from membership management.

The application composition root supplies the membership implementation. This
port imports no membership model, controller or service and performs no I/O.
"""
from dataclasses import dataclass
from typing import Callable

from django.core.exceptions import ImproperlyConfigured


@dataclass(frozen=True)
class MembershipOperations:
    link_owner: Callable
    bootstrap_contact: Callable
    pending_admin_invitations: Callable
    accept_admin_invitation: Callable
    reject_admin_invitation: Callable
    admin_queryset: Callable
    create_admin: Callable
    revoke_admin: Callable
    chain_add_user: Callable
    chain_remove_user: Callable


_operations: MembershipOperations | None = None


def configure_membership_operations(operations: MembershipOperations) -> None:
    global _operations
    _operations = operations


def membership_operations() -> MembershipOperations:
    if _operations is None:
        raise ImproperlyConfigured('The application URL composition must configure membership operations.')
    return _operations
