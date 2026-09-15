from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxLengthValidator, URLValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone
import uuid


class ArticleQuerySet(models.QuerySet):
    def published(self):
        return self.filter(status='published', published_at__lte=timezone.now())


class Article(models.Model):
    KIND_CHOICES = [('blog', 'Blog'), ('news', 'News')]
    TOPIC_CHOICES = [('practice', 'Pharmacy practice'), ('career', 'Careers & learning'),
                     ('tga', 'TGA updates'), ('industry', 'Industry news'), ('community', 'Community')]
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, help_text='Keep this unchanged after publishing to preserve links.')
    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    topic = models.CharField(max_length=20, choices=TOPIC_CHOICES)
    excerpt = models.CharField(max_length=320)
    body = models.TextField(validators=[MaxLengthValidator(100000)], help_text='Plain text paragraphs. Start section headings with ## . HTML is not rendered.')
    body_document = models.JSONField(default=dict, blank=True)
    cover_url = models.URLField(blank=True, max_length=1000, validators=[URLValidator(schemes=['https', 'http'])])
    cover_alt = models.CharField(max_length=240, blank=True)
    source_name = models.CharField(max_length=160, blank=True)
    source_url = models.URLField(blank=True, max_length=1000, validators=[URLValidator(schemes=['https', 'http'])])
    author_name = models.CharField(max_length=120, default='ChemistTasker Editorial')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    status = models.CharField(max_length=12, choices=[('draft', 'Draft'), ('published', 'Published'), ('archived', 'Archived')], default='draft')
    published_at = models.DateTimeField(null=True, blank=True, help_text='A future date schedules publication. Required when publishing.')
    featured = models.BooleanField(default=False)
    comments_open = models.BooleanField(default=True)
    seo_title = models.CharField(max_length=70, blank=True)
    seo_description = models.CharField(max_length=170, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    objects = ArticleQuerySet.as_manager()

    class Meta:
        ordering = ['-published_at', '-id']
        indexes = [models.Index(fields=['status', 'kind', 'published_at'])]
        constraints = [models.CheckConstraint(condition=~Q(status='published') | Q(published_at__isnull=False), name='hub_publication_date_required')]

    def clean(self):
        if self.status == 'published' and not self.published_at:
            raise ValidationError({'published_at': 'Set a publication date before publishing.'})
        if self.cover_url and not self.cover_alt.strip():
            raise ValidationError({'cover_alt': 'Describe the cover image for readers using screen readers.'})
        if bool(self.source_name) != bool(self.source_url):
            raise ValidationError('Provide both source name and source URL.')
        if self.pk:
            old = Article.objects.filter(pk=self.pk).first()
            if old and (old.status != 'draft' or old.published_at) and (old.slug != self.slug or old.kind != self.kind):
                raise ValidationError('Published article URLs are permanent. Keep the slug and kind unchanged.')
            if old and old.published_at and not self.published_at:
                raise ValidationError({'published_at': 'Keep the publication date for this article. Use Draft or Archived to remove it from public view.'})

    def __str__(self):
        return self.title


class Comment(models.Model):
    article = models.ForeignKey(Article, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.CASCADE, related_name='replies')
    body = models.TextField(validators=[MaxLengthValidator(3000)])
    hidden = models.BooleanField(default=False)
    deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at', 'id']
        indexes = [models.Index(fields=['article', 'parent', 'created_at'])]

    def clean(self):
        if self.parent_id and (self.parent.article_id != self.article_id or self.parent.parent_id):
            raise ValidationError('Replies must belong to a top-level comment on this article.')


class Reaction(models.Model):
    KINDS = [('like', 'Helpful'), ('insightful', 'Insightful'), ('support', 'Support')]
    article = models.ForeignKey(Article, null=True, blank=True, on_delete=models.CASCADE, related_name='reactions')
    comment = models.ForeignKey(Comment, null=True, blank=True, on_delete=models.CASCADE, related_name='reactions')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    kind = models.CharField(max_length=12, choices=KINDS)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=(Q(article__isnull=False, comment__isnull=True) | Q(article__isnull=True, comment__isnull=False)), name='hub_reaction_one_target'),
            models.UniqueConstraint(fields=['article', 'user'], name='hub_article_user_reaction'),
            models.UniqueConstraint(fields=['comment', 'user'], name='hub_comment_user_reaction'),
        ]


class Report(models.Model):
    comment = models.ForeignKey(Comment, on_delete=models.CASCADE, related_name='reports')
    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    reason = models.CharField(max_length=500)
    resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['comment', 'reporter'], name='hub_one_report_per_user')]


class ContentAdministrator(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='content_administrator')
    active = models.BooleanField(default=True)


class ContentMedia(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.FileField(upload_to='public_content/')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)


class ContentAssignment(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='content_assignments')
    area = models.CharField(max_length=32)
    role = models.CharField(max_length=12, choices=[('writer', 'Writer'), ('publisher', 'Publisher')])

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'area'], name='content_user_area')]


class ContentDocument(models.Model):
    area = models.CharField(max_length=32)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    article = models.OneToOneField(Article, null=True, blank=True, on_delete=models.SET_NULL, related_name='editorial_document')
    # Hub records are owned by client_profile; avoid coupling its missing migration graph.
    hub_post_id = models.PositiveBigIntegerField(null=True, blank=True, unique=True)
    archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class ContentRevision(models.Model):
    document = models.ForeignKey(ContentDocument, on_delete=models.CASCADE, related_name='revisions')
    payload = models.JSONField(default=dict)
    status = models.CharField(max_length=12, choices=[(s, s.title()) for s in ['draft', 'submitted', 'scheduled', 'published', 'superseded']])
    version = models.PositiveIntegerField(default=1)
    publish_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    feedback = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-id']
        constraints = [models.UniqueConstraint(fields=['document'], condition=Q(status__in=['draft', 'submitted', 'scheduled']), name='content_one_working_revision')]


class ContentInvitation(models.Model):
    email = models.EmailField()
    token_hash = models.CharField(max_length=64, unique=True)
    assignments = models.JSONField(default=dict)
    bootstrap_administrator = models.BooleanField(default=False)
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class ContentAudit(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+')
    action = models.CharField(max_length=64)
    target = models.CharField(max_length=100)
    details = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)


class CommunityReport(models.Model):
    post_id = models.PositiveBigIntegerField()
    comment_id = models.PositiveBigIntegerField(null=True, blank=True)
    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='+')
    reason = models.CharField(max_length=500)
    resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
