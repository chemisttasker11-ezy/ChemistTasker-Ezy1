"""Compose service implementations before mounting the unchanged URL objects."""
from composition import organization_memberships  # noqa: F401 (explicit service wiring)
from composition import identity_memberships  # noqa: F401 (identity read wiring)
from composition import identity_organizations  # noqa: F401 (identity organization wiring)
from core.urls import urlpatterns  # noqa: F401 (historical route objects)
