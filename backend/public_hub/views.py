from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView
from .models import Article, Comment, Reaction, Report
from .permissions import verified, VerifiedMember


class VerifiedDiscussion(permissions.IsAuthenticatedOrReadOnly):
    def has_permission(self, request, view):
        return request.method in permissions.SAFE_METHODS or verified(request.user)
from .serializers import (ArticleSerializer, ArticleDetailSerializer, CommentSerializer,
                          CommentInput, ReactionInput, ReportInput, reaction_summary, public_name)


class HubPagination(PageNumberPagination):
    page_size = 12


class DiscussionThrottle(UserRateThrottle):
    rate = '30/minute'
    scope = 'public_hub_write'

    def allow_request(self, request, view):
        return True if request.method in permissions.SAFE_METHODS else super().allow_request(request, view)


def articles():
    visible = Q(comments__hidden=False, comments__deleted=False) & (Q(comments__parent__isnull=True) | Q(comments__parent__hidden=False))
    return Article.objects.published().annotate(comment_count=Count('comments', filter=visible, distinct=True)).prefetch_related('reactions')


def comments(article):
    return Comment.objects.filter(article=article, hidden=False).filter(Q(parent__isnull=True) | Q(parent__hidden=False)).select_related('author').prefetch_related('reactions').annotate(reply_count=Count('replies', filter=Q(replies__hidden=False)))


class ArticleList(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = ArticleSerializer
    pagination_class = HubPagination

    def get_queryset(self):
        qs = articles()
        for field in ('kind', 'topic'):
            if value := self.request.query_params.get(field):
                qs = qs.filter(**{field: value})
        if query := self.request.query_params.get('q', '').strip()[:200]:
            qs = qs.filter(Q(title__icontains=query) | Q(excerpt__icontains=query) | Q(body__icontains=query))
        return qs.order_by('-featured', '-published_at', '-id')


class ArticleDetail(generics.RetrieveAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = ArticleDetailSerializer
    lookup_field = 'slug'

    def get_queryset(self):
        return articles()


class MemberView(APIView):
    permission_classes = [VerifiedMember]

    def get(self, request):
        return Response({'name': public_name(request.user)})


class CommentList(generics.ListAPIView):
    permission_classes = [VerifiedDiscussion]
    throttle_classes = [DiscussionThrottle]
    serializer_class = CommentSerializer
    pagination_class = HubPagination

    def get_queryset(self):
        article = get_object_or_404(articles(), slug=self.kwargs['slug'])
        parent = self.request.query_params.get('parent')
        if parent:
            try:
                parent = int(parent)
            except ValueError:
                raise ValidationError({'parent': 'Enter a valid comment ID.'})
            get_object_or_404(comments(article), pk=parent, parent__isnull=True)
        return comments(article).filter(parent_id=parent).order_by('created_at', 'id')

    @transaction.atomic
    def post(self, request, slug):
        article = get_object_or_404(Article.objects.published().select_for_update(), slug=slug)
        if not article.comments_open:
            raise PermissionDenied('Discussion is closed for this article.')
        data = CommentInput(data=request.data)
        data.is_valid(raise_exception=True)
        parent_id = data.validated_data.get('parent')
        if parent_id:
            get_object_or_404(comments(article), pk=parent_id, parent__isnull=True, deleted=False)
        obj = Comment.objects.create(article=article, author=request.user, body=data.validated_data['body'], parent_id=parent_id)
        obj = comments(article).get(pk=obj.pk)
        return Response(CommentSerializer(obj, context={'request': request}).data, status=201)


class CommentDelete(APIView):
    permission_classes = [VerifiedMember]
    throttle_classes = [DiscussionThrottle]

    def delete(self, request, pk):
        obj = get_object_or_404(Comment, pk=pk, article__in=Article.objects.published(), hidden=False)
        if obj.author_id != request.user.pk and not request.user.has_perm('public_hub.delete_comment'):
            raise PermissionDenied('You can only remove your own comments.')
        obj.body, obj.deleted = '', True
        obj.save(update_fields=['body', 'deleted', 'updated_at'])
        obj.reactions.all().delete()
        return Response(status=204)


class ReactionView(APIView):
    permission_classes = [VerifiedMember]
    throttle_classes = [DiscussionThrottle]

    def target(self, slug=None, pk=None):
        if slug:
            return get_object_or_404(Article.objects.published().select_for_update(), slug=slug), 'article'
        obj = get_object_or_404(Comment.objects.select_for_update(), pk=pk, article__in=Article.objects.published(), hidden=False, deleted=False)
        if obj.parent_id and obj.parent.hidden:
            raise PermissionDenied('This discussion is unavailable.')
        return obj, 'comment'

    @transaction.atomic
    def put(self, request, **kwargs):
        obj, field = self.target(**kwargs)
        data = ReactionInput(data=request.data)
        data.is_valid(raise_exception=True)
        Reaction.objects.update_or_create(**{field: obj, 'user': request.user}, defaults=data.validated_data)
        return Response(reaction_summary(obj, request.user))

    @transaction.atomic
    def delete(self, request, **kwargs):
        obj, field = self.target(**kwargs)
        Reaction.objects.filter(**{field: obj, 'user': request.user}).delete()
        return Response(reaction_summary(obj, request.user))


class CommentReport(APIView):
    permission_classes = [VerifiedMember]
    throttle_classes = [DiscussionThrottle]

    def post(self, request, pk):
        obj = get_object_or_404(Comment, pk=pk, article__in=Article.objects.published(), hidden=False, deleted=False)
        if obj.parent_id and obj.parent.hidden:
            raise PermissionDenied('This discussion is unavailable.')
        data = ReportInput(data=request.data)
        data.is_valid(raise_exception=True)
        _, created = Report.objects.get_or_create(comment=obj, reporter=request.user, defaults=data.validated_data)
        return Response({'detail': 'Report received. Our team will review it.'}, status=201 if created else 200)
