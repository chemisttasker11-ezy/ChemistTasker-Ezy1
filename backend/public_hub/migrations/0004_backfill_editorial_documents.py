from django.db import migrations
from django.utils import timezone


def _body_document(article):
    value = article.body_document
    if isinstance(value, dict) and value.get("type") == "doc":
        return value
    text = article.body or article.excerpt or article.title or "Editorial content"
    return {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": text}],
            }
        ],
    }


def backfill_editorial_documents(apps, schema_editor):
    Article = apps.get_model("public_hub", "Article")
    ContentDocument = apps.get_model("public_hub", "ContentDocument")
    ContentRevision = apps.get_model("public_hub", "ContentRevision")

    now = timezone.now()
    for article in Article.objects.all().iterator():
        document, _ = ContentDocument.objects.get_or_create(
            article_id=article.pk,
            defaults={
                "area": article.kind,
                "created_by_id": article.created_by_id,
            },
        )
        changed = []
        if document.area != article.kind:
            document.area = article.kind
            changed.append("area")
        if document.created_by_id is None and article.created_by_id is not None:
            document.created_by_id = article.created_by_id
            changed.append("created_by")
        if changed:
            document.save(update_fields=changed)

        if document.revisions.exists():
            continue

        if article.status == "draft":
            revision_status = "draft"
            publish_at = None
        elif article.status == "published" and article.published_at and article.published_at > now:
            revision_status = "scheduled"
            publish_at = article.published_at
        elif article.status == "published":
            revision_status = "published"
            publish_at = article.published_at
        else:
            revision_status = "superseded"
            publish_at = article.published_at

        ContentRevision.objects.create(
            document_id=document.pk,
            payload={
                "title": article.title,
                "slug": article.slug,
                "topic": article.topic,
                "excerpt": article.excerpt,
                "body_document": _body_document(article),
                "author_name": article.author_name,
                "cover_url": article.cover_url,
                "cover_alt": article.cover_alt,
                "source_name": article.source_name,
                "source_url": article.source_url,
                "featured": article.featured,
                "comments_open": article.comments_open,
                "seo_title": article.seo_title,
                "seo_description": article.seo_description,
            },
            status=revision_status,
            version=1,
            publish_at=publish_at,
            created_by_id=article.created_by_id,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("public_hub", "0003_contentmedia"),
    ]

    operations = [
        migrations.RunPython(backfill_editorial_documents, migrations.RunPython.noop),
    ]
