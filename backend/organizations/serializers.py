"""Backward-compatible organization-domain facade during ownership transition."""
from client_profile.domains.orgs import serializers as _legacy
from client_profile.domains.orgs.serializers import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_legacy, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_legacy)))
