# For local AHPRA e2e only.
import hashlib
import os
import tempfile
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

from .settings import *  # noqa: F403

DATABASES = {"default": {
    "ENGINE": "django.db.backends.sqlite3",
    "NAME": os.environ.get("AHPRA_E2E_DB", str(Path(tempfile.gettempdir()) / "ahpra_e2e.sqlite3")),
    "OPTIONS": {"timeout": 30},  # Daphne and the seed command write to the same file at once
}}
CHANNEL_LAYERS = {"default": {
    "BACKEND": "channels_redis.core.RedisChannelLayer",
    "CONFIG": {"hosts": [os.environ.get("AHPRA_E2E_REDIS", "redis://127.0.0.1:6379/9")]},
}}
AHPRA_SOURCE = "desktop"
if not os.environ.get("AHPRA_E2E_TOKEN"):
    raise ImproperlyConfigured("AHPRA_E2E_TOKEN is required for local AHPRA e2e")
AHPRA_VERIFIER_TOKEN_SHA256 = hashlib.sha256(os.environ["AHPRA_E2E_TOKEN"].encode()).hexdigest()
CELERY_TASK_ALWAYS_EAGER = True
DEBUG = True
SECURE_SSL_REDIRECT = False
ALLOWED_HOSTS = ["127.0.0.1", "localhost"]
