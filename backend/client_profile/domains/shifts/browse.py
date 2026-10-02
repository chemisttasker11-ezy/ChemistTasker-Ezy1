"""Backward-compatible facade for the shifts.browse implementation."""
from shifts import browse as _impl
from shifts.browse import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
