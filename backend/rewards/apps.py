from django.apps import AppConfig


class RewardsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'rewards'
    verbose_name = 'Pill rewards'

    def ready(self):
        from rewards import signals  # noqa: F401  (connects the receivers)
