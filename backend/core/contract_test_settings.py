"""Hermetic settings for shared-core/backend contract tests and CI."""

from .settings import *  # noqa: F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
CELERY_TASK_ALWAYS_EAGER = True
CACHES = {**CACHES, **{name: {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': name}
    for name in ('ahpra', 'verifier_presence')}}

# Test client requests are HTTP in CI; do not redirect them before endpoint assertions.
SECURE_SSL_REDIRECT = False

# Provider calls in contract tests are captured; a nonfunctional key explicitly selects test mode.
STRIPE_SECRET_KEY = "sk_test_disposablecontractonly"

BILLING_LIVE_SHIFT_FULFILLMENT_ENABLED = False
BILLING_LIVE_SHIFT_PENALTY_ENABLED = False
