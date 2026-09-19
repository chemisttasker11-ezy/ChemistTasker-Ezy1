"""PostgreSQL-backed test settings for lock/constraint concurrency checks."""

import os

from .contract_test_settings import *  # noqa: F403,F401

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("LOCAL_DB_NAME", "chemisttasker_ci"),
        "USER": os.environ.get("LOCAL_DB_USER", "postgres"),
        "PASSWORD": os.environ.get("LOCAL_DB_PASSWORD", "postgres"),
        "HOST": os.environ.get("LOCAL_DB_HOST", "127.0.0.1"),
        "PORT": os.environ.get("LOCAL_DB_PORT", "5432"),
        "CONN_MAX_AGE": 0,
    }
}
