"""Disposable local browser acceptance settings; never reads the local env file."""
import os
from pathlib import Path

if os.environ.get("APP_ENV") != "test" or not os.environ.get("E2E_TEST_ROOT"):
    raise RuntimeError("E2E acceptance requires APP_ENV=test and an isolated E2E_TEST_ROOT")

from .contract_test_settings import *  # noqa: E402,F403

_root = Path(os.environ["E2E_TEST_ROOT"]).resolve()
if _root.parent.name != "authenticated" or _root.parent.parent.name != ".e2e":
    raise RuntimeError("Acceptance database must be inside .e2e/authenticated/<run>")
DEBUG = True
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]
DATABASES = {"default": {
    "ENGINE": "django.db.backends.sqlite3", "NAME": str(_root / "database.sqlite3"),
    # Disposable data only: avoid durable journal writes through a Docker Desktop bind mount.
    "OPTIONS": {"init_command": "PRAGMA journal_mode=MEMORY; PRAGMA synchronous=OFF;"},
}}
CSRF_TRUSTED_ORIGINS = os.environ["E2E_TEST_ORIGINS"].split(",")
CORS_ALLOWED_ORIGINS = CSRF_TRUSTED_ORIGINS
JWT_COOKIE_SECURE = SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = False
JWT_COOKIE_SAMESITE = "Lax"
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
CELERY_BROKER_URL = "memory://"
CELERY_RESULT_BACKEND = "cache+memory://"
MEDIA_ROOT = str(_root / "media")
