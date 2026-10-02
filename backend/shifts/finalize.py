"""Shift-domain facade for the legacy implementation module."""
from client_profile.domains.shifts import finalize as _legacy
from client_profile.domains.shifts.finalize import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_legacy, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_legacy)))
