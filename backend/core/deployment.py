import os
import urllib.parse
from .settings import *
from .settings import BASE_DIR
import dj_database_url


env = Env()
Env.read_env()


ALLOWED_HOSTS = [
    env("WEBSITE_HOSTING"),
    'thankful-stone-0dac7ba00.6.azurestaticapps.net',
    "chemisttasker.com.au",
    "www.chemisttasker.com.au",
    # 'localhost'
]

CSRF_TRUSTED_ORIGINS = [
    'https://' + env("WEBSITE_HOSTING"),
    'https://thankful-stone-0dac7ba00.6.azurestaticapps.net',
    "https://chemisttasker.com.au",
    "https://www.chemisttasker.com.au",
    # 'http://localhost:5173'
    ]

CORS_ALLOWED_ORIGINS = [
    'https://' + os.environ['WEBSITE_HOSTING'],
    'https://thankful-stone-0dac7ba00.6.azurestaticapps.net',
    "https://chemisttasker.com.au",
    "https://www.chemisttasker.com.au",
    # 'http://localhost:5173'
]
CORS_ALLOW_CREDENTIALS = True


FRONTEND_BASE_URL = "https://www.chemisttasker.com.au"

BACKEND_BASE_URL = f"https://{env('WEBSITE_HOSTING')}"

DEBUG=False

# Redirect all HTTP → HTTPS
SECURE_SSL_REDIRECT = True

# Cookies only over HTTPS
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE    = True

# HSTS (browser “always use HTTPS next time”)
SECURE_HSTS_SECONDS           = 31536000  
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD           = True

# Protect against some XSS attacks
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS           = 'DENY'

# When behind Azure’s load-balancer
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

SECRET_KEY = env("SECRET_KEY")

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'core.security.ContentSecurityPolicyMiddleware',
    "whitenoise.middleware.WhiteNoiseMiddleware",
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django_otp.middleware.OTPMiddleware',
    'axes.middleware.AxesMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

DATABASES = {
    'default': dj_database_url.config(
        default=env('AZURE_POSTGRESQL_CONNECTIONSTRING'),
        conn_max_age=600,
        conn_health_checks=True,
        ssl_require=True
    )
}


TIME_ZONE = 'Australia/Sydney'

# tell Django to use Azure for all FileField / ImageField storage
STORAGES = {
    "default": {
        "BACKEND": "storages.backends.azure_storage.AzureStorage",
        "OPTIONS": {
            # Authentication
            "account_name":    env("AZURE_ACCOUNT_NAME"),
            "account_key":     env("AZURE_ACCOUNT_KEY"),
            "azure_container": env("AZURE_CONTAINER"),

            "azure_ssl":       True,            # ← NOT "ssl"
            "overwrite_files": False,
            "expiration_secs": 3600,            # 1 hour (adjust as you like)

            # In case of network slowness, bump this up (defaults to None)
            # "timeout":        120,
        },
    },

    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

# Tell Django how to generate media URLs
MEDIA_URL = (
    f"https://{env('AZURE_ACCOUNT_NAME')}"
    f".blob.core.windows.net/{env('AZURE_CONTAINER')}/"
)

def _log_redis_config() -> None:
    try:
        redis_url = os.environ.get("REDIS_URL") or globals().get("REDIS_URL")
        if not redis_url:
            print("[deployment] REDIS_URL not set")
            return
        parsed = urllib.parse.urlparse(redis_url)
        db = parsed.path.lstrip("/") if parsed.path and parsed.path != "/" else "0"
        print(
            "[deployment] REDIS scheme=%s host=%s port=%s db=%s"
            % (parsed.scheme, parsed.hostname, parsed.port, db)
        )
        q_redis = (globals().get("Q_CLUSTER") or {}).get("redis", {})
        if isinstance(q_redis, dict) and q_redis:
            print(
                "[deployment] Q_CLUSTER redis host=%s port=%s db=%s ssl=%s"
                % (q_redis.get("host"), q_redis.get("port"), q_redis.get("db"), q_redis.get("ssl"))
            )
        channel_hosts = (
            (globals().get("CHANNEL_LAYERS") or {})
            .get("default", {})
            .get("CONFIG", {})
            .get("hosts")
        )
        if channel_hosts:
            print("[deployment] CHANNEL_LAYERS hosts=%s" % channel_hosts)
    except Exception as exc:
        print("[deployment] Failed to log redis config: %s" % exc)

_log_redis_config()
