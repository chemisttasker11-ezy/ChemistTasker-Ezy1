"""Backward-compatible facade for the shifts.notifications implementation."""
from shifts import notifications as _impl
from shifts.notifications import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
