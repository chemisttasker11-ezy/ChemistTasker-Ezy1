from pathlib import Path
import os
import ssl
import socket
import ipaddress
from environ import Env
from datetime import timedelta
import dj_database_url
import sys
import urllib.parse



env = Env()
Env.read_env(Path(__file__).resolve().parent / ".env.local", overwrite=True)
# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

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
    dev_ports = [5173, 5174, 5175, 5176, 19006, 8081]
    origins: set[str] = set()
    for host in hosts:
        for port in dev_ports:
            origins.add(f"http://{host}:{port}")
        origins.add(f"exp://{host}:8081")
    return sorted(origins)

# Only send cookies when they’re on an explicitly allowed origin:
CORS_ALLOW_CREDENTIALS = True

if DEBUG:
    # Dev-only auto-detection for localhost + current private/LAN addresses.
    _dev_hosts = sorted(set(_detect_local_hosts() + ALLOWED_HOSTS))
    ALLOWED_HOSTS = ["*"]
    CORS_ALLOWED_ORIGINS = _build_dev_origins(_dev_hosts)
else:
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:5176",
        "http://127.0.0.1:5176",
        "http://localhost:19006",
        "http://127.0.0.1:19006",
        "http://localhost:8081",
    ]

CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS

FRONTEND_BASE_URL = "http://localhost:5173"

BACKEND_BASE_URL = "http://127.0.0.1:8000"

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

    'daphne',

    'django.contrib.admin',
    'django_otp',
    'django_otp.plugins.otp_totp',
    'django_otp.plugins.otp_static',
    'two_factor',
    'axes',
    # Async tasks
    'django_q',

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
    "public_hub.apps.PublicHubConfig",

    # Realtime
    'channels',

    'billing',

]



# Use a single REDIS_URL env var everywhere
# Examples:
#   Local dev: redis://127.0.0.1:6379/0
#   Azure Cache for Redis (TLS): rediss://:<PASSWORD>@<NAME>.redis.cache.windows.net:6380/0
REDIS_URL = env("REDIS_URL", default="redis://127.0.0.1:6379/0")

# Parse the REDIS_URL to get connection details dynamically
_redis_url = urllib.parse.urlparse(REDIS_URL)
_redis_is_ssl = _redis_url.scheme == "rediss"
_redis_port = _redis_url.port or (6380 if _redis_is_ssl else 6379)
_redis_options = {
    'host': _redis_url.hostname or '127.0.0.1',
    'port': _redis_port,
    'db': int(_redis_url.path.strip('/')) if _redis_url.path and _redis_url.path != '/' else 0,
    'password': _redis_url.password,
}
if _redis_is_ssl:
    _redis_options.update({
        'ssl': True,
        'ssl_cert_reqs': {
            "none": ssl.CERT_NONE,
            "optional": ssl.CERT_OPTIONAL,
            "required": ssl.CERT_REQUIRED,
        }.get(env("REDIS_SSL_CERT_REQS", default="required").strip().lower(), ssl.CERT_REQUIRED),
    })
    redis_ssl_ca_certs = env("REDIS_SSL_CA_CERTS", default="").strip()
    if redis_ssl_ca_certs:
        _redis_options['ssl_ca_certs'] = redis_ssl_ca_certs

Q_CLUSTER = {
    'name': 'DjangoQ',
    'workers': env.int("Q_WORKERS", default=1),
    'timeout': 300,
    'retry': 400,
    'queue_limit': env.int("Q_QUEUE_LIMIT", default=1),
    'bulk': env.int("Q_BULK", default=1),
    'guard_cycle': float(env("Q_GUARD_CYCLE", default="2")),
    'save_limit': env.int("Q_SAVE_LIMIT", default=50),
    'catch_up': env.bool("Q_CATCH_UP", default=False),
    'broker_class': 'core.q_broker.LowCommandRedis',
    'redis': _redis_options,
}
Q_REDIS_BLPOP_TIMEOUT = env.int("Q_REDIS_BLPOP_TIMEOUT", default=1)


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
AXES_FAILURE_LIMIT = env.int("AXES_FAILURE_LIMIT", default=20)
AXES_COOLOFF_TIME = timedelta(hours=1)
AXES_RESET_ON_SUCCESS = True
AXES_LOCKOUT_PARAMETERS = [["username", "ip_address"]]

REST_FRAMEWORK = {
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
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

AZURE_DB_URL = env("AZURE_POSTGRESQL_CONNECTIONSTRING", default="")
USE_AZURE_DB = env.bool("USE_AZURE_DB", default=False)

if USE_AZURE_DB and AZURE_DB_URL:
    DATABASES = {
        "default": dj_database_url.parse(
            AZURE_DB_URL,
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
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com http://cdnjs.cloudflare.com; "
        "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com http://cdnjs.cloudflare.com; "
        "img-src 'self' data: https://*.blob.core.windows.net; "
        "font-src 'self' data:; "
        "connect-src 'self' https://cdnjs.cloudflare.com http://cdnjs.cloudflare.com; "
        "frame-ancestors 'none'; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "form-action 'self';"
    ),
)

# JWT settings for better frontend integration
SIMPLE_JWT = {
    # Short‑lived access token
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
    # Longer‑lived refresh token
    'REFRESH_TOKEN_LIFETIME': timedelta(days=90),
    # Issue a new refresh token each time /refresh/ is called
    'ROTATE_REFRESH_TOKENS': True,
    # Blacklist old refresh tokens—prevents reuse
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'ALGORITHM': 'HS256',
}

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
        'django_q': {
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


# Twilio Settings
TWILIO_ACCOUNT_SID = env('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = env('TWILIO_AUTH_TOKEN')

# RECAPTCHA
RECAPTCHA_SECRET_KEY = env('RECAPTCHA_SECRET_KEY')

AZURE_OCR_ENDPOINT=env('AZURE_OCR_ENDPOINT')
AZURE_OCR_KEY=env('AZURE_OCR_KEY')

SCRAPINGBEE_API_KEY=env('SCRAPINGBEE_API_KEY')


# MobileMessage SMS Settings
MOBILEMESSAGE_USERNAME = env('MOBILEMESSAGE_USERNAME')
MOBILEMESSAGE_PASSWORD = env('MOBILEMESSAGE_PASSWORD')
MOBILEMESSAGE_SENDER = env('MOBILEMESSAGE_SENDER')

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
            "hosts": [REDIS_URL],
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
