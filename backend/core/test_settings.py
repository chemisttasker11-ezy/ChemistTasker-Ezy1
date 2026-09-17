"""Isolated fast test settings for unit/API checks.

The production migration ledger remains authoritative. This module exists because
the repository's pre-existing squashed users/client_profile migrations contain a
circular state dependency that prevents a clean temporary database bootstrap.
"""
from .settings import *  # noqa: F403

DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
AXES_ENABLED = False
CELERY_TASK_ALWAYS_EAGER = True
MIGRATION_MODULES = {
    "users": None,
    "client_profile": None,
    "billing": None,
    "public_hub": None,
    "marketplace": None,
    "ethical_marketplace": None,
    "workforce": None,
}
