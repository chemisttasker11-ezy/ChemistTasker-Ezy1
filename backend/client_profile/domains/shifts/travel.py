"""Backward-compatible facade for the shifts.travel implementation."""
from shifts import travel as _impl
from shifts.travel import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
