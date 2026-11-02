"""Feature-owned reads required by the project sitemap composition.

Application composition binds these immutable services after model discovery.
This contract imports no feature implementation and performs no I/O.
"""
from dataclasses import dataclass
from typing import Callable

from django.core.exceptions import ImproperlyConfigured


@dataclass(frozen=True)
class SitemapSources:
    active_public_shifts: Callable
    content_urls: Callable
    marketplace_urls: Callable


_services: SitemapSources | None = None


def configure_sitemap_sources(services: SitemapSources) -> None:
    global _services
    _services = services


def sitemap_sources() -> SitemapSources:
    if _services is None:
        raise ImproperlyConfigured('Application startup must configure SitemapSources.')
    return _services
