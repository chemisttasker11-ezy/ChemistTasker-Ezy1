"""Backward-compatible facade for organizations.claims."""
from organizations import claims as _impl
from organizations.claims import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
