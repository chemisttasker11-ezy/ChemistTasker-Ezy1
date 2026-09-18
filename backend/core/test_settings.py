"""Isolated fast settings for unit/API checks using the real migration graph.

The local development database is separate from production, so tests must keep
the custom ``users.User`` model and its migrations in the schema they exercise.
"""
from .settings import *  # noqa: F403

DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
AXES_ENABLED = False
CELERY_TASK_ALWAYS_EAGER = True
