"""Employment operations required by membership applications and notices.

Application composition binds these immutable services after model discovery.
This contract imports no feature implementation and performs no I/O.
"""
from dataclasses import dataclass
from typing import Callable

from django.core.exceptions import ImproperlyConfigured


@dataclass(frozen=True)
class EmploymentServices:
    worker_payment_profile_status: Callable
    create_engagement: Callable
    latest_engagement: Callable
    classification_options: Callable
    resolve_award_schedule: Callable


_services: EmploymentServices | None = None


def configure_employment_services(services: EmploymentServices) -> None:
    global _services
    _services = services


def employment_services() -> EmploymentServices:
    if _services is None:
        raise ImproperlyConfigured('Application startup must configure EmploymentServices.')
    return _services
