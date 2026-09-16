"""Local kiosk acceptance server; full migrated, disposable PostgreSQL only."""
from attendance_tests.migration_settings import *  # noqa: F403

DEBUG = True
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]
CORS_ALLOWED_ORIGINS = ["http://tauri.localhost", "tauri://localhost", "http://localhost:5173"]
CORS_ALLOW_HEADERS = [*CORS_ALLOW_HEADERS, "x-device-token"]  # noqa: F405
CSRF_TRUSTED_ORIGINS = ["http://tauri.localhost", "http://localhost:5173"]
CACHES = {"default": {
    "BACKEND": "django.core.cache.backends.filebased.FileBasedCache",
    "LOCATION": str(BASE_DIR.parent / ".local-run" / "kiosk-runtime-cache"),  # noqa: F405
}}
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_TIMEOUT = 20
CELERY_TASK_ALWAYS_EAGER = True
