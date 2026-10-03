"""Talent/explorer posts API: feeds, public feed, create/update/delete, views and reactions."""
from rest_framework import permissions, viewsets
from rest_framework.pagination import PageNumberPagination
from onboarding.models import OtherStaffOnboarding, PharmacistOnboarding
from talent.models import ExplorerPost, ExplorerPostReaction
from ratings.models import Rating
from django.db import models
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from django.db.models import Avg, Count, Q
from django.utils import timezone
from django.db import transaction
from talent.serializers.explorer import (
    ExplorerPostReadSerializer,
    ExplorerPostWriteSerializer,
    PublicExplorerPostReadSerializer,
)


# -----------------------------------------------------------------------------
# Explorer 
# -----------------------------------------------------------------------------
class IsPostOwner(permissions.BasePermission):
    """
    Object-level check: user must own the post (author_user or explorer_profile).
    """

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if getattr(obj, "author_user_id", None) == request.user.id:
            return True
        return getattr(obj.explorer_profile, "user_id", None) == request.user.id


class TalentPostPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200


class ExplorerPostViewSet(viewsets.ModelViewSet):
    """
    Authenticated users can view.
    Only Explorers (who own the profile) can create/update/delete/react.
    """
    queryset = (
        ExplorerPost.objects
        .select_related("explorer_profile__user", "author_user")
        .annotate(
            rating_average=Avg(
                "author_user__ratings_received_as_worker__stars",
                filter=Q(author_user__ratings_received_as_worker__direction=Rating.Direction.OWNER_TO_WORKER),
            ),
            rating_count=Count(
                "author_user__ratings_received_as_worker",
                filter=Q(author_user__ratings_received_as_worker__direction=Rating.Direction.OWNER_TO_WORKER),
                distinct=True,
            ),
        )
        .order_by("-created_at")
    )
    parser_classes = (MultiPartParser, FormParser, JSONParser)
    pagination_class = TalentPostPagination

    # --------- serializers ---------
    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return ExplorerPostWriteSerializer
        return ExplorerPostReadSerializer

    # --------- permissions ---------
    def get_permissions(self):
        # Read-only endpoints → any authenticated user
        read_actions = ["list", "retrieve", "feed", "by_profile", "add_view"]
        public_read_actions = ["public_feed"]

        # Owner-required writes → must be Explorer (ownership checked later)
        owner_write_actions = ["create", "update", "partial_update", "destroy"]

        # Reactions → any authenticated user (no Explorer requirement)
        react_actions = ["like", "unlike"]

        if self.action in public_read_actions:
            return [AllowAny()]
        if self.action in read_actions:
            return [permissions.IsAuthenticated()]
        if self.action in owner_write_actions:
            return [permissions.IsAuthenticated()]
        if self.action in react_actions:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated()]


    def perform_create(self, serializer):
        """
        Enforce that the creating user owns the explorer_profile (if provided)
        and stamp author_user.
        """
        if not (self.request.user.is_explorer() or self.request.user.is_pharmacist() or self.request.user.is_otherstaff()):
            raise PermissionDenied("Only Explorer, Pharmacist, or Other Staff can create posts.")
        self._require_public_staff_access()
        explorer_profile = serializer.validated_data.get("explorer_profile")
        if explorer_profile is not None and explorer_profile.user_id != self.request.user.id:
            raise PermissionDenied("You can only post from your own explorer profile.")
        serializer.save(author_user=self.request.user)

    def perform_update(self, serializer):
        # Only owner can update (object-level)
        instance = self.get_object()
        self.check_object_permissions_for_write(instance)
        self._require_public_staff_access()
        serializer.save()

    def _require_public_staff_access(self):
        """An owner invitation grants internal membership, not public Talent access."""
        user = self.request.user
        if user.role not in ("PHARMACIST", "OTHER_STAFF"):
            return
        profile = (PharmacistOnboarding if user.role == "PHARMACIST" else OtherStaffOnboarding).objects.filter(user=user).first()
        if not user.is_active or not user.is_mobile_verified or not profile or not profile.verified:
            raise PermissionDenied("Verify your public-platform onboarding before publishing availability.")
        if user.role == "PHARMACIST" and (
            not profile.ahpra_verified or
            (profile.ahpra_expiry_date and profile.ahpra_expiry_date < timezone.localdate())
        ):
            raise PermissionDenied("A current verified pharmacist registration is required to publish availability.")

    def perform_destroy(self, instance):
        # Only owner can delete (object-level)
        self.check_object_permissions_for_write(instance)
        instance.delete()

    def check_object_permissions_for_write(self, obj):
        if not IsPostOwner().has_object_permission(self.request, self, obj):
            raise PermissionDenied("Only the owner can modify this post.")

    def _visible_posts(self, queryset):
        today = timezone.localdate()
        return [post for post in queryset if post.is_talent_board_visible(today=today)]

    # --------- Feeds ---------
    @action(detail=False, methods=["get"], url_path="feed")
    def feed(self, request):
        """
        Newest-first feed. (Extend with follow-graph later if needed.)
        """
        qs = self._visible_posts(self.filter_queryset(self.get_queryset()))
        page = self.paginate_queryset(qs)
        ser = ExplorerPostReadSerializer(page or qs, many=True, context={"request": request})
        if page is not None:
            return self.get_paginated_response(ser.data)
        return Response(ser.data)

    @action(detail=False, methods=["get"], url_path="public-feed", permission_classes=[AllowAny])
    def public_feed(self, request):
        """
        Public feed for non-authenticated users.
        """
        qs = self._visible_posts(self.filter_queryset(self.get_queryset()))
        page = self.paginate_queryset(qs)
        ser = PublicExplorerPostReadSerializer(page or qs, many=True, context={"request": request})
        if page is not None:
            return self.get_paginated_response(ser.data)
        return Response(ser.data)

    @action(detail=False, methods=["get"], url_path=r"by-profile/(?P<profile_id>[^/.]+)")
    def by_profile(self, request, profile_id=None):
        qs = self._visible_posts(self.get_queryset().filter(explorer_profile_id=profile_id))
        page = self.paginate_queryset(qs)
        ser = ExplorerPostReadSerializer(page or qs, many=True, context={"request": request})
        if page is not None:
            return self.get_paginated_response(ser.data)
        return Response(ser.data)

    # --------- Lightweight counters ---------
    @action(detail=True, methods=["post"], url_path="view")
    def add_view(self, request, pk=None):
        """
        Increment view count; any authenticated user can call.
        """
        post = self.get_object()
        ExplorerPost.objects.filter(pk=post.pk).update(view_count=models.F("view_count") + 1)
        post.refresh_from_db(fields=["view_count"])
        return Response({"view_count": post.view_count})

    # --------- Reactions (like/unlike) (owner NOT required, but must be Explorer) ---------
    @action(detail=True, methods=["post"], url_path="like")
    def like(self, request, pk=None):
        """
        Like a post; available to any authenticated user.
        """
        post = self.get_object()
        created = False
        with transaction.atomic():
            obj, created = ExplorerPostReaction.objects.get_or_create(post=post, user=request.user)
            if created:
                ExplorerPost.objects.filter(pk=post.pk).update(like_count=models.F("like_count") + 1)
        post.refresh_from_db(fields=["like_count"])
        return Response({"liked": True, "like_count": post.like_count, "created": created})

    @action(detail=True, methods=["post"], url_path="unlike")
    def unlike(self, request, pk=None):
        """
        Unlike a post; available to any authenticated user.
        """
        post = self.get_object()
        with transaction.atomic():
            deleted, _ = ExplorerPostReaction.objects.filter(post=post, user=request.user).delete()
            if deleted:
                ExplorerPost.objects.filter(pk=post.pk).update(like_count=models.F("like_count") - 1)
        post.refresh_from_db(fields=["like_count"])
        return Response({"liked": False, "like_count": post.like_count, "deleted": bool(deleted)})
