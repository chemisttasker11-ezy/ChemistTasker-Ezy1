"""Backward-compatible facade for the shifts.counter_offers implementation."""
from shifts import counter_offers as _impl
from shifts.counter_offers import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
