"""Editorial state transitions. Callers must hold the document row lock."""
from django.core.exceptions import ValidationError as ModelValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from .content_schema import validate_document, plain_text
from .models import Article, ContentAudit, ContentDocument, ContentRevision
from .permissions import AREAS, can_publish


class ArticlePayload(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    slug = serializers.SlugField(max_length=220)
    topic = serializers.ChoiceField(choices=Article.TOPIC_CHOICES, default='community')
    excerpt = serializers.CharField(max_length=320)
    body_document = serializers.JSONField()
    author_name = serializers.CharField(max_length=120, default='ChemistTasker Editorial')
    cover_url = serializers.URLField(max_length=1000, allow_blank=True, default='')
    cover_alt = serializers.CharField(max_length=240, allow_blank=True, default='')
    source_name = serializers.CharField(max_length=160, allow_blank=True, default='')
    source_url = serializers.URLField(max_length=1000, allow_blank=True, default='')
    featured = serializers.BooleanField(default=False)
    comments_open = serializers.BooleanField(default=True)
    seo_title = serializers.CharField(max_length=70, allow_blank=True, default='')
    seo_description = serializers.CharField(max_length=170, allow_blank=True, default='')

    def validate_body_document(self, value):
        return validate_document(value)

    def validate(self, data):
        if data.get('cover_url') and not data.get('cover_alt'):
            raise ValidationError({'cover_alt': 'Describe the cover image.'})
        if bool(data.get('source_name')) != bool(data.get('source_url')):
            raise ValidationError('Provide both the source name and URL.')
        data['body'] = plain_text(data['body_document'])
        if not data['body'].strip() or len(data['body']) > 100000:
            raise ValidationError({'body_document': 'Enter content up to 100,000 characters.'})
        return data


class HubPayload(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    body_document = serializers.JSONField()
    comments_open = serializers.BooleanField(default=True)

    def validate_body_document(self, value):
        return validate_document(value)

    def validate(self, data):
        data['body'] = plain_text(data['body_document'])
        if not data['body'].strip() or len(data['body']) > 100000:
            raise ValidationError('Enter content up to 100,000 characters.')
        return data


def validate_payload(area, payload):
    serializer = (ArticlePayload if area in {'blog', 'news'} else HubPayload)(data=payload)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def audit(user, action, target, **details):
    ContentAudit.objects.create(actor=user, action=action, target=str(target), details=details)


def publish(document, revision, actor):
    if not can_publish(actor, document.area):
        raise PermissionDenied('Publishing access is required for this area.')
    data = validate_payload(document.area, revision.payload)
    if document.area in {'blog', 'news'}:
        article = document.article or Article(kind=document.area, created_by=document.created_by)
        for key, value in data.items():
            setattr(article, key, value)
        article.status = 'published'
        article.published_at = article.published_at or timezone.now()
        try:
            article.full_clean()
        except ModelValidationError as exc:
            raise ValidationError(exc.message_dict)
        article.save()
        document.article = article
    else:
        from client_profile.models import PharmacyHubPost
        hub = document.area.split(':', 1)[1]
        post = PharmacyHubPost.objects.filter(pk=document.hub_post_id, platform_hub=hub, pharmacy=None, organization=None, community_group=None).first() if document.hub_post_id else None
        if document.hub_post_id and not post:
            raise ValidationError('The original hub post is unavailable.')
        post = post or PharmacyHubPost(platform_hub=hub, author_user=document.created_by)
        post.body = data['body']
        post.allow_comments = data['comments_open']
        post.deleted_at = None
        post.save()
        document.hub_post_id = post.pk
    document.archived = False
    document.save()
    document.revisions.filter(status='published').exclude(pk=revision.pk).update(status='superseded')
    revision.status, revision.approved_by = 'published', actor
    revision.publish_at = timezone.now()
    revision.version += 1
    revision.save()
    audit(actor, 'publish', document.pk, revision=revision.pk, area=document.area)


def publish_due():
    """Scheduled replacement never changes the approved copy until the due time."""
    count = 0
    ids = list(ContentRevision.objects.filter(status='scheduled', publish_at__lte=timezone.now()).values_list('document_id', flat=True))
    for pk in ids:
        with transaction.atomic():
            document = ContentDocument.objects.select_for_update().get(pk=pk)
            revision = document.revisions.filter(status='scheduled', publish_at__lte=timezone.now()).first()
            if not revision:
                continue
            if not can_publish(revision.approved_by, document.area):
                revision.status, revision.feedback = 'submitted', 'Publishing permission was removed. A publisher must approve again.'
                revision.save()
                audit(None, 'schedule_permission_removed', document.pk)
                continue
            try:
                with transaction.atomic():
                    publish(document, revision, revision.approved_by)
            except ValidationError:
                revision.status, revision.feedback = 'submitted', 'Scheduled publication failed validation. Review the draft.'
                revision.save()
                audit(None, 'schedule_validation_failed', document.pk)
                continue
            count += 1
    return count
