"""Domain-owned public sitemap reads; project transport remains in core."""
from django.conf import settings


def listing_urls(base_url):
    from marketplace.models import MarketplaceListing
    base = (base_url or "").rstrip("/")
    urls = [{"loc": f"{base}/marketplace"}, {"loc": f"{base}/marketplace/medicines"}]
    if not getattr(settings, "MARKETPLACE_READ_ENABLED", False):
        return urls
    listings = MarketplaceListing.objects.filter(publication_status="PUBLISHED").exclude(availability_status__in=("WITHDRAWN", "EXPIRED"))
    urls.extend({"loc": f"{base}/marketplace/items/{row.id}/{row.slug}", "lastmod": row.updated_at.date().isoformat()} for row in listings.only("id", "slug", "updated_at"))
    return urls
