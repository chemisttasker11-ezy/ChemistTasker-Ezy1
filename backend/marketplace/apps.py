from django.apps import AppConfig


class MarketplaceConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "marketplace"

    def ready(self):
        # Import side-effect only: registers marketplace security invariants.
        from . import signals  # noqa: F401
