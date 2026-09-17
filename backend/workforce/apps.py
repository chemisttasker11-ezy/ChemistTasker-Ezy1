from django.apps import AppConfig


class WorkforceConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "workforce"

    def ready(self):
        # Keep workforce invalidation outside client_profile.signals so the existing
        # chat/onboarding signal module is not made more fragile.
        from . import signals  # noqa: F401
