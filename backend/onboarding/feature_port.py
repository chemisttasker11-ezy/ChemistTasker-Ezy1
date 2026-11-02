"""Synchronous feature operations required by onboarding verification workflows.

Application composition binds these immutable services after model discovery.
This contract imports no feature implementation and performs no I/O.
"""
from dataclasses import dataclass
from typing import Callable

from django.core.exceptions import ImproperlyConfigured


@dataclass(frozen=True)
class VerificationFeatures:
    shift_refusal_type: Callable
    is_public_shift: Callable
    is_public_shift_member_access: Callable
    require_public_shift_onboarding: Callable
    cancel_upcoming_assignments: Callable
    announce_bookings: Callable
    award_verified_referrals: Callable
    remove_newcomer_posts: Callable


_services: VerificationFeatures | None = None


def configure_verification_features(services: VerificationFeatures) -> None:
    global _services
    _services = services


def verification_features() -> VerificationFeatures:
    if _services is None:
        raise ImproperlyConfigured('Application startup must configure VerificationFeatures.')
    return _services
