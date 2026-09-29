"""Local-only runtime for the playground; never import in a deployed app."""
from core.settings import *

if DATABASES['default'].get('HOST') not in ('localhost', '127.0.0.1', '::1'):
    raise RuntimeError('Playground requires a loopback database.')
if DATABASES['default']['NAME'] != 'chemisttasker_preview':
    raise RuntimeError('Playground only supports chemisttasker_preview.')
DEBUG = True
ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'testserver']
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
STRIPE_SECRET_KEY = ''
STRIPE_WEBHOOK_SECRET = ''
MOBILEMESSAGE_USERNAME = ''
MOBILEMESSAGE_PASSWORD = ''
AZURE_OCR_KEY = ''
SCRAPINGBEE_API_KEY = ''
CELERY_TASK_ALWAYS_EAGER = False
CELERY_BROKER_URL = 'memory://'
CELERY_RESULT_BACKEND = 'cache+memory://'
CHANNEL_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}
STORAGES = {'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'}, 'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}}
AXES_ENABLED = False
CORS_ALLOWED_ORIGINS = [f'http://{host}:{port}' for host in ('localhost', '127.0.0.1') for port in (3000, 5173, 8082, 8090)]
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS
