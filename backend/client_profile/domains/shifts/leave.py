"""Backward-compatible facade for the shifts.leave implementation."""
from shifts import leave as _impl
from shifts.leave import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
