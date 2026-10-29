"""Membership services needed by identity adapters, bound by application composition.

Identity owns its wire projections. Membership management owns selection rules;
reads never manufacture directory rows; account conversion keeps its atomic writes.
"""
from dataclasses import dataclass
from typing import Callable

from django.core.exceptions import ImproperlyConfigured


@dataclass(frozen=True)
class MembershipServices:
    accepted_for_user: Callable
    directory_memberships: Callable
    convert_manager_account: Callable


_services: MembershipServices | None = None


def configure_membership_services(services: MembershipServices) -> None:
    global _services
    _services = services


def membership_services() -> MembershipServices:
    if _services is None:
        raise ImproperlyConfigured('Application URL composition must configure identity membership services.')
    return _services
