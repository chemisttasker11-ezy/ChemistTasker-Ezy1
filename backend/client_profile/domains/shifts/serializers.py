"""Backward-compatible facade for the shifts.serializers implementation."""
from shifts import serializers as _impl
from shifts.serializers import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
