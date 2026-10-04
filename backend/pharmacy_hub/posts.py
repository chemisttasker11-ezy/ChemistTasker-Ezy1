"""Hub posts with their comments and reactions."""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from core.task_queue import async_task
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView
from notifications.services import notify_users
from pharmacy_hub.models import (
    PharmacyHubComment,
    PharmacyHubCommentReaction,
    PharmacyHubPost,
    PharmacyHubReaction,
)
from pharmacy_hub.serializers import HubCommentSerializer, HubPostSerializer, HubReactionSerializer
from pharmacy_hub.access import HubScopeResolver
from pharmacy_hub.notifications import _build_hub_post_action_params, _build_hub_post_action_url, _get_user_display_name, _notify_hub_post_owner
from pharmacy_hub.scoping import HubAttachmentMixin, HubScopedViewSetMixin


User = get_user_model()


def _identity_reactions_for_update(queryset, user):
    """Lock and return every reaction row representing one human user."""
    User.objects.select_for_update().only("pk").get(pk=user.pk)
    return list(
        queryset.select_for_update(of=("self",))
        .filter(Q(user_id=user.id) | Q(member__user_id=user.id))
        .order_by("id")
    )


def _upsert_identity_reaction(queryset, *, user, member, reaction_type, create_kwargs):
    with transaction.atomic():
        reactions = _identity_reactions_for_update(queryset, user)
        reaction = reactions[0] if reactions else None
        for duplicate in reactions[1:]:
            duplicate.delete()
        if reaction is None:
            identity = {"member": member} if member else {"user": user}
            reaction = queryset.model.objects.create(
                **create_kwargs,
                **identity,
                reaction_type=reaction_type,
            )
        elif reaction.reaction_type != reaction_type:
            reaction.reaction_type = reaction_type
            reaction.updated_at = timezone.now()
            reaction.save(update_fields=["reaction_type", "updated_at"])
        return reaction


def _delete_identity_reactions(queryset, *, user):
    with transaction.atomic():
        reactions = _identity_reactions_for_update(queryset, user)
        for reaction in reactions:
            reaction.delete()


class HubPostViewSet(HubAttachmentMixin, HubScopedViewSetMixin, viewsets.ModelViewSet):
    serializer_class = HubPostSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return (
            PharmacyHubPost.objects.filter(deleted_at__isnull=True)
            .select_related(
                "author_membership__user",
                "author_user",
                "pharmacy",
                "organization",
                "community_group",
            )
            .prefetch_related(
                "comments__author_membership__user",
                "reactions",
                "attachments",
                "mentions__membership__user",
            )
            .order_by("-is_pinned", "-pinned_at", "-created_at")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context.update(getattr(self, "extra_serializer_context", {}))
        return context

    def _notify_tagged_members(self, post, memberships):
        if not memberships:
            return
        author_user = getattr(getattr(post, "author_membership", None), "user", None)
        if not author_user:
            author_user = getattr(post, "author_user", None)
        author_name = ""
        if author_user:
            author_name = author_user.get_full_name().strip() or author_user.email or ""
        if not author_name:
            author_name = "A teammate"
        if post.community_group_id and post.community_group:
            context_label = post.community_group.name
        elif post.pharmacy_id and post.pharmacy:
            context_label = post.pharmacy.name
        elif post.organization_id and post.organization:
            context_label = post.organization.name
        else:
            context_label = "Pharmacy Hub"
        title = f"{author_name} mentioned you in {context_label}"
        body_preview = (post.body or "").strip()
        body = body_preview[:280]
        hub_path = _build_hub_post_action_url(post)
        notification_payload = {
            "post_id": post.id,
            **_build_hub_post_action_params(post),
        }
        user_payloads = []
        for membership in memberships:
            user = getattr(membership, "user", None)
            if not user or not user.is_active:
                continue
            if author_user and user.id == author_user.id:
                continue
            user_payloads.append(
                {
                    "user_id": user.id,
                    "email": user.email,
                    "name": user.get_full_name().strip() or user.email or "",
                }
            )
        user_ids = {payload["user_id"] for payload in user_payloads if payload.get("user_id")}
        if user_ids:
            notify_users(
                user_ids,
                title=title,
                body=body,
                action_url=hub_path,
                payload=notification_payload,
            )
        email_targets = {}
        for payload in user_payloads:
            email = payload.get("email")
            if not email:
                continue
            if email in email_targets:
                continue
            email_targets[email] = payload.get("name") or ""
        if email_targets:
            frontend_base = getattr(settings, "FRONTEND_BASE_URL", "").rstrip("/")
            hub_url = (
                f"{frontend_base}{hub_path}" if frontend_base else hub_path
            )
            for email, recipient_name in email_targets.items():
                context = {
                    "recipient_name": recipient_name or "there",
                    "author_name": author_name,
                    "context_label": context_label,
                    "post_body": body_preview,
                    "hub_url": hub_url,
                    "action_url": hub_path,
                }
                async_task(
                    "users.tasks.send_async_email",
                    subject=title,
                    recipient_list=[email],
                    template_name="emails/hub_post_tagged.html",
                    context=context,
                    text_template="emails/hub_post_tagged.txt",
                    suppress_auto_notification=True,
                )

    def list(self, request, *args, **kwargs):
        self.scope_context = self._resolve_scope_from_params(request.query_params)
        queryset = self._apply_scope_filter(self.get_queryset(), self.scope_context)
        self._prepare_serializer_context(self.scope_context)
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        from public_hub.models import ContentDocument
        if ContentDocument.objects.filter(hub_post_id=instance.pk).exists():
            raise PermissionDenied("Use the publishing workspace to revise or archive editorial content.")
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_post(instance)
        self._prepare_serializer_context(scope)
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        data = self._normalize_params(request.data)
        self.scope_context = self._resolve_scope_from_params(data)
        attachments = self._validate_attachments(
            request.FILES.getlist("attachments")
        )
        resolver = HubScopeResolver(request.user)
        membership = self.scope_context.get("request_membership")
        is_platform_post = self.scope_context.get("scope_type") == "platform"
        if membership is None and not is_platform_post:
            membership = resolver.ensure_author_membership(self.scope_context)
        self._prepare_serializer_context(self.scope_context)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        scope_type = self.scope_context.get("scope_type")
        pharmacy = None
        organization = None
        community_group = None
        platform_hub = None
        if scope_type == "pharmacy":
            pharmacy = self.scope_context.get("pharmacy")
        elif scope_type == "organization":
            organization = self.scope_context.get("organization")
            pharmacy = None  # org-only post
        elif scope_type == "group":
            pharmacy = self.scope_context.get("pharmacy")
            community_group = self.scope_context.get("community_group")
        elif scope_type == "platform":
            platform_hub = self.scope_context.get("platform_hub")

        with transaction.atomic():
            post = serializer.save(
                pharmacy=pharmacy,
                organization=organization,
                community_group=community_group,
                platform_hub=platform_hub,
                author_membership=membership,
                author_user=request.user,
                original_body=serializer.validated_data.get("body", ""),
                is_edited=False,
                last_edited_at=None,
                last_edited_by=None,
            )
            self._add_attachments(post, attachments)

        self._notify_tagged_members(
            post,
            getattr(serializer, "_newly_tagged_members", []),
        )
        output = self.get_serializer(post)
        return Response(output.data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        instance = self.get_object()
        from public_hub.models import ContentDocument
        if ContentDocument.objects.filter(hub_post_id=instance.pk).exists():
            raise PermissionDenied("Use the publishing workspace to revise or archive editorial content.")
        resolver = HubScopeResolver(self.request.user)
        scope = resolver.from_post(instance)
        self._prepare_serializer_context(scope)
        membership = scope.get("request_membership")
        is_author = False
        if instance.author_membership_id and instance.author_membership_id == getattr(
            membership, "id", None
        ):
            is_author = True
        elif instance.author_user_id == self.request.user.id:
            is_author = True
        if not is_author:
            raise PermissionDenied("Only the author can edit this post.")
        if instance.deleted_at:
            raise PermissionDenied("You cannot edit a deleted post.")
        attachments = self._validate_attachments(
            self.request.FILES.getlist("attachments")
        )
        extra = {}
        new_body = serializer.validated_data.get("body")
        if new_body is not None and new_body != instance.body:
            extra["is_edited"] = True
            if not instance.original_body:
                extra["original_body"] = instance.body
            extra["last_edited_at"] = timezone.now()
            extra["last_edited_by"] = self.request.user

        with transaction.atomic():
            post = serializer.save(**extra)
            self._remove_attachments(post, self.request)
            self._add_attachments(post, attachments)

        new_mentions = getattr(serializer, "_newly_tagged_members", [])
        if new_mentions:
            self._notify_tagged_members(post, new_mentions)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        from public_hub.models import ContentDocument
        if ContentDocument.objects.filter(hub_post_id=instance.pk).exists():
            raise PermissionDenied("Use the publishing workspace to revise or archive editorial content.")
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_post(instance)
        membership = scope.get("request_membership")
        is_author = False
        if instance.author_membership_id and instance.author_membership_id == getattr(
            membership, "id", None
        ):
            is_author = True
        elif instance.author_user_id == request.user.id:
            is_author = True
        if not is_author:
            raise PermissionDenied("Only the author can delete this post.")
        if not instance.deleted_at:
            instance.soft_delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="pin")
    def pin(self, request, pk=None):
        post = self.get_object()
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_post(post)
        if not (
            scope.get("has_admin_permissions") or scope.get("has_group_admin_permissions")
        ):
            raise PermissionDenied("Only admins can pin posts.")
        if post.deleted_at:
            raise PermissionDenied("Cannot pin a deleted post.")
        if not post.is_pinned:
            post.is_pinned = True
            post.pinned_at = timezone.now()
            post.pinned_by = request.user
            post.save(update_fields=["is_pinned", "pinned_at", "pinned_by"])
        self._prepare_serializer_context(scope)
        serializer = self.get_serializer(post)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="unpin")
    def unpin(self, request, pk=None):
        post = self.get_object()
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_post(post)
        if not (
            scope.get("has_admin_permissions") or scope.get("has_group_admin_permissions")
        ):
            raise PermissionDenied("Only admins can unpin posts.")
        if post.is_pinned:
            post.is_pinned = False
            post.pinned_at = None
            post.pinned_by = None
            post.save(update_fields=["is_pinned", "pinned_at", "pinned_by"])
        self._prepare_serializer_context(scope)
        serializer = self.get_serializer(post)
        return Response(serializer.data)


class HubCommentViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = HubCommentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def _get_post(self):
        if hasattr(self, "_cached_post"):
            return self._cached_post
        post = get_object_or_404(
            PharmacyHubPost.objects.select_related(
                "pharmacy",
                "organization",
                "community_group",
            ),
            pk=self.kwargs["post_pk"],
            deleted_at__isnull=True,
        )
        resolver = HubScopeResolver(self.request.user)
        scope = resolver.from_post(post)
        self._cached_post = post
        self.scope_context = scope
        self.resolver = resolver
        return post

    def get_queryset(self):
        post = self._get_post()
        return (
            post.comments.filter(deleted_at__isnull=True)
            .select_related("author_membership__user", "author_user")
            .prefetch_related("reactions")
            .order_by("created_at")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        scope = getattr(self, "scope_context", {})
        context.update(
            {
                "request_membership": scope.get("request_membership"),
                "has_admin_permissions": scope.get("has_admin_permissions", False)
                or scope.get("has_group_admin_permissions", False),
            }
        )
        return context

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        post = self._get_post()
        if not post.allow_comments:
            raise ValidationError({"detail": "Comments are disabled for this post."})
        resolver = getattr(self, "resolver", HubScopeResolver(request.user))
        membership = self.scope_context.get("request_membership")
        if membership is None and self.scope_context.get("scope_type") != "platform":
            membership = resolver.ensure_author_membership(self.scope_context)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(
            post=post,
            author_membership=membership,
            author_user=request.user,
            original_body=serializer.validated_data.get("body", ""),
            is_edited=False,
            last_edited_at=None,
            last_edited_by=None,
        )
        post.recompute_comment_count()
        actor_user = getattr(membership, "user", None) or request.user
        actor_name = _get_user_display_name(actor_user)
        _notify_hub_post_owner(
            post=post,
            actor_user=actor_user,
            title=f"{actor_name} has commented on the post",
            body=(comment.body or "").strip()[:280],
            payload={"comment_id": comment.id},
        )
        output = self.get_serializer(comment)
        return Response(output.data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        comment = self.get_object()
        membership = self.scope_context.get("request_membership")
        can_manage = self.scope_context.get("has_admin_permissions")
        is_author = (
            (comment.author_membership_id is not None and comment.author_membership_id == getattr(membership, "id", None))
            or comment.author_user_id == getattr(self.request.user, "id", None)
        )
        if not can_manage and not is_author:
            raise PermissionDenied("You cannot edit this comment.")
        extra = {}
        new_body = serializer.validated_data.get("body")
        if new_body is not None and new_body != comment.body:
            extra["is_edited"] = True
            if not comment.original_body:
                extra["original_body"] = comment.body
            extra["last_edited_at"] = timezone.now()
            extra["last_edited_by"] = self.request.user
        serializer.save(**extra)

    def destroy(self, request, *args, **kwargs):
        comment = self.get_object()
        membership = self.scope_context.get("request_membership")
        can_manage = self.scope_context.get("has_admin_permissions")
        is_author = (
            (comment.author_membership_id is not None and comment.author_membership_id == getattr(membership, "id", None))
            or comment.author_user_id == getattr(request.user, "id", None)
        )
        if not can_manage and not is_author:
            raise PermissionDenied("You cannot delete this comment.")
        if not comment.deleted_at:
            comment.soft_delete()
            comment.post.recompute_comment_count()
        return Response(status=status.HTTP_204_NO_CONTENT)


class HubReactionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, post_pk: int):
        post = get_object_or_404(
            PharmacyHubPost.objects.select_related(
                "author_membership__user",
                "author_user",
                "pharmacy",
                "organization",
                "community_group",
            ),
            pk=post_pk,
            deleted_at__isnull=True,
        )
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_post(post)
        membership = scope.get("request_membership")
        serializer = HubReactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reaction_type = serializer.validated_data["reaction_type"]
        _upsert_identity_reaction(
            PharmacyHubReaction.objects.filter(post=post),
            user=request.user,
            member=membership,
            reaction_type=reaction_type,
            create_kwargs={"post": post},
        )
        post.recompute_reaction_summary()
        actor_user = getattr(membership, "user", None) or request.user
        actor_name = _get_user_display_name(actor_user)
        _notify_hub_post_owner(
            post=post,
            actor_user=actor_user,
            title=f"{actor_name} has reacted to the post",
            body=reaction_type.replace("_", " ").title(),
            payload={"reaction_type": reaction_type},
        )
        context = {
            "request": request,
            "request_membership": membership,
            "has_admin_permissions": scope.get("has_admin_permissions", False),
            "has_group_admin_permissions": scope.get(
                "has_group_admin_permissions", False
            ),
        }
        response = HubPostSerializer(post, context=context)
        return Response(response.data)

    def delete(self, request, post_pk: int):
        post = get_object_or_404(
            PharmacyHubPost,
            pk=post_pk,
            deleted_at__isnull=True,
        )
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_post(post)
        membership = scope.get("request_membership")
        _delete_identity_reactions(
            PharmacyHubReaction.objects.filter(post=post),
            user=request.user,
        )
        post.recompute_reaction_summary()
        return Response(status=status.HTTP_204_NO_CONTENT)


class HubCommentReactionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_comment(self, post_pk: int, comment_pk: int):
        return get_object_or_404(
            PharmacyHubComment.objects.select_related(
                "post",
                "post__pharmacy",
                "post__organization",
                "post__community_group",
            ),
            pk=comment_pk,
            post_id=post_pk,
            deleted_at__isnull=True,
            post__deleted_at__isnull=True,
        )

    def _serializer_context(self, scope, membership):
        return {
            "request": self.request,
            "request_membership": membership,
            "has_admin_permissions": scope.get("has_admin_permissions", False),
            "has_group_admin_permissions": scope.get(
                "has_group_admin_permissions", False
            ),
        }

    def post(self, request, post_pk: int, comment_pk: int):
        comment = self._get_comment(post_pk, comment_pk)
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_post(comment.post)
        membership = scope.get("request_membership")
        serializer = HubReactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reaction_type = serializer.validated_data["reaction_type"]
        _upsert_identity_reaction(
            PharmacyHubCommentReaction.objects.filter(comment=comment),
            user=request.user,
            member=membership,
            reaction_type=reaction_type,
            create_kwargs={"comment": comment},
        )
        comment.recompute_reaction_summary()
        serializer_context = self._serializer_context(scope, membership)
        response = HubCommentSerializer(comment, context=serializer_context)
        return Response(response.data)

    def delete(self, request, post_pk: int, comment_pk: int):
        comment = self._get_comment(post_pk, comment_pk)
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_post(comment.post)
        membership = scope.get("request_membership")
        _delete_identity_reactions(
            PharmacyHubCommentReaction.objects.filter(comment=comment),
            user=request.user,
        )
        comment.recompute_reaction_summary()
        serializer_context = self._serializer_context(scope, membership)
        response = HubCommentSerializer(comment, context=serializer_context)
        return Response(response.data, status=status.HTTP_200_OK)
