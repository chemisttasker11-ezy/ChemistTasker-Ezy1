from django.apps import AppConfig

class ClientProfileConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'client_profile'
    
    def ready(self):
        """
        This method is called when the app is ready.
        Importing signals here connects the signal handlers.
        """
        import client_profile.signals
