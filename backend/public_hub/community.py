"""Anonymous community reads deliberately do not reuse membership serializers."""
import mimetypes
from django.conf import settings
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q
from rest_framework import generics, permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import ContentDocument, CommunityReport
from .permissions import HUBS, member_hubs, VerifiedMember
from .serializers import public_name
from .views import HubPagination, DiscussionThrottle


def ensure_public():
    if not getattr(settings, 'PUBLIC_COMMUNITY_ENABLED', False):
        raise Http404


def posts():
    from client_profile.models import PharmacyHubPost
    ensure_public()
    return PharmacyHubPost.objects.filter(platform_hub__in=HUBS, pharmacy=None, organization=None,
        community_group=None, deleted_at=None).select_related('author_user', 'author_membership__user').prefetch_related('attachments')


def comments(post):
    return post.comments.filter(deleted_at=None).filter(Q(parent_comment=None) | Q(parent_comment__deleted_at=None)).select_related('author_user', 'author_membership__user')


def author(obj):
    return obj.author_user or (obj.author_membership.user if obj.author_membership else None)


def author_data(obj):
    return public_name(author(obj))


class PublicPost(serializers.Serializer):
    id = serializers.IntegerField()
    platform_hub = serializers.CharField()
    body = serializers.CharField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()
    allow_comments = serializers.BooleanField()
    is_pinned = serializers.BooleanField()
    author_name = serializers.SerializerMethodField()
    attachments = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()
    can_interact = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    editorial = serializers.SerializerMethodField()

    def get_author_name(self, obj):
        return author_data(obj)

    def get_attachments(self, obj):
        return [{'id': item.pk, 'kind': item.kind,
            'name': item.file.name.rsplit('/', 1)[-1],
            'content_type': mimetypes.guess_type(item.file.name)[0] or 'application/octet-stream',
            'url': f'/api/hub/attachments/{item.pk}/'} for item in obj.attachments.all()]

    def get_comment_count(self, obj):
        return comments(obj).count()

    def get_reactions(self, obj):
        return dict(obj.reactions.values('reaction_type').annotate(total=Count('id')).values_list('reaction_type', 'total'))

    def get_can_interact(self, obj):
        return obj.platform_hub in member_hubs(self.context['request'].user)

    def get_can_edit(self, obj):
        user = self.context['request'].user
        creator = author(obj)
        return bool(user.is_authenticated and creator and creator.pk == user.pk and self.get_can_interact(obj))

    def get_editorial(self, obj):
        document = ContentDocument.objects.filter(hub_post_id=obj.pk, archived=False, area=f'hub:{obj.platform_hub}').first()
        revision = document.revisions.filter(status='published').first() if document else None
        return {'title': revision.payload['title'], 'body_document': revision.payload['body_document']} if revision else None


class PublicComment(serializers.Serializer):
    id = serializers.IntegerField()
    body = serializers.CharField()
    parent_comment = serializers.IntegerField(source='parent_comment_id', allow_null=True)
    created_at = serializers.DateTimeField()
    author_name = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()

    def get_author_name(self, obj):
        return author_data(obj)

    def get_can_edit(self, obj):
        user, creator = self.context['request'].user, author(obj)
        return bool(user.is_authenticated and creator and user.pk == creator.pk and obj.post.platform_hub in member_hubs(user))

    def get_reactions(self, obj):
        return dict(obj.reactions.values('reaction_type').annotate(total=Count('id')).values_list('reaction_type', 'total'))


class Hubs(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        ensure_public()
        own = member_hubs(request.user)
        return Response([{'key': key, 'label': label, 'can_interact': key in own} for key, label in HUBS.items()])


class PostList(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = PublicPost
    pagination_class = HubPagination

    def get_queryset(self):
        hub = self.kwargs['hub']
        if hub not in HUBS:
            raise Http404
        queryset = posts().filter(platform_hub=hub)
        if query := self.request.query_params.get('q', '').strip()[:200]:
            queryset = queryset.filter(body__icontains=query)
        return queryset.order_by('-is_pinned', '-pinned_at', '-created_at', '-pk')


class PostDetail(generics.RetrieveAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = PublicPost

    def get_queryset(self):
        return posts()


class CommentList(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = PublicComment
    pagination_class = HubPagination

    def get_queryset(self):
        post = get_object_or_404(posts(), pk=self.kwargs['pk'])
        return comments(post).order_by('created_at', 'pk')


class Attachment(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        from client_profile.models import PharmacyHubAttachment
        item = get_object_or_404(PharmacyHubAttachment, pk=pk, post__in=posts())
        try:
            media_type = mimetypes.guess_type(item.file.name)[0] or 'application/octet-stream'
            inline = media_type.startswith(('image/', 'video/', 'audio/')) or media_type == 'application/pdf'
            response = FileResponse(item.file.open('rb'), as_attachment=not inline, filename=item.file.name.rsplit('/', 1)[-1])
            response['X-Content-Type-Options'] = 'nosniff'
            response['Content-Security-Policy'] = "default-src 'none'; sandbox"
            response['Cache-Control'] = 'private, no-store'
            return response
        except (OSError, ValueError):
            raise Http404


class PollList(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, hub):
        from client_profile.models import PharmacyHubPoll
        ensure_public()
        if hub not in HUBS:
            raise Http404
        queryset = PharmacyHubPoll.objects.filter(platform_hub=hub, pharmacy=None, organization=None,
            community_group=None).prefetch_related('options').order_by('-created_at', '-id')
        pager = HubPagination()
        rows = pager.paginate_queryset(queryset, request, view=self)
        return pager.get_paginated_response([{'id': poll.pk, 'question': poll.question, 'created_at': poll.created_at,
            'can_interact': hub in member_hubs(request.user), 'is_closed': poll.is_closed or bool(poll.closes_at and poll.closes_at <= __import__('django.utils.timezone', fromlist=['now']).now()), 'options': [{'id': opt.pk, 'text': opt.label,
            'votes': opt.votes.count()} for opt in poll.options.all()]} for poll in rows])


class ReportPost(APIView):
    permission_classes = [VerifiedMember]
    throttle_classes = [DiscussionThrottle]

    def post(self, request, pk):
        post = get_object_or_404(posts(), pk=pk)
        if post.platform_hub not in member_hubs(request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You can interact in the shared hub and your own role hub.')
        reason = serializers.CharField(max_length=500).run_validation(request.data.get('reason'))
        comment = request.data.get('comment_id')
        if comment is not None:
            comment = serializers.IntegerField(min_value=1).run_validation(comment)
            get_object_or_404(comments(post), pk=comment)
        CommunityReport.objects.get_or_create(post_id=post.pk, comment_id=comment, reporter=request.user, resolved=False, defaults={'reason': reason})
        return Response({'detail': 'Report received.'}, status=201)
