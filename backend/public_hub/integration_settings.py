"""Isolated tests against real platform models. Never imports deployment settings.

syncdb here is for ephemeral tests only, not a production migration baseline.
"""
from .test_settings import *
from django.apps import AppConfig


class PlatformModels(AppConfig):
    name = 'client_profile'


INSTALLED_APPS = ['django.contrib.auth', 'django.contrib.contenttypes', 'django.contrib.sessions',
                 'django.contrib.messages', 'django.contrib.admin', 'rest_framework',
                 'users', 'public_hub.integration_settings.PlatformModels', 'billing', 'public_hub']
AUTH_USER_MODEL = 'users.User'
MIGRATION_MODULES = {name: None for name in ['auth', 'contenttypes', 'sessions', 'admin', 'users', 'client_profile', 'billing', 'public_hub']}
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
ROOT_URLCONF = 'public_hub.integration_urls'
REST_FRAMEWORK = {'DEFAULT_AUTHENTICATION_CLASSES': ['users.authentication.CookieJWTAuthentication']}
PUBLIC_COMMUNITY_ENABLED = True
FRONTEND_BASE_URL = 'http://testserver'
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
DEFAULT_FROM_EMAIL = 'test@example.test'
SECRET_KEY = 'integration-tests-only-never-production-at-least-32-characters'
MEDIA_ROOT = str(__import__('tempfile').gettempdir()) + '/chemisttasker-content-tests'
MEDIA_URL = '/media/'

from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
