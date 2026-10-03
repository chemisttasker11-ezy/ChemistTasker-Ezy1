"""Backward-compatible facade for onboarding.emails."""
from onboarding import emails as _impl
from onboarding.emails import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
