from django.apps import AppConfig


class BillingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'billing'

    def ready(self):
        from . import signals  # noqa: F401
        from .release_guards import validate_provider_preflight
        validate_provider_preflight()
