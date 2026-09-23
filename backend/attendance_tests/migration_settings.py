"""Full production migration graph using only an explicitly named local test DB."""
import os
from core.settings import *  # noqa: F403

test_name = os.environ.get("KIOSK_TEST_DB_NAME", "")
if not test_name.startswith("chemisttasker_kiosk_test_"):
    raise RuntimeError("Explicit disposable KIOSK_TEST_DB_NAME required")
DATABASES = {"default": {
    "ENGINE": "django.db.backends.postgresql",
    "NAME": test_name,
    "HOST": "127.0.0.1",
    "PORT": os.environ.get("LOCAL_DB_PORT", "5432"),
    "USER": os.environ.get("LOCAL_DB_USER", "postgres"),
    "PASSWORD": os.environ.get("LOCAL_DB_PASSWORD", ""),
}}
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
    "security": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "kiosk-migration-tests"},
}
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
