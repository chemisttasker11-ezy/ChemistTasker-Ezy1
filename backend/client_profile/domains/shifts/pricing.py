"""Backward-compatible facade for the shifts.pricing implementation."""
from shifts import pricing as _impl
from shifts.pricing import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
