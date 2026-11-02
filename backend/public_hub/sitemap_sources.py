"""Domain-owned public sitemap reads; project transport remains in core."""
from django.conf import settings


def content_urls(base_url):
    from public_hub.models import Article
    from public_hub.permissions import HUBS
    base = (base_url or '').rstrip('/')
    urls = [{'loc': f'{base}/{kind}'} for kind in ['blog', 'news', 'pricing', 'pricing/organization', 'contact']]
    urls.extend({'loc': f'{base}/{article.kind}/{article.slug}', 'lastmod': article.updated_at.date().isoformat()} for article in Article.objects.published().only('kind', 'slug', 'updated_at'))
    if getattr(settings, 'PUBLIC_COMMUNITY_ENABLED', False):
        from public_hub.community import posts
        urls.extend({'loc': f'{base}/hubs/{hub}'} for hub in HUBS)
        urls.append({'loc': f'{base}/hubs'})
        urls.extend({'loc': f'{base}/hubs/posts/{pk}'} for pk in posts().values_list('pk', flat=True))
    return urls
