from django.apps import AppConfig


class CompositionConfig(AppConfig):
    name = "composition"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from .file_references import configure_file_cleanup
        configure_file_cleanup()
