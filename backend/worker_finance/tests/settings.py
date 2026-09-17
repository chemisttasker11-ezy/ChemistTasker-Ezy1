SECRET_KEY = 'isolated-finance-tests-only'
INSTALLED_APPS = [
    'django.contrib.auth', 'django.contrib.contenttypes', 'django.contrib.sessions', 'rest_framework',
    'worker_finance.tests.contracts.client_profile.apps.ContractClientProfileConfig',
    'worker_finance.apps.WorkerFinanceConfig',
]
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
ROOT_URLCONF = 'worker_finance.tests.urls'
USE_TZ = True
TIME_ZONE = 'Australia/Brisbane'
REST_FRAMEWORK = {'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination', 'PAGE_SIZE': 50}
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
DEFAULT_FROM_EMAIL = 'test@example.invalid'
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'APP_DIRS': True}]
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

FINANCE_CONTRACT_TESTS = True
