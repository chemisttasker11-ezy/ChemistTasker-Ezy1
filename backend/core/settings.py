from pathlib import Path
import os
import socket
import ipaddress
from environ import Env
from datetime import timedelta
import dj_database_url
import sys
from celery.schedules import crontab



env = Env()
# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

ENV_FILE = os.environ.get("DJANGO_ENV_FILE")
if ENV_FILE:
    Env.read_env(ENV_FILE, overwrite=False)
elif os.environ.get("APP_ENV", "local").lower() in {"local", "dev", "development"}:
    Env.read_env(BASE_DIR.parent / "env" / "backend.dev.env", overwrite=False)

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = env('SECRET_KEY')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = env.bool("DEBUG", default=False)

ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
ALLOWED_HOSTS = [host.split(":", 1)[0].strip() for host in ALLOWED_HOSTS if host.strip()]


def _is_private_host(value: str) -> bool:
    try:
        return ipaddress.ip_address(value).is_private
    except ValueError:
        return value in {"localhost"}


def _detect_local_hosts() -> list[str]:
    hosts: set[str] = {"localhost", "127.0.0.1"}
    hostname = socket.gethostname().strip()
    fqdn = socket.getfqdn().strip()
    if hostname:
        hosts.add(hostname)
    if fqdn:
        hosts.add(fqdn)

    candidates = set()
    for name in filter(None, {hostname, fqdn, "localhost"}):
        try:
            _, _, ips = socket.gethostbyname_ex(name)
            candidates.update(ip.strip() for ip in ips if ip and ip.strip())
        except OSError:
            pass

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            candidates.add(sock.getsockname()[0])
    except OSError:
        pass

    for candidate in candidates:
        if _is_private_host(candidate):
            hosts.add(candidate)
    return sorted(hosts)


def _build_dev_origins(hosts: list[str]) -> list[str]:
    dev_ports = [3000, 3080, 5173, 5174, 5175, 5176, 5180, 19006, 8081, 8082]
    origins: set[str] = set()
    for host in hosts:
        for port in dev_ports:
            origins.add(f"http://{host}:{port}")
        origins.add(f"exp://{host}:8081")
        origins.add(f"exp://{host}:8082")
    return sorted(origins)


def _clean_env_list(name: str, default: list[str] | None = None) -> list[str]:
    return [value.strip() for value in env.list(name, default=default or []) if value.strip()]

# Only send cookies when they’re on an explicitly allowed origin:
CORS_ALLOW_CREDENTIALS = True

if DEBUG:
    # Dev-only auto-detection for localhost + current private/LAN addresses.
    _dev_hosts = sorted(set(_detect_local_hosts() + ALLOWED_HOSTS))
    ALLOWED_HOSTS = ["*"]
    CORS_ALLOWED_ORIGINS = _build_dev_origins(_dev_hosts)
    CSRF_TRUSTED_ORIGINS = sorted(set(
        _clean_env_list("CSRF_TRUSTED_ORIGINS", default=[]) + CORS_ALLOWED_ORIGINS
    ))
else:
    CORS_ALLOWED_ORIGINS = _clean_env_list("CORS_ALLOWED_ORIGINS")
    CSRF_TRUSTED_ORIGINS = _clean_env_list("CSRF_TRUSTED_ORIGINS", default=CORS_ALLOWED_ORIGINS)

FRONTEND_BASE_URL = env("FRONTEND_BASE_URL", default="http://localhost:5173")

BACKEND_BASE_URL = env("BACKEND_BASE_URL", default="http://127.0.0.1:8000")

ADMIN_URL = env("ADMIN_URL")

CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
    'x-client-platform',
]


# Application definition
INSTALLED_APPS = [
    'public_hub',
    'marketplace',
    'ethical_marketplace',

    'daphne',

    'django.contrib.admin',
    'django_otp',
    'django_otp.plugins.otp_totp',
    'django_otp.plugins.otp_static',
    'two_factor',
    'axes',

    "users.apps.UsersConfig",
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'drf_spectacular',
    'corsheaders',

    # Azure blob
    'storages',

    # my apps
    "client_profile.apps.ClientProfileConfig",
    "workforce.apps.WorkforceConfig",
    "worker_finance.apps.WorkerFinanceConfig",

    # Realtime
    'channels',

    'billing',

]



# Redis URLs are split by responsibility so production can isolate queues,
# websocket channels, and other lightweight apps on the same Redis server.
# Examples:
#   Local dev: redis://127.0.0.1:6379/0
#   Azure Cache for Redis (TLS): rediss://:<PASSWORD>@<NAME>.redis.cache.windows.net:6380/0
REDIS_URL = env("REDIS_URL", default="redis://127.0.0.1:6379/0")
CHANNEL_REDIS_URL = env("CHANNEL_REDIS_URL", default=REDIS_URL)

# Security attempt counters must be shared by every web worker. Keep the
# application's existing default cache unchanged to avoid altering other flows.
_security_cache_url = env("DJANGO_CACHE_URL", default="")
if os.environ.get("APP_ENV", "local").lower() not in {"local", "dev", "development", "test"} and not _security_cache_url:
    raise RuntimeError("DJANGO_CACHE_URL is required for shared security attempt limits")
CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"},
    "security": (
        {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": _security_cache_url}
        if _security_cache_url
        else {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "security-local"}
    ),
}

# Celery handles all asynchronous task execution.
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default=REDIS_URL)
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default=CELERY_BROKER_URL)
CELERY_TASK_DEFAULT_QUEUE = env("CELERY_TASK_DEFAULT_QUEUE", default="default")
CELERY_WORKER_PREFETCH_MULTIPLIER = env.int("CELERY_WORKER_PREFETCH_MULTIPLIER", default=1)
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=DEBUG)
CELERY_RESULT_EXPIRES = env.int("CELERY_RESULT_EXPIRES", default=3600)
CELERY_TASK_IGNORE_RESULT = env.bool("CELERY_TASK_IGNORE_RESULT", default=True)
CELERY_TASK_TRACK_STARTED = env.bool("CELERY_TASK_TRACK_STARTED", default=True)
CELERY_TASK_SERIALIZER = env("CELERY_TASK_SERIALIZER", default="json")
CELERY_RESULT_SERIALIZER = env("CELERY_RESULT_SERIALIZER", default="json")
CELERY_ACCEPT_CONTENT = _clean_env_list("CELERY_ACCEPT_CONTENT", default=["json"])
CELERY_IMPORTS = ("client_profile.calendar_tasks", "marketplace.tasks", "ethical_marketplace.tasks", "workforce.tasks")
EMAIL_TASK_RATE_LIMIT = env("EMAIL_TASK_RATE_LIMIT", default="30/m")

# Marketplace capabilities are independently reversible. Public reads are safe to
# enable at deploy; every action still passes object-level policy checks.
MARKETPLACE_READ_ENABLED = env.bool("MARKETPLACE_READ_ENABLED", default=True)
MARKETPLACE_NEW_LISTINGS_ENABLED = env.bool("MARKETPLACE_NEW_LISTINGS_ENABLED", default=False)
MARKETPLACE_CONTACT_ENABLED = env.bool("MARKETPLACE_CONTACT_ENABLED", default=False)
MARKETPLACE_NEW_COMMITMENTS_ENABLED = env.bool("MARKETPLACE_NEW_COMMITMENTS_ENABLED", default=False)
MARKETPLACE_ESCALATION_ENABLED = env.bool("MARKETPLACE_ESCALATION_ENABLED", default=False)
MARKETPLACE_CATALOGUE_LOOKUP_ENABLED = env.bool("MARKETPLACE_CATALOGUE_LOOKUP_ENABLED", default=False)
MARKETPLACE_ALL_WRITES_ENABLED = env.bool("MARKETPLACE_ALL_WRITES_ENABLED", default=True)

ETHICAL_ACCESS_APPLICATIONS_ENABLED = env.bool("ETHICAL_ACCESS_APPLICATIONS_ENABLED", default=True)
ETHICAL_PRIVATE_READ_ENABLED = env.bool("ETHICAL_PRIVATE_READ_ENABLED", default=False)
ETHICAL_INVENTORY_ENABLED = env.bool("ETHICAL_INVENTORY_ENABLED", default=False)
ETHICAL_NEW_TRANSFERS_ENABLED = env.bool("ETHICAL_NEW_TRANSFERS_ENABLED", default=False)
ETHICAL_ESCALATION_ENABLED = env.bool("ETHICAL_ESCALATION_ENABLED", default=False)
ETHICAL_S8_ENABLED = env.bool("ETHICAL_S8_ENABLED", default=False)
CELERY_TASK_ROUTES = {
    "users.tasks.send_email_task": {"queue": "email"},
    "client_profile.tasks.run_all_verifications": {"queue": "default"},
    "client_profile.tasks.final_evaluation": {"queue": "default"},
    "client_profile.tasks.send_shift_reminders": {"queue": "notifications"},
    "client_profile.tasks.run_referee_reminder": {"queue": "notifications"},
    "client_profile.tasks.email_membership_application_submitted": {"queue": "notifications"},
    "client_profile.tasks.email_membership_application_approved": {"queue": "notifications"},
    "client_profile.notifications.*": {"queue": "notifications"},
    "client_profile.tasks.verify_*": {"queue": "ocr"},
    "billing.tasks.*": {"queue": "billing"},
}
CELERY_BEAT_SCHEDULE = {
    'publish-editorial-revisions': {
        'task': 'public_hub.tasks.publish_scheduled_content',
        'schedule': 60.0,
    },
    "calendar-birthdays-daily": {
        "task": "client_profile.calendar_tasks.generate_all_birthday_events",
        "schedule": crontab(hour=0, minute=15),
        "options": {"queue": "notifications"},
    },
    "calendar-work-notes-hourly": {
        "task": "client_profile.calendar_tasks.send_shift_start_work_note_notifications",
        "schedule": crontab(minute=5),
        "options": {"queue": "notifications"},
    },
    "calendar-work-notes-9am-fallback": {
        "task": "client_profile.calendar_tasks.send_9am_work_note_fallback",
        "schedule": crontab(minute=10),
        "options": {"queue": "notifications"},
    },
    "shift-reminders-hourly": {
        "task": "client_profile.tasks.send_shift_reminders",
        "schedule": crontab(minute=15),
        "options": {"queue": "notifications"},
    },
}


MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'core.security.ContentSecurityPolicyMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django_otp.middleware.OTPMiddleware',
    'axes.middleware.AxesMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

AUTH_USER_MODEL = 'users.User'

AUTHENTICATION_BACKENDS = [
     'axes.backends.AxesStandaloneBackend',
     'users.authentication.EmailBackend',
     'django.contrib.auth.backends.ModelBackend',
]

LOGIN_URL = "/account/login/"
LOGIN_REDIRECT_URL = "/"

AXES_ENABLED = env.bool("AXES_ENABLED", default=True)
AXES_FAILURE_LIMIT = env.int("AXES_FAILURE_LIMIT", default=5)
AXES_COOLOFF_TIME = timedelta(hours=1)
AXES_RESET_ON_SUCCESS = True
AXES_LOCKOUT_PARAMETERS = [["username", "ip_address"]]

REST_FRAMEWORK = {
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'users.authentication.CookieJWTAuthentication',
    ),
    # Fail closed by default. Public endpoints must explicitly opt in with AllowAny.
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.ScopedRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': '1000/day',
        'user': '5000/day',
        'otp_verify': '10/minute',
        'otp_resend': '5/minute',
        'password_reset': '5/hour',
        'mobile_otp_request': '10/minute',
        'mobile_otp_verify': '10/minute',
        'mobile_otp_resend': '5/minute',
        'contact_form': '5/hour',
        'pill_referral_create': '20/hour',
        'pill_referral_claim': '20/hour',
        'pill_payment': '30/hour',
        'marketplace_enquiry': '20/hour',
        'marketplace_message': '60/hour',
        'marketplace_report': '10/hour',
        'ethical_transfer': '20/hour',
        'ethical_message': '60/hour',
    },
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50
}

# Spectacular
SPECTACULAR_SETTINGS = {
    'TITLE': 'Pharmacy Job Platform API',
    'DESCRIPTION': 'API for a two-sided job platform connecting pharmacy owners and pharmacists',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False
    }

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [
            os.path.join(BASE_DIR, "templates"),

        ],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'


# Database
# https://docs.djangoproject.com/en/5.1/ref/settings/#databases

PROD_DB = env("PROD_DB", default=env("DATABASE_URL", default=""))
USE_PROD_DB = env.bool("USE_PROD_DB", default=bool(PROD_DB))

if USE_PROD_DB and PROD_DB:
    DATABASES = {
        "default": dj_database_url.parse(
            PROD_DB,
            conn_max_age=600,
            ssl_require=True,
        )
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("LOCAL_DB_NAME", default="chemisttasker"),
            "USER": env("LOCAL_DB_USER", default="postgres"),
            "PASSWORD": env("LOCAL_DB_PASSWORD", default=""),
            "HOST": env("LOCAL_DB_HOST", default="127.0.0.1"),
            "PORT": env("LOCAL_DB_PORT", default="5432"),
        }
    }


# Password validation
# https://docs.djangoproject.com/en/5.1/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.1/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'Australia/Sydney'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.1/howto/static-files/

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedStaticFilesStorage'

# Default primary key field type
# https://docs.djangoproject.com/en/5.1/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Base security defaults should remain safe even if deployment.py is not loaded.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=not DEBUG)
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=0 if DEBUG else 31536000)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env.bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", default=not DEBUG)
SECURE_HSTS_PRELOAD = env.bool("SECURE_HSTS_PRELOAD", default=not DEBUG)
SECURE_BROWSER_XSS_FILTER = env.bool("SECURE_BROWSER_XSS_FILTER", default=True)
X_FRAME_OPTIONS = env("X_FRAME_OPTIONS", default="DENY")
SECURE_REFERRER_POLICY = env("SECURE_REFERRER_POLICY", default="same-origin")
SECURE_CONTENT_TYPE_NOSNIFF = env.bool("SECURE_CONTENT_TYPE_NOSNIFF", default=True)
BACKEND_CSP_POLICY = env(
    "BACKEND_CSP_POLICY",
    default=(
        "default-src 'self'; "
        "script-src 'self' https://cdnjs.cloudflare.com; "
        "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
        "img-src 'self' data: https://*.blob.core.windows.net; "
        "font-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "form-action 'self';"
    ),
)

# JWT settings for better frontend integration
SIMPLE_JWT = {
    # Short‑lived access token
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=env.int('JWT_ACCESS_TOKEN_MINUTES', default=30)),
    # Longer‑lived refresh token
    'REFRESH_TOKEN_LIFETIME': timedelta(days=90),
    # Issue a new refresh token each time /refresh/ is called
    'ROTATE_REFRESH_TOKENS': True,
    # Blacklist old refresh tokens—prevents reuse
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'ALGORITHM': 'HS256',
}

JWT_REMEMBER_ME_REFRESH_TOKEN_LIFETIME = timedelta(
    days=env.int("JWT_REMEMBER_ME_REFRESH_TOKEN_DAYS", default=7)
)

# HttpOnly JWT cookie settings for web clients
JWT_AUTH_COOKIE = env("JWT_AUTH_COOKIE", default="ct_access")
JWT_REFRESH_COOKIE = env("JWT_REFRESH_COOKIE", default="ct_refresh")
JWT_COOKIE_SECURE = env.bool("JWT_COOKIE_SECURE", default=not DEBUG)
JWT_COOKIE_SAMESITE = env("JWT_COOKIE_SAMESITE", default="None" if not DEBUG else "Lax")
JWT_COOKIE_PATH = env("JWT_COOKIE_PATH", default="/")

# Session/CSRF cookie defaults should stay secure even outside deployment.py.
SESSION_COOKIE_SECURE = env.bool("SESSION_COOKIE_SECURE", default=not DEBUG)
CSRF_COOKIE_SECURE = env.bool("CSRF_COOKIE_SECURE", default=not DEBUG)
SESSION_COOKIE_HTTPONLY = env.bool("SESSION_COOKIE_HTTPONLY", default=True)
CSRF_COOKIE_HTTPONLY = env.bool("CSRF_COOKIE_HTTPONLY", default=False)
SESSION_COOKIE_SAMESITE = env("SESSION_COOKIE_SAMESITE", default="Lax")
CSRF_COOKIE_SAMESITE = env("CSRF_COOKIE_SAMESITE", default="Lax")


MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

_azure_storage_required = [
    env("AZURE_ACCOUNT_NAME", default="").strip(),
    env("AZURE_ACCOUNT_KEY", default="").strip(),
    env("AZURE_CONTAINER", default="").strip(),
]
USE_AZURE_STORAGE = env.bool(
    "USE_AZURE_STORAGE",
    default=not DEBUG and all(_azure_storage_required),
)

if USE_AZURE_STORAGE:
    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.azure_storage.AzureStorage",
            "OPTIONS": {
                "account_name": env("AZURE_ACCOUNT_NAME"),
                "account_key": env("AZURE_ACCOUNT_KEY"),
                "azure_container": env("AZURE_CONTAINER"),
                "azure_ssl": True,
                "overwrite_files": False,
                "expiration_secs": env.int("AZURE_STORAGE_EXPIRATION_SECS", default=3600),
            },
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
        },
    }
    MEDIA_URL = (
        f"https://{env('AZURE_ACCOUNT_NAME')}"
        f".blob.core.windows.net/{env('AZURE_CONTAINER')}/"
    )



LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[%(levelname)s %(asctime)s %(process)d] %(name)s %(message)s',
            'datefmt': "%Y-%m-%d %H:%M:%S",
        },
        'simple': {
            'format': '[%(levelname)s] %(name)s: %(message)s'
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
            'stream': sys.stdout,
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        # Your app modules
        'client_profile': {
            'handlers': ['console'],
            'level': env("APP_LOG_LEVEL", default="INFO"),
            'propagate': False,
        },
        'users': {
            'handlers': ['console'],
            'level': env("APP_LOG_LEVEL", default="INFO"),
            'propagate': False,
        },
    }
}


EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.zoho.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = env('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = env('EMAIL_HOST_PASSWORD')
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL')
SUPPORT_EMAIL = env('SUPPORT_EMAIL', default=DEFAULT_FROM_EMAIL)


# RECAPTCHA
RECAPTCHA_SECRET_KEY = env('RECAPTCHA_SECRET_KEY')

AZURE_OCR_ENDPOINT=env('AZURE_OCR_ENDPOINT')
AZURE_OCR_KEY=env('AZURE_OCR_KEY')

SCRAPINGBEE_API_KEY=env('SCRAPINGBEE_API_KEY')


# MobileMessage SMS Settings
MOBILEMESSAGE_USERNAME = env('MOBILEMESSAGE_USERNAME')
MOBILEMESSAGE_PASSWORD = env('MOBILEMESSAGE_PASSWORD')
MOBILEMESSAGE_SENDER = env('MOBILEMESSAGE_SENDER')

MOBILE_LATEST_VERSION = env("MOBILE_LATEST_VERSION", default="1.0.11")
MOBILE_MINIMUM_SUPPORTED_VERSION = env("MOBILE_MINIMUM_SUPPORTED_VERSION", default="1.0.10")
MOBILE_ANDROID_STORE_URL = env(
    "MOBILE_ANDROID_STORE_URL",
    default="https://play.google.com/store/apps/details?id=com.chemisttasker.app",
)
MOBILE_IOS_STORE_URL = env(
    "MOBILE_IOS_STORE_URL",
    default="https://apps.apple.com/app/chemisttasker/id6759088580",
)

# Stripe Settings
STRIPE_SECRET_KEY = env('STRIPE_SECRET_KEY', default='')
STRIPE_WEBHOOK_SECRET = env('STRIPE_WEBHOOK_SECRET', default='')

# Billing Honeymoon & Free Trial
# Change BILLING_LIVE_DATE to enable payments. Before this date nobody is charged.
from datetime import date as _date
BILLING_LIVE_DATE = _date(2025, 6, 1)   # June 1, 2026 — flip this to go live
FREE_TRIAL_DAYS   = 0                   # New users get this many days free after live date


# ---------------------------------------------------------------------
# Channels (ASGI) configuration
# ---------------------------------------------------------------------
ASGI_APPLICATION = "core.asgi.application"

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            # channels_redis accepts URLs with redis:// or rediss:// (TLS)
            "hosts": [CHANNEL_REDIS_URL],
            # Increase TTLs so room membership doesn’t expire while users sit in a chat
            "capacity": 100,
            "channel_capacity": {"*": 50},
            # Message TTL (seconds) on a channel; keep modest
            "expiry": 600,
            # Group membership TTL (seconds) – was 60, causing members to drop after 1 min
            "group_expiry": 3600,
        },
    }
}

# Local/dev fallback: if Redis is not available, websocket connections fail.
# Defaults:
# - DEBUG=True  -> in-memory layer (no Redis dependency)
# - DEBUG=False -> Redis layer
USE_REDIS_CHANNEL_LAYER = env.bool("USE_REDIS_CHANNEL_LAYER", default=not DEBUG)
if not USE_REDIS_CHANNEL_LAYER:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }

# Anonymous community publication is available in local DEBUG sessions while
# production deployments still require an explicit opt-in.
PUBLIC_COMMUNITY_ENABLED = env.bool("PUBLIC_COMMUNITY_ENABLED", default=DEBUG)
