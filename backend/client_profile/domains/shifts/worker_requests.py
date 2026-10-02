"""Backward-compatible facade for the shifts.worker_requests implementation."""
from shifts import worker_requests as _impl
from shifts.worker_requests import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
