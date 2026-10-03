"""Backward-compatible facade for onboarding.serializers."""
from onboarding import serializers as _impl
from onboarding.serializers import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
