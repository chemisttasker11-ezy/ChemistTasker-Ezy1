"""Backward-compatible facade for organizations.access."""
from organizations import access as _impl
from organizations.access import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
