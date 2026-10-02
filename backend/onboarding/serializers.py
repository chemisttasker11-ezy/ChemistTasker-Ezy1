"""Backward-compatible onboarding serializers facade during ownership transition."""
from client_profile.domains.onboarding import serializers as _legacy
from client_profile.domains.onboarding.serializers import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_legacy, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_legacy)))
