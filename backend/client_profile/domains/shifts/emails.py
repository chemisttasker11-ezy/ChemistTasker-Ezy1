"""Backward-compatible facade for the shifts.emails implementation."""
from shifts import emails as _impl
from shifts.emails import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
