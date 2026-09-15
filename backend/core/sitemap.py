from datetime import date
from xml.sax.saxutils import escape

from django.conf import settings
from django.db.models import Count, F, Q
from django.utils import timezone
from django.http import HttpResponse
from django.views.decorators.cache import cache_page

from client_profile.models import Shift


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
    today = date.today()
    now_time = timezone.now().time()
    qs = Shift.objects.filter(visibility="PLATFORM").annotate(
        slot_count=Count("slots", distinct=True),
        assigned_count=Count("slots__assignments", distinct=True),
    )
    slotless_ftpt = Q(employment_type__in=["FULL_TIME", "PART_TIME"], slot_count=0)
    future_slots = (
        Q(slots__is_recurring=True, slots__recurring_end_date__gte=today)
        | Q(slots__date__gt=today)
        | Q(slots__date=today, slots__end_time__gt=now_time)
    )
    open_slots = Q(slot_count__gt=0, assigned_count__lt=F("slot_count"))
    return qs.filter(slotless_ftpt | (future_slots & open_slots)).distinct()


def _build_shift_urls(base_url):
    base = (base_url or "").rstrip("/")
    urls = []
    for shift in _active_public_shifts().only("id", "created_at"):
        lastmod = shift.created_at.date().isoformat() if shift.created_at else None
        urls.append(
            {
                "loc": f"{base}/shifts/link?id={shift.id}",
                "lastmod": lastmod,
            }
        )
    return urls


def _build_static_urls(base_url):
    base = (base_url or "").rstrip("/")
    return [
        f"{base}/",
        f"{base}/shifts/public-board",
        f"{base}/talent/public-board",
        f"{base}/terms-of-service",
        f"{base}/privacy-policy",
    ]


@cache_page(60 * 60)
def sitemap_web(request):
    base_url = getattr(settings, "FRONTEND_BASE_URL", "")
    urls = _build_static_urls(base_url)
    urls.extend(_build_shift_urls(base_url))
    urls.extend(_build_content_urls(base_url))
    xml = _build_urlset(urls)
    return HttpResponse(xml, content_type="application/xml")


def _build_content_urls(base_url):
    from public_hub.models import Article
    from public_hub.permissions import HUBS
    base = (base_url or '').rstrip('/')
    urls = [{'loc': f'{base}/{kind}'} for kind in ['blog', 'news', 'pricing', 'pricing/organization', 'contact']]
    urls.extend({'loc': f'{base}/{article.kind}/{article.slug}', 'lastmod': article.updated_at.date().isoformat()}
                for article in Article.objects.published().only('kind', 'slug', 'updated_at'))
    if getattr(settings, 'PUBLIC_COMMUNITY_ENABLED', False):
        from public_hub.community import posts
        urls.extend({'loc': f'{base}/hubs/{hub}'} for hub in HUBS)
        urls.append({'loc': f'{base}/hubs'})
        urls.extend({'loc': f'{base}/hubs/posts/{pk}'} for pk in posts().values_list('pk', flat=True))
    return urls
