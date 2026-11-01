from django.apps import AppConfig


class CompositionConfig(AppConfig):
    name = "composition"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from .organization_memberships import configure_organization_memberships
        from .identity_memberships import configure_identity_memberships
        configure_organization_memberships()
        configure_identity_memberships()
        from .file_references import configure_file_cleanup
        configure_file_cleanup()
        from .identity_organizations import configure_identity_organization_reads
        configure_identity_organization_reads()
        from .foundation_services import configure_foundation_services
        configure_foundation_services()
