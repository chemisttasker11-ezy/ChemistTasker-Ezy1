"""Membership API facade during ownership transition."""
from client_profile.domains.memberships import views as _legacy
from client_profile.domains.memberships.views import *  # noqa: F401,F403


def __getattr__(name):
    return getattr(_legacy, name)


def __dir__():
    return sorted(set(globals()) | set(dir(_legacy)))
