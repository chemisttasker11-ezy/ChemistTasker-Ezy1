"""Backward-compatible facade for organizations.timezone."""
from organizations import timezone as _impl
from organizations.timezone import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
