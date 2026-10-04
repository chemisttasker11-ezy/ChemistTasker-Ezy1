"""Hub polls with their votes, comments and reactions."""
from collections.abc import Mapping
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q, F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from pharmacy_hub.models import (
    PharmacyHubPoll,
    PharmacyHubPollComment,
    PharmacyHubPollOption,
    PharmacyHubPollReaction,
    PharmacyHubPollVote,
)
from pharmacy_hub.serializers import HubPollCommentSerializer, HubPollSerializer, HubReactionSerializer
from pharmacy_hub.access import HubScopeResolver
from pharmacy_hub.scoping import HubScopedViewSetMixin
from memberships.models import Membership


User = get_user_model()


class HubPollViewSet(
    HubScopedViewSetMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = HubPollSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            PharmacyHubPoll.objects.select_related(
                "pharmacy",
                "organization",
                "community_group",
                "created_by",
                "created_by_membership__user",
            )
            .prefetch_related(
                "options",
                "votes__membership",
                "reactions",
                "comments__author_membership__user",
                "comments__author_user",
            )
            .order_by("-created_at")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context.update(getattr(self, "extra_serializer_context", {}))
        return context

    def _set_vote_cache(self, polls):
        if not polls:
            return
        for poll in polls:
            prefetched = getattr(poll, "_prefetched_objects_cache", {})
            votes = prefetched.get("votes")
            if votes is not None:
                poll._prefetched_votes = list(votes)

    def _apply_scope_filter(self, queryset, scope):
        if scope["scope_type"] == "platform":
            return queryset.filter(platform_hub=scope["platform_hub"])
        if scope["scope_type"] == "group":
            return queryset.filter(community_group=scope["community_group"])
        if scope["scope_type"] == "pharmacy":
            return queryset.filter(
                pharmacy=scope["pharmacy"],
                community_group__isnull=True
            )
        # Organization scope: include polls tied to the org or any pharmacy within the org, excluding group polls
        org = scope.get("organization")
        return queryset.filter(
            Q(organization=org) | Q(pharmacy__organization=org),
            community_group__isnull=True,
        )

    def list(self, request, *args, **kwargs):
        scope = self._resolve_scope_from_params(request.query_params)
        queryset = self._apply_scope_filter(self.get_queryset(), scope)
        self._prepare_serializer_context(scope, {"request_user": self.request.user})
        page = self.paginate_queryset(queryset)
        polls = page if page is not None else queryset
        self._set_vote_cache(polls)
        serializer = self.get_serializer(polls, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        data = self._normalize_params(request.data)
        labels = self._coerce_option_labels(
            data.get("option_labels")
            or data.get("options")
            or data.get("choices")
            or data.get("labels")
        )
        if labels is not None:
            data["option_labels"] = labels
        scope = self._resolve_scope_from_params(data)
        resolver = HubScopeResolver(request.user)
        membership = scope.get("request_membership")
        if membership is None and scope.get("scope_type") != "platform":
            membership = resolver.ensure_author_membership(scope)
        scope["request_membership"] = membership
        self._prepare_serializer_context(scope, {"request_user": self.request.user})
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        poll = serializer.save()
        refreshed = self.get_queryset().get(pk=poll.pk)
        self._set_vote_cache([refreshed])
        output = self.get_serializer(refreshed)
        headers = self.get_success_headers(output.data)
        return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)

    def retrieve(self, request, *args, **kwargs):
        poll = self.get_object()
        scope = HubScopeResolver(request.user).from_poll(poll)
        self._prepare_serializer_context(scope, {"request_user": self.request.user})
        self._set_vote_cache([poll])
        serializer = self.get_serializer(poll)
        return Response(serializer.data)

    def _assert_can_manage_poll(self, poll):
        resolver = HubScopeResolver(self.request.user)
        scope = resolver.from_poll(poll)
        membership = scope.get("request_membership")
        is_creator = (
            getattr(poll, "created_by_id", None) == getattr(self.request.user, "id", None)
            or getattr(poll, "created_by_membership_id", None) == getattr(membership, "id", None)
        )
        if not (
            is_creator
            or scope.get("has_admin_permissions")
            or scope.get("has_group_admin_permissions")
        ):
            raise PermissionDenied("You do not have permission to modify this poll.")
        return scope

    def perform_destroy(self, instance):
        self._assert_can_manage_poll(instance)
        super().perform_destroy(instance)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        poll = self.get_object()
        scope = self._assert_can_manage_poll(poll)
        data = self._normalize_params(request.data)
        labels = self._coerce_option_labels(
            data.get("option_labels")
            or data.get("options")
            or data.get("choices")
            or data.get("labels")
        )
        if labels is not None:
            data["option_labels"] = labels
        self._prepare_serializer_context(scope, {"request_user": self.request.user})
        serializer = self.get_serializer(poll, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        refreshed = self.get_queryset().get(pk=updated.pk)
        self._prepare_serializer_context(scope, {"request_user": self.request.user})
        self._set_vote_cache([refreshed])
        output = self.get_serializer(refreshed)
        return Response(output.data)

    @action(detail=True, methods=["post"], url_path="vote")
    def vote(self, request, pk=None):
        poll = self.get_object()
        option_id = request.data.get("option_id")
        if not option_id:
            raise ValidationError({"option_id": "This field is required."})
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_poll(poll)
        membership = scope.get("request_membership")
        if membership is None and scope.get("scope_type") != "platform":
            membership = resolver.ensure_author_membership(scope)
        try:
            option_id = int(option_id)
        except (TypeError, ValueError):
            raise ValidationError({"option_id": "Invalid option."})
        with transaction.atomic():
            # A person's hub identity may move between the explicit User FK and
            # a pharmacy Membership FK over time. Serialize by User and look
            # through every membership owned by that user so the same human
            # cannot acquire a second vote merely because their representation
            # changed.
            User.objects.select_for_update().only("pk").get(pk=request.user.pk)

            option = (
                PharmacyHubPollOption.objects.select_for_update()
                .filter(poll=poll, pk=option_id)
                .first()
            )
            if not option:
                raise ValidationError({"option_id": "Invalid option."})

            membership_ids = Membership.objects.filter(
                user_id=request.user.id
            ).values_list("id", flat=True)
            identity_votes = list(
                PharmacyHubPollVote.objects.select_for_update()
                .select_related("option")
                .filter(poll=poll)
                .filter(
                    Q(user_id=request.user.id)
                    | Q(membership_id__in=membership_ids)
                )
                .order_by("id")
            )
            vote = identity_votes[0] if identity_votes else None

            # Historical versions could store one user-keyed and one
            # membership-keyed vote for the same person. Collapse such rows on
            # the next write and repair their materialized option counts.
            for duplicate in identity_votes[1:]:
                PharmacyHubPollOption.objects.filter(pk=duplicate.option_id).update(
                    vote_count=F("vote_count") - 1
                )
                duplicate.delete()

            if vote and vote.option_id == option.id:
                pass
            else:
                if vote:
                    PharmacyHubPollOption.objects.filter(pk=vote.option_id).update(
                        vote_count=F("vote_count") - 1
                    )
                    vote.option = option
                    vote.save(update_fields=["option"])
                else:
                    create_kwargs = {
                        "poll": poll,
                        "option": option,
                    }
                    if membership:
                        create_kwargs["membership"] = membership
                    else:
                        create_kwargs["user"] = request.user
                    PharmacyHubPollVote.objects.create(**create_kwargs)
                PharmacyHubPollOption.objects.filter(pk=option.id).update(
                    vote_count=F("vote_count") + 1
                )
        refreshed = self.get_queryset().get(pk=poll.pk)
        self._prepare_serializer_context(scope, {"request_user": self.request.user})
        self._set_vote_cache([refreshed])
        serializer = self.get_serializer(refreshed)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def _coerce_option_labels(self, raw):
        if raw is None:
            return None
        if isinstance(raw, str):
            tokens = raw.replace("\r", "").replace("\n", ",").split(",")
            labels = [token.strip() for token in tokens if token.strip()]
            return labels if labels else None
        if isinstance(raw, list):
            labels = []
            for item in raw:
                if isinstance(item, str):
                    label = item.strip()
                elif isinstance(item, Mapping):
                    label = str(item.get("label") or item.get("value") or "").strip()
                else:
                    label = ""
                if label:
                    labels.append(label)
            return labels if labels else None
        if isinstance(raw, Mapping):
            labels = [str(v).strip() for v in raw.values() if str(v).strip()]
            return labels if labels else None
        return None


class HubPollCommentViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = HubPollCommentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def _get_poll(self):
        if hasattr(self, "_cached_poll"):
            return self._cached_poll
        poll = get_object_or_404(
            PharmacyHubPoll.objects.select_related(
                "pharmacy",
                "organization",
                "community_group",
            ),
            pk=self.kwargs["poll_pk"],
        )
        resolver = HubScopeResolver(self.request.user)
        scope = resolver.from_poll(poll)
        self._cached_poll = poll
        self.scope_context = scope
        self.resolver = resolver
        return poll

    def get_queryset(self):
        poll = self._get_poll()
        return (
            poll.comments.filter(deleted_at__isnull=True)
            .select_related("author_membership__user", "author_user")
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
        poll = self._get_poll()
        scope = self.scope_context
        resolver = getattr(self, "resolver", HubScopeResolver(request.user))
        membership = scope.get("request_membership")
        if membership is None and scope.get("scope_type") != "platform":
            membership = resolver.ensure_author_membership(scope)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = PharmacyHubPollComment.objects.create(
            poll=poll,
            author_membership=membership,
            author_user=request.user,
            body=serializer.validated_data.get("body", ""),
            original_body=serializer.validated_data.get("body", ""),
            is_edited=False,
            last_edited_at=None,
            last_edited_by=None,
        )
        poll.recompute_comment_count()
        output = self.get_serializer(comment)
        return Response(output.data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        comment = self.get_object()
        membership = self.scope_context.get("request_membership")
        can_manage = self.scope_context.get("has_admin_permissions")
        request_user = getattr(self.request, "user", None)
        is_author = (
            (comment.author_membership_id is not None and comment.author_membership_id == getattr(membership, "id", None))
            or comment.author_user_id == getattr(request_user, "id", None)
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
            or comment.author_user_id == request.user.id
        )
        if not can_manage and not is_author:
            raise PermissionDenied("You cannot delete this comment.")
        if not comment.deleted_at:
            comment.soft_delete()
            comment.poll.recompute_comment_count()
        return Response(status=status.HTTP_204_NO_CONTENT)


class HubPollReactionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, poll_pk: int):
        poll = get_object_or_404(PharmacyHubPoll, pk=poll_pk)
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_poll(poll)
        serializer = HubReactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reaction_type = serializer.validated_data["reaction_type"]
        PharmacyHubPollReaction.objects.update_or_create(
            poll=poll,
            user=request.user,
            defaults={
                "reaction_type": reaction_type,
                "updated_at": timezone.now(),
            },
        )
        poll.recompute_reaction_summary()
        context = {
            "request": request,
            "request_membership": scope.get("request_membership"),
            "has_admin_permissions": scope.get("has_admin_permissions", False),
            "has_group_admin_permissions": scope.get(
                "has_group_admin_permissions", False
            ),
            "request_user": request.user,
        }
        response = HubPollSerializer(poll, context=context)
        return Response(response.data)

    def delete(self, request, poll_pk: int):
        poll = get_object_or_404(PharmacyHubPoll, pk=poll_pk)
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_poll(poll)
        PharmacyHubPollReaction.objects.filter(poll=poll, user=request.user).delete()
        poll.recompute_reaction_summary()
        context = {
            "request": request,
            "request_membership": scope.get("request_membership"),
            "has_admin_permissions": scope.get("has_admin_permissions", False),
            "has_group_admin_permissions": scope.get(
                "has_group_admin_permissions", False
            ),
            "request_user": request.user,
        }
        response = HubPollSerializer(poll, context=context)
        return Response(response.data, status=status.HTTP_200_OK)
