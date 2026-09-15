"""Disposable in-memory settings for attendance model foundation tests only.

These settings never import ``core.settings`` and cannot select the configured
PostgreSQL database. Tests create only their explicitly listed tables.
"""

from pathlib import Path
from django.apps import AppConfig


class AttendanceClientProfileConfig(AppConfig):
    """Load the models without production signal/service side effects."""

    name = "client_profile"
    label = "client_profile"

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = "attendance-tests-only-never-production"
DEBUG = False
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "users.User"
ROOT_URLCONF = "client_profile.urls"

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "users.apps.UsersConfig",
    "attendance_tests.settings.AttendanceClientProfileConfig",
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# This module is opt-in and never invokes migrate. Disabling the unavailable
# legacy graphs makes that boundary explicit; the tests create selected tables
# directly with schema_editor and drop them after the suite.
MIGRATION_MODULES = {
    "users": None,
    "client_profile": None,
    "billing": None,
}

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
FRONTEND_BASE_URL = "http://localhost:3000"
