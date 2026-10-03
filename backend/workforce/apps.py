from django.apps import AppConfig


class WorkforceConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "workforce"

    def ready(self):
        # Workforce connects its own receivers; each app owns the signals it reacts with.
        from . import signals  # noqa: F401
