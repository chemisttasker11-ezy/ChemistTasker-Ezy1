"""Store-facing calendar, workforce authority and protected deletion operations.

Application composition binds these immutable services after model discovery.
This contract imports no feature implementation and performs no I/O.
"""
from dataclasses import dataclass
from typing import Callable

from django.core.exceptions import ImproperlyConfigured


@dataclass(frozen=True)
class PharmacyFeatures:
    full_day_public_holidays: Callable
    part_day_public_holidays: Callable
    holiday_calendar_status: Callable
    region_details: Callable
    pricing_data_error: Callable
    can_manage_roster_pharmacy: Callable
    protect_pharmacy_shift_deletion: Callable


_services: PharmacyFeatures | None = None


def configure_pharmacy_features(services: PharmacyFeatures) -> None:
    global _services
    _services = services


def pharmacy_features() -> PharmacyFeatures:
    if _services is None:
        raise ImproperlyConfigured('Application startup must configure PharmacyFeatures.')
    return _services
