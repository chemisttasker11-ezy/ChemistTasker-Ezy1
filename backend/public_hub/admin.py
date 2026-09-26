from django.contrib import admin
from .models import Article, Comment, Reaction, Report


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    """Read-only projection of published editorial content.

    Authoring and publication must go through ContentDocument/ContentRevision so
    revision history, permissions and audit records cannot be bypassed.
    """

    list_display = ['title', 'kind', 'topic', 'status', 'published_at', 'featured', 'comments_open']
    list_filter = ['kind', 'status', 'topic', 'featured']
    search_fields = ['title', 'excerpt', 'body']
    readonly_fields = [
        'title', 'slug', 'kind', 'topic', 'author_name', 'excerpt', 'body',
        'cover_url', 'cover_alt', 'source_name', 'source_url',
        'status', 'published_at', 'featured', 'comments_open',
        'seo_title', 'seo_description', 'created_by', 'created_at', 'updated_at',
    ]
    fieldsets = [
        ('Article', {'fields': ['title', 'slug', 'kind', 'topic', 'author_name', 'excerpt', 'body']}),
        ('Image & attribution', {'fields': ['cover_url', 'cover_alt', 'source_name', 'source_url']}),
        ('Publish', {'fields': ['status', 'published_at', 'featured', 'comments_open']}),
        ('Search & sharing', {'fields': ['seo_title', 'seo_description']}),
        ('Audit', {'fields': ['created_by', 'created_at', 'updated_at']}),
    ]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ['id', 'article', 'author', 'hidden', 'deleted', 'created_at']
    list_filter = ['hidden', 'deleted']
    search_fields = ['body', 'article__title']
    readonly_fields = ['article', 'author', 'parent', 'body', 'deleted', 'created_at', 'updated_at']
    actions = ['hide_comments', 'restore_comments']

    def has_add_permission(self, request):
        return False

    @admin.action(description='Hide selected comments and their reply threads', permissions=['change'])
    def hide_comments(self, request, queryset):
        queryset.update(hidden=True)

    @admin.action(description='Restore selected comments', permissions=['change'])
    def restore_comments(self, request, queryset):
        queryset.update(hidden=False)


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ['comment', 'reason', 'reporter', 'resolved', 'created_at']
    list_filter = ['resolved']
    readonly_fields = ['comment', 'reporter', 'reason', 'created_at']
    actions = ['resolve_reports', 'hide_reported_comments']

    def has_add_permission(self, request):
        return False

    @admin.action(description='Mark selected reports as resolved', permissions=['change'])
    def resolve_reports(self, request, queryset):
        queryset.update(resolved=True)

    @admin.action(description='Hide reported comments and resolve reports', permissions=['moderate'])
    def hide_reported_comments(self, request, queryset):
        Comment.objects.filter(pk__in=queryset.values('comment_id')).update(hidden=True)
        queryset.update(resolved=True)

    def has_moderate_permission(self, request):
        return request.user.has_perm('public_hub.change_comment') and self.has_change_permission(request)
