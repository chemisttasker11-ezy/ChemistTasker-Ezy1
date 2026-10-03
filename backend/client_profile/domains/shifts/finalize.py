"""Backward-compatible facade for the shifts.finalize implementation."""
from shifts import finalize as _impl
from shifts.finalize import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
