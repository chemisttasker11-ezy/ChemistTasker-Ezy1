"""Guarded PostgreSQL settings for kiosk migration and concurrency checks."""

import os

from attendance_tests.settings import *  # noqa: F403


database_name = os.environ.get("KIOSK_TEST_DB_NAME", "")
if not database_name.startswith("chemisttasker_kiosk_test_"):
    raise RuntimeError(
        "KIOSK_TEST_DB_NAME must start with 'chemisttasker_kiosk_test_'"
    )

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": database_name,
        "USER": os.environ.get("LOCAL_DB_USER", "postgres"),
        "PASSWORD": os.environ.get("LOCAL_DB_PASSWORD", ""),
        "HOST": os.environ.get("LOCAL_DB_HOST", "127.0.0.1"),
        "PORT": os.environ.get("LOCAL_DB_PORT", "5432"),
        "CONN_MAX_AGE": 0,
    }
}
