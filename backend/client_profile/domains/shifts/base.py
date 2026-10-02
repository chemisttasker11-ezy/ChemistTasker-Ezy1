"""Backward-compatible facade for the shifts.base implementation."""
from shifts import base as _impl
from shifts.base import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
