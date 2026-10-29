"""Compose service implementations before mounting the unchanged URL objects."""
from composition import organization_memberships  # noqa: F401 (explicit service wiring)
from core.urls import urlpatterns  # noqa: F401 (historical route objects)
