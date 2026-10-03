"""Backward-compatible facade for the shifts.limits implementation."""
from shifts import limits as _impl
from shifts.limits import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
