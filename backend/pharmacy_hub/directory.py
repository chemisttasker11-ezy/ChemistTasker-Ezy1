"""Hub member directory: the people a viewer may tag or add in one hub scope, by name only.

The mention and group-member pickers used the staff membership list, which returns contact details and, for an
organisation, every member of every pharmacy. The directory returns only what a picker shows (name, role, job title,
pharmacy) for the active staff of the requested scope, lists the viewer's own pharmacies first and searches on the
server so a large organisation stays usable.
"""
from django.db.models import Case, IntegerField, Q, Value, When
from rest_framework import permissions
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from memberships.models import Membership, PHARMACY_STAFF_EMPLOYMENT_TYPES
from pharmacy_hub.access import HubScopeResolver
from pharmacy_hub.models import PharmacyCommunityGroupMembership
from users.presentation import _build_absolute_media_url, _resolve_user_profile_photo

DEFAULT_LIMIT = 200
MAX_LIMIT = 200


def _scope_from_params(user, params):
    scope_type = params.get("scope")
    resolver = HubScopeResolver(user)
    if scope_type == "pharmacy" and params.get("pharmacy_id"):
        return resolver.pharmacy_scope(params["pharmacy_id"])
    if scope_type == "organization" and params.get("organization_id"):
        return resolver.organization_scope(params["organization_id"])
    if scope_type == "group" and params.get("group_id"):
        return resolver.group_scope(params["group_id"])
    raise ValidationError(
        {"scope": "Provide scope=pharmacy&pharmacy_id, scope=organization&organization_id or scope=group&group_id."}
    )


def directory_memberships(user, scope, *, search="", limit=DEFAULT_LIMIT):
    queryset = Membership.objects.filter(
        is_active=True,
        status=Membership.Status.ACCEPTED,
        employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
    )
    if scope["scope_type"] == "group":
        queryset = queryset.filter(
            id__in=PharmacyCommunityGroupMembership.objects.filter(
                group=scope["community_group"]
            ).values("membership_id")
        )
    elif scope["scope_type"] == "pharmacy":
        queryset = queryset.filter(pharmacy=scope["pharmacy"])
    else:
        queryset = queryset.filter(pharmacy__organization=scope["organization"])

    for term in search.split():
        queryset = queryset.filter(
            Q(user__first_name__icontains=term)
            | Q(user__last_name__icontains=term)
            | Q(invited_name__icontains=term)
            | Q(job_title__icontains=term)
            | Q(pharmacy__name__icontains=term)
        )

    own_pharmacy_ids = list(
        Membership.objects.filter(
            user=user,
            is_active=True,
            employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
        ).values_list("pharmacy_id", flat=True)
    )
    return (
        queryset.select_related(
            "user",
            "pharmacy",
            # Profile photos live on the onboarding profile; join them so the directory stays one query.
            "user__pharmacistonboarding",
            "user__otherstaffonboarding",
            "user__exploreronboarding",
            "user__owneronboarding",
        )
        .annotate(
            is_own_pharmacy=Case(
                When(pharmacy_id__in=own_pharmacy_ids, then=Value(1)),
                default=Value(0),
                output_field=IntegerField(),
            )
        )
        .order_by("-is_own_pharmacy", "pharmacy__name", "user__first_name", "user__last_name", "id")[:limit]
    )


def _full_name(membership):
    user = membership.user
    name = " ".join(part for part in (user.first_name, user.last_name) if part).strip() if user else ""
    return name or (membership.invited_name or "").strip() or "Member"


class HubMemberDirectoryView(APIView):
    """GET hub/members/?scope=pharmacy|organization|group&<scope>_id=&search=&limit= (name, photo and role; no contact details)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        scope = _scope_from_params(request.user, request.query_params)
        try:
            limit = int(request.query_params.get("limit") or DEFAULT_LIMIT)
        except (TypeError, ValueError):
            raise ValidationError({"limit": "Must be an integer."})
        limit = max(1, min(limit, MAX_LIMIT))
        search = (request.query_params.get("search") or "").strip()[:100]
        rows = [
            {
                "membership_id": membership.id,
                "user_id": membership.user_id,
                "full_name": _full_name(membership),
                "profile_photo_url": _build_absolute_media_url(request, _resolve_user_profile_photo(membership.user)),
                "role": membership.role,
                "employment_type": membership.employment_type,
                "job_title": membership.job_title or "",
                "pharmacy_id": membership.pharmacy_id,
                "pharmacy_name": membership.pharmacy.name if membership.pharmacy else "",
                "is_own_pharmacy": bool(membership.is_own_pharmacy),
            }
            for membership in directory_memberships(request.user, scope, search=search, limit=limit)
        ]
        return Response(rows)
