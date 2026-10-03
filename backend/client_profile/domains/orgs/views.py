"""Backward-compatible facade for organizations.views."""
from organizations import views as _impl
from organizations.views import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
