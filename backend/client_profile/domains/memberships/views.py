"""Backward-compatible facade for memberships.views."""
from memberships import views as _impl
from memberships.views import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_impl, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_impl)))
