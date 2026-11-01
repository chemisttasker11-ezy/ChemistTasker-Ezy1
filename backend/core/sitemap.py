from core.sitemap_port import sitemap_sources
from xml.sax.saxutils import escape

from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.cache import cache_page



def _build_urlset(urls):
    entries = []
    for item in urls:
        if isinstance(item, dict):
            loc = item.get("loc")
            lastmod = item.get("lastmod")
        else:
            loc = item
            lastmod = None
        if not loc:
            continue
        loc_xml = escape(loc)
        if lastmod:
            entries.append(f"<url><loc>{loc_xml}</loc><lastmod>{lastmod}</lastmod></url>")
        else:
            entries.append(f"<url><loc>{loc_xml}</loc></url>")
    body = "".join(entries)
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>'


def _active_public_shifts():
    return sitemap_sources().active_public_shifts()


def _build_shift_urls(base_url):
    base = (base_url or "").rstrip("/")
    return [{"loc": f"{base}/shifts/link?id={shift.id}", "lastmod": shift.created_at.date().isoformat() if shift.created_at else None} for shift in _active_public_shifts().only("id", "created_at")]


def _build_static_urls(base_url):
    base = (base_url or "").rstrip("/")
    return [f"{base}/",f"{base}/shifts/public-board",f"{base}/talent/public-board",f"{base}/learning",f"{base}/terms-of-service",f"{base}/privacy-policy"]


@cache_page(60 * 60)
def sitemap_web(request):
    base_url = getattr(settings, "FRONTEND_BASE_URL", "")
    urls = _build_static_urls(base_url)
    urls.extend(_build_shift_urls(base_url))
    urls.extend(_build_content_urls(base_url))
    urls.extend(_build_marketplace_urls(base_url))
    return HttpResponse(_build_urlset(urls), content_type="application/xml")


def _build_content_urls(base_url):
    return sitemap_sources().content_urls(base_url)


def _build_marketplace_urls(base_url):
    return sitemap_sources().marketplace_urls(base_url)
