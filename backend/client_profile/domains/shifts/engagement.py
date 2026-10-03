"""Backward-compatible facade for the shifts.engagement implementation."""
from shifts import engagement as _impl
from shifts.engagement import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
