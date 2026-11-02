"""Feature projections and signup/deletion operations required by identity.

Application composition binds these immutable services after model discovery.
This contract imports no feature implementation and performs no I/O.
"""
from dataclasses import dataclass
from typing import Callable

from django.core.exceptions import ImproperlyConfigured


@dataclass(frozen=True)
class UserFeatures:
    is_billing_active: Callable
    is_in_free_trial: Callable
    content_capabilities: Callable
    member_hubs: Callable
    claim_signup_referral: Callable
    delete_talent_posts: Callable


_services: UserFeatures | None = None


def configure_user_features(services: UserFeatures) -> None:
    global _services
    _services = services


def user_features() -> UserFeatures:
    if _services is None:
        raise ImproperlyConfigured('Application startup must configure UserFeatures.')
    return _services
