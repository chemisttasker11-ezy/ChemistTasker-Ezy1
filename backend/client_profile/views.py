# client_profile/views.py
from rest_framework import generics, permissions, status, viewsets, mixins, serializers
from rest_framework.pagination import PageNumberPagination
from .models import (
    Chain,
    Conversation,
    ExplorerOnboarding,
    ExplorerPost,
    ExplorerPostReaction,
    FAVORITE_STAFF_EMPLOYMENT_TYPES,
    Invoice,
    make_dm_key,
    Membership,
    MembershipApplication,
    MembershipInviteLink,
    Message,
    MessageReaction,
    Notification,
    Organization,
    OtherStaffOnboarding,
    OwnerOnboarding,
    Participant,
    PharmacistOnboarding,
    Pharmacy,
    PHARMACY_STAFF_EMPLOYMENT_TYPES,
    PharmacyAdmin,
    PharmacyClaim,
    PharmacyHubPost,
    PillLedgerEntry,
    PillReferralEvent,
    PillRewardRule,
    Rating,
    RefereeResponse,
    RosterPeriod,
    Shift,
    ShiftCounterOffer,
    ShiftDescriptionTemplate,
    ShiftInterest,
    ShiftOffer,
    ShiftProfileAccessAudit,
    ShiftRejection,
    ShiftSaved,
    ShiftSlot,
    ShiftSlotAssignment,
    UserAvailability,
    WorkerShiftRequest,
)
from .serializers import (
    ChainSerializer,
    ChatParticipantSerializer,
    ClaimReferralSerializer,
    ConversationCreateSerializer,
    ConversationDetailSerializer,
    ConversationListSerializer,
    CreateFriendReferralSerializer,
    CreateShiftReferralSerializer,
    ExplorerOnboardingV2Serializer,
    ExplorerPostReadSerializer,
    ExplorerPostWriteSerializer,
    InvoiceSerializer,
    MembershipApplicationReviewSerializer,
    MembershipApplicationSerializer,
    MembershipInviteLinkSerializer,
    MembershipSerializer,
    MessageSerializer,
    MyRatingSerializer,
    MyShiftSerializer,
    NotificationSerializer,
    OpenShiftSerializer,
    OrganizationSerializer,
    OtherStaffOnboardingV2Serializer,
    OwnerOnboardingV2Serializer,
    PendingRatingsSerializer,
    PharmacistOnboardingV2Serializer,
    PharmacyAdminSerializer,
    PharmacyClaimCreateSerializer,
    PharmacyClaimSerializer,
    PharmacySerializer,
    PillBalanceSerializer,
    PillLedgerEntrySerializer,
    PillReferralCodeSerializer,
    PillReferralEventSerializer,
    PillRewardRuleSerializer,
    PublicExplorerPostReadSerializer,
    PublicOrganizationSerializer,
    RatingReadSerializer,
    RatingSummarySerializer,
    RatingWriteSerializer,
    RefereeResponseSerializer,
    RosterAssignmentSerializer,
    SharedShiftSerializer,
    ShiftCounterOfferSerializer,
    ShiftDescriptionTemplateSerializer,
    ShiftInterestSerializer,
    ShiftOfferSerializer,
    ShiftRejectionSerializer,
    ShiftSavedSerializer,
    ShiftSerializer,
    ShiftSlotSerializer,
    UserAvailabilitySerializer,
    WorkerShiftRequestSerializer,
)
from users.permissions import (
    AuthenticatedOrganizationMember,
    IsExplorer,
    IsOtherstaff,
    IsOTPVerified,
    IsOwner,
    IsPharmacist,
    OrganizationRolePermission,
)
from django.db import models
# KNOWN QUIRK (frozen on purpose, see the "KNOWN QUIRK" characterization tests): `ValidationError` has always
# resolved to Django's class in this module, because `from .models import *` used to rebind it over DRF's.
# DRF does not convert Django's, so raise sites using this name return 500. Switching to DRF's is a behaviour change.
from django.core.exceptions import ValidationError
from .serializers import required_user_role_for_membership
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, SAFE_METHODS, AllowAny
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.exceptions import NotFound, APIException, PermissionDenied, NotAuthenticated
from rest_framework.exceptions import ValidationError as DRFValidationError
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.decorators import action, api_view, permission_classes
from .admin_helpers import (
    pharmacies_user_admins,
    has_admin_capability,
    CAPABILITY_MANAGE_ADMINS,
    CAPABILITY_MANAGE_STAFF,
    CAPABILITY_MANAGE_ROSTER,
    CAPABILITY_MANAGE_COMMS,
    is_any_admin,
    is_admin_of,
)
from users.serializers import (
    UserProfileSerializer,
)
from django.shortcuts import get_object_or_404
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
import json
from django.db.models import Q, Count, F, Avg, Exists, OuterRef, Max, Sum
from django.utils import timezone
from client_profile.services import get_locked_rate_for_slot, expand_shift_slots, generate_invoice_from_shifts, render_invoice_to_pdf, generate_preview_invoice_lines
from client_profile.utils import (
    active_shift_url_for_user,
    build_offer_shift_details,
    build_shift_email_context,
    clean_email,
    build_roster_email_link,
    get_frontend_dashboard_url,
    sanitize_chat_text,
    enforce_public_shift_daily_limit,
    build_shift_counter_offer_context,
    build_counter_offer_shift_details,
    build_shift_interest_context,
    build_shift_offer_context,
    finalize_shift_offer,
    membership_role_label,
    other_staff_role_label,
    send_shift_payment_finalized_notifications,
    user_work_role_label,
    worker_offer_url,
)
from client_profile.notifications import mark_notifications_read, broadcast_message_read, broadcast_message_badge, notify_users
from client_profile.shift_notifications import notify_shift_managers, notify_shift_users
from client_profile.file_validation import ATTACHMENT_UPLOAD_POLICY, validate_uploaded_file
from client_profile.engagement_routing import staff_assignment_defaults
from django.utils.crypto import get_random_string
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from django.conf import settings
from core.task_queue import async_task
from datetime import date, datetime
from zoneinfo import ZoneInfo
from django.core.signing import TimestampSigner, BadSignature
from django.contrib.contenttypes.models import ContentType
from django.apps import apps
from client_profile.tasks import cancel_referee_reminder, schedule_referee_reminder, cancel_all_referee_reminders
from client_profile.tasks import abn_lookup, _parse_abn_html_fields
from client_profile.rewards import (
    RewardError,
    claim_referral_code,
    create_friend_referral,
    create_shift_referral,
    get_or_create_referral_code,
    get_pill_balance,
    get_shift_post_pill_cost,
    seed_default_reward_rules,
    spend_pills_for_shift_post,
    user_is_referral_reward_eligible,
)













from django.db import transaction, IntegrityError
from django.db.models.deletion import ProtectedError
from datetime import timedelta                   # used in TimestampSigner max_age
from decimal import Decimal                      # used in manual_assign
import uuid                                      # used in generate_share_link
from urllib.parse import urlencode
from django.contrib.auth import get_user_model   # used in ChainViewSet.add_user
from users.models import User, OrganizationMembership, DeviceToken                    # referenced throughout (accept_user, etc.)
from users.utils import build_org_invite_context
from users.org_roles import (
    OrgCapability,
    membership_capabilities,
    membership_visible_pharmacies,
    membership_visible_pharmacy_ids,
)
from client_profile.serializers import ShiftContactSerializer, DeviceTokenSerializer
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import mimetypes
import logging

import re
# import logging
# logger = logging.getLogger("roster.debug")

# # Flip to False when done debugging
# DEBUG_VERBOSE = True

# def _dbg(msg: str):
#     # Prints to console and logger; safe to remove later
#     print(f"[CLAIM_DBG] {msg}")
#     logger.info(f"[CLAIM_DBG] {msg}")














































# --- Stage 2: names moved to client_profile/domains that this module still uses itself (imported here so module-level uses keep working) ---
from client_profile.domains.shifts.base import (
    _shift_roles_visible_to_user,
    BaseShiftViewSet,
    COMMUNITY_LEVELS,
    PUBLIC_LEVEL,
)
# --- end Stage 2 imports ---

# Dashboards
def _parse_dashboard_pharmacy_id(request):
    raw = (
        request.query_params.get("pharmacy_id")
        or request.query_params.get("pharmacy")
        or request.query_params.get("pharmacyId")
    )
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise ValidationError({"pharmacy_id": "Invalid pharmacy id."})


def _parse_dashboard_workspace(request):
    raw = str(request.query_params.get("workspace") or "").strip().lower()
    if raw in {"internal", "platform"}:
        return raw
    return "internal" if _parse_dashboard_pharmacy_id(request) is not None else "platform"


def _scope_pharmacies(pharmacies, pharmacy_id):
    if pharmacy_id is None:
        return pharmacies
    scoped = pharmacies.filter(id=pharmacy_id)
    if not scoped.exists():
        raise PermissionDenied("You do not have access to this pharmacy.")
    return scoped


def _future_shift_filter(today, now):
    return Q(slots__date__gt=today) | Q(slots__date=today, slots__end_time__gt=now)


def _active_shift_filter(today, now):
    return Q(slots__isnull=True) | _future_shift_filter(today, now)


def _public_platform_shifts(today, now):
    return Shift.objects.filter(
        visibility="PLATFORM",
        dedicated_user__isnull=True,
        slot_assignments__isnull=True,
    ).filter(
        _future_shift_filter(today, now)
    ).distinct()


def _user_confirmed_platform_shifts(user, today, now):
    return Shift.objects.filter(
        visibility="PLATFORM",
        slot_assignments__user=user,
    ).filter(
        _future_shift_filter(today, now)
    ).distinct()


def _pharmacy_confirmed_shifts(pharmacy_ids):
    return Shift.objects.filter(
        pharmacy_id__in=pharmacy_ids,
        slot_assignments__isnull=False,
    ).distinct()


def _open_active_shifts(shifts_qs, today, now):
    return shifts_qs.filter(
        _active_shift_filter(today, now),
        slot_assignments__isnull=True,
    ).distinct()


def _all_active_shifts(shifts_qs, today, now):
    return shifts_qs.filter(_active_shift_filter(today, now)).distinct()


def _membership_visibility_levels(membership):
    employment_type = str(getattr(membership, "employment_type", "") or "").upper()
    if employment_type in PHARMACY_STAFF_EMPLOYMENT_TYPES:
        return ["FULL_PART_TIME"]
    if employment_type in FAVORITE_STAFF_EMPLOYMENT_TYPES:
        return ["LOCUM_CASUAL"]
    return []


def _membership_shift_employment_types(membership):
    employment_type = str(getattr(membership, "employment_type", "") or "").upper()
    if employment_type in PHARMACY_STAFF_EMPLOYMENT_TYPES:
        return ["FULL_TIME", "PART_TIME"]
    if employment_type in FAVORITE_STAFF_EMPLOYMENT_TYPES:
        return ["LOCUM"]
    return []


def _worker_visible_pharmacy_shifts(user, pharmacy_ids):
    memberships = Membership.objects.filter(
        user=user,
        is_active=True,
        pharmacy_id__in=pharmacy_ids,
    ).select_related("pharmacy__owner", "pharmacy__organization")
    eligible_filter = Q()
    for membership in memberships:
        employment_type = str(getattr(membership, "employment_type", "") or "").upper()
        if employment_type in PHARMACY_STAFF_EMPLOYMENT_TYPES:
            eligible_filter |= Q(
                pharmacy_id=membership.pharmacy_id,
                visibility="FULL_PART_TIME",
            )
            eligible_filter |= Q(
                pharmacy_id=membership.pharmacy_id,
                visibility__in=["LOCUM_CASUAL", "PLATFORM"],
                post_anonymously=False,
            )
        elif employment_type in FAVORITE_STAFF_EMPLOYMENT_TYPES:
            eligible_filter |= Q(
                pharmacy_id=membership.pharmacy_id,
                visibility="LOCUM_CASUAL",
            )
            eligible_filter |= Q(
                pharmacy_id=membership.pharmacy_id,
                visibility="PLATFORM",
                post_anonymously=False,
            )

        owner_id = getattr(getattr(membership, "pharmacy", None), "owner_id", None)
        if owner_id:
            eligible_filter |= Q(
                pharmacy_id__in=pharmacy_ids,
                visibility="OWNER_CHAIN",
                pharmacy__owner_id=owner_id,
            )

        organization_id = getattr(getattr(membership, "pharmacy", None), "organization_id", None)
        if organization_id:
            eligible_filter |= Q(
                pharmacy_id__in=pharmacy_ids,
                visibility="ORG_CHAIN",
                pharmacy__organization_id=organization_id,
            )

    if not eligible_filter:
        return Shift.objects.none()

    role = str(getattr(user, "role", "") or "").upper()
    qs = Shift.objects.filter(eligible_filter)
    if role == "PHARMACIST":
        qs = qs.filter(role_needed="PHARMACIST")
    elif role == "OTHER_STAFF":
        qs = qs.exclude(role_needed="PHARMACIST")
    return qs.distinct()


def _dashboard_shift_box(shift):
    slot = shift.slots.order_by("date", "start_time").first()
    return {
        "id": shift.id,
        "pharmacy_name": shift.pharmacy.name if shift.pharmacy else "",
        "date": slot.date if slot else None,
    }


def _format_money(value):
    amount = Decimal(value or 0)
    return f"${amount:,.2f}"


def _dashboard_shift_action_url(shift, dashboard_role):
    if not shift:
        return ""
    role = str(dashboard_role or "").lower()
    if role == "organization":
        return f"/dashboard/organization/shifts/{shift.id}"
    if role == "pharmacist":
        return f"/dashboard/pharmacist/shifts/{shift.id}"
    if role == "otherstaff":
        return f"/dashboard/otherstaff/shifts/{shift.id}"
    return f"/dashboard/owner/shifts/{shift.id}"


def _dashboard_invoice_action_url(invoice, dashboard_role):
    if not invoice:
        return ""
    role = str(dashboard_role or "").lower()
    if role == "pharmacist":
        return f"/dashboard/pharmacist/invoice/{invoice.id}"
    if role == "otherstaff":
        return f"/dashboard/otherstaff/invoice/{invoice.id}"
    if role == "organization":
        return f"/dashboard/organization/invoice/{invoice.id}"
    if role == "owner":
        return f"/dashboard/owner/invoice/{invoice.id}"
    if role == "admin":
        pharmacy_id = getattr(invoice, "pharmacy_id", None)
        return f"/dashboard/admin/{pharmacy_id}/invoice/{invoice.id}" if pharmacy_id else ""
    return ""


def _dashboard_hub_action_url(post):
    if not post:
        return ""
    params = {"post": post.id}
    if post.community_group_id:
        params.update({"scope": "group", "group_id": post.community_group_id})
    elif post.organization_id:
        params.update({"scope": "organization", "organization_id": post.organization_id})
    elif post.pharmacy_id:
        params.update({"scope": "pharmacy", "pharmacy_id": post.pharmacy_id})
    elif post.platform_hub:
        params.update({"scope": "platform", "platform_hub": post.platform_hub})
    return f"/dashboard/pharmacy-hub?{urlencode(params)}"


def _dashboard_activity_time(value):
    return value.strftime("%d %b") if value else ""


def _dashboard_activity(*, shifts_qs, confirmed_qs, invoices_qs, pharmacy_name, dashboard_role=None, selected_pharmacy=None, user=None):
    activity = []
    shift_scope = shifts_qs
    role = str(dashboard_role or "").lower()
    pharmacy_ids = list(
        shift_scope.exclude(pharmacy_id__isnull=True)
        .values_list("pharmacy_id", flat=True)
        .distinct()[:100]
    )

    latest_shift = shift_scope.select_related("pharmacy").order_by("-created_at").first()
    if latest_shift:
        activity.append({
            "title": "Recent shift posted",
            "description": latest_shift.pharmacy.name if latest_shift.pharmacy else pharmacy_name,
            "time": _dashboard_activity_time(latest_shift.created_at),
            "kind": "shift",
            "target_type": "shift",
            "target_id": latest_shift.id,
            "action_url": _dashboard_shift_action_url(latest_shift, dashboard_role),
            "created_at": latest_shift.created_at.isoformat() if latest_shift.created_at else None,
        })

    can_show_internal_hub = role not in {"explorer"} and selected_pharmacy is not None
    if can_show_internal_hub and role in {"pharmacist", "otherstaff"} and user is not None:
        can_show_internal_hub = Membership.objects.filter(
            user=user,
            pharmacy=selected_pharmacy,
            is_active=True,
            employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
        ).exists()
    if can_show_internal_hub:
        hub_qs = PharmacyHubPost.objects.filter(deleted_at__isnull=True)
        hub_qs = hub_qs.filter(
            Q(pharmacy=selected_pharmacy)
            | Q(community_group__pharmacy=selected_pharmacy)
            | Q(mentions__membership__user=user, mentions__membership__pharmacy=selected_pharmacy)
        ).distinct()
        latest_hub_post = hub_qs.select_related("pharmacy", "organization", "community_group").order_by("-created_at").first()
        if latest_hub_post:
            description = (
                getattr(latest_hub_post.pharmacy, "name", None)
                or getattr(latest_hub_post.organization, "name", None)
                or getattr(latest_hub_post.community_group, "name", None)
                or "ChemistTasker Hub"
            )
            activity.append({
                "title": "Recent Hub post",
                "description": description,
                "time": _dashboard_activity_time(latest_hub_post.created_at),
                "kind": "hub",
                "target_type": "hub_post",
                "target_id": latest_hub_post.id,
                "action_url": _dashboard_hub_action_url(latest_hub_post),
                "created_at": latest_hub_post.created_at.isoformat() if latest_hub_post.created_at else None,
            })

    reveal_qs = ShiftProfileAccessAudit.objects.filter(
        shift__in=shift_scope,
        action=ShiftProfileAccessAudit.Action.REVEAL_PROFILE,
    ).select_related("shift__pharmacy", "target_user")
    if str(dashboard_role or "").lower() in {"pharmacist", "otherstaff"} and user is not None:
        reveal_qs = reveal_qs.filter(target_user=user)
    latest_reveal = reveal_qs.order_by("-created_at").first()
    if latest_reveal:
        target_name = latest_reveal.target_user.get_full_name() or latest_reveal.target_user.email
        reveal_pharmacy_name = latest_reveal.shift.pharmacy.name if latest_reveal.shift and latest_reveal.shift.pharmacy else pharmacy_name
        activity.append({
            "title": "Shift profile revealed",
            "description": f"{target_name} - {reveal_pharmacy_name}",
            "time": _dashboard_activity_time(latest_reveal.created_at),
            "kind": "reveal",
            "target_type": "shift",
            "target_id": latest_reveal.shift_id,
            "action_url": _dashboard_shift_action_url(latest_reveal.shift, dashboard_role),
            "created_at": latest_reveal.created_at.isoformat() if latest_reveal.created_at else None,
        })

    latest_confirmed = confirmed_qs.select_related("pharmacy").order_by("-slot_assignments__assigned_at").first()
    if latest_confirmed:
        latest_assignment = latest_confirmed.slot_assignments.order_by("-assigned_at").first()
        activity.append({
            "title": "Shift confirmed",
            "description": latest_confirmed.pharmacy.name if latest_confirmed.pharmacy else pharmacy_name,
            "time": _dashboard_activity_time(latest_assignment.assigned_at if latest_assignment else None),
            "kind": "confirmed",
            "target_type": "shift",
            "target_id": latest_confirmed.id,
            "action_url": _dashboard_shift_action_url(latest_confirmed, dashboard_role),
            "created_at": latest_assignment.assigned_at.isoformat() if latest_assignment else None,
        })

    latest_invoice = invoices_qs.select_related("pharmacy").order_by("-created_at").first()
    if latest_invoice:
        status_label = dict(Invoice.STATUS_CHOICES).get(latest_invoice.status, latest_invoice.status).title()
        invoice_pharmacy_name = (
            getattr(latest_invoice.pharmacy, "name", None)
            or latest_invoice.pharmacy_name_snapshot
            or pharmacy_name
        )
        activity.append({
            "title": f"Invoice {status_label}",
            "description": f"{invoice_pharmacy_name} - {_format_money(latest_invoice.total)}",
            "time": _dashboard_activity_time(latest_invoice.created_at),
            "kind": "invoice",
            "target_type": "invoice",
            "target_id": latest_invoice.id,
            "status": latest_invoice.status,
            "status_label": status_label,
            "action_url": _dashboard_invoice_action_url(latest_invoice, dashboard_role),
            "created_at": latest_invoice.created_at.isoformat() if latest_invoice.created_at else None,
        })

    return sorted(
        activity,
        key=lambda item: item.get("created_at") or "",
        reverse=True,
    )[:4]


def _dashboard_invoice_summary(invoices_qs):
    unpaid_qs = invoices_qs.exclude(status="paid")
    paid_qs = invoices_qs.filter(status="paid")
    unpaid_total = unpaid_qs.aggregate(total=Sum("total")).get("total") or Decimal("0")
    paid_total = paid_qs.aggregate(total=Sum("total")).get("total") or Decimal("0")
    total = invoices_qs.aggregate(total=Sum("total")).get("total") or Decimal("0")
    return {
        "total_count": invoices_qs.count(),
        "unpaid_count": unpaid_qs.count(),
        "paid_count": paid_qs.count(),
        "total_billed": _format_money(total),
        "unpaid_total": _format_money(unpaid_total),
        "paid_total": _format_money(paid_total),
    }


def _dashboard_upcoming_stats(shifts_qs, today, now):
    week_end = today + timedelta(days=6)
    month_end = today + timedelta(days=30)
    return {
        "today": shifts_qs.filter(slots__date=today, slots__end_time__gt=now).distinct().count(),
        "week": shifts_qs.filter(slots__date__gte=today, slots__date__lte=week_end).distinct().count(),
        "month": shifts_qs.filter(slots__date__gte=today, slots__date__lte=month_end).distinct().count(),
    }


def _dashboard_payload_extras(*, shifts_qs, confirmed_qs, community_qs=None, invoices_qs=None, selected_pharmacy=None, today=None, now=None, open_qs=None, all_qs=None, dashboard_role=None, user=None):
    today = today or date.today()
    now = now or timezone.now().time()
    invoices_qs = invoices_qs if invoices_qs is not None else Invoice.objects.none()
    community_qs = community_qs if community_qs is not None else Shift.objects.none()
    open_qs = open_qs if open_qs is not None else _open_active_shifts(shifts_qs, today, now)
    all_qs = all_qs if all_qs is not None else _all_active_shifts(shifts_qs, today, now)
    pharmacy_name = selected_pharmacy.name if selected_pharmacy else "All pharmacies"
    upcoming_stats = _dashboard_upcoming_stats(shifts_qs, today, now)
    invoice_summary = _dashboard_invoice_summary(invoices_qs)
    return {
        "selected_pharmacy": (
            {"id": selected_pharmacy.id, "name": selected_pharmacy.name}
            if selected_pharmacy else None
        ),
        "upcoming_stats": upcoming_stats,
        "activity": _dashboard_activity(
            shifts_qs=all_qs,
            confirmed_qs=confirmed_qs,
            invoices_qs=invoices_qs,
            pharmacy_name=pharmacy_name,
            dashboard_role=dashboard_role,
            selected_pharmacy=selected_pharmacy,
            user=user,
        ),
        "shift_summary": {
            "upcoming_count": shifts_qs.count(),
            "confirmed_count": confirmed_qs.count(),
            "community_count": community_qs.count(),
            "open_count": open_qs.count(),
            "all_count": all_qs.count(),
        },
        "invoice_summary": invoice_summary,
        "bills_summary": {
            "total_billed": invoice_summary["total_billed"],
            "unpaid_total": invoice_summary["unpaid_total"],
            "unpaid_count": invoice_summary["unpaid_count"],
            "paid_count": invoice_summary["paid_count"],
        },
    }


class OrganizationDashboardView(APIView):
    """
    Any org-level member may view this dashboard.
    """
    required_roles     = ['ORG_ADMIN', 'CHIEF_ADMIN', 'REGION_ADMIN']
    permission_classes = [permissions.IsAuthenticated, OrganizationRolePermission]

    def get(self, request, organization_pk):
        membership = request.user.organization_memberships.filter(
            organization_id=organization_pk,
            role__in=self.required_roles,
        ).select_related('organization').prefetch_related('pharmacies').first()
        if not membership:
            raise PermissionDenied("You are not a member of this organization.")

        org = membership.organization
        scoped_pharmacy_ids = membership_visible_pharmacy_ids(membership)
        requested_pharmacy_id = _parse_dashboard_pharmacy_id(request)
        workspace = _parse_dashboard_workspace(request)

        claims_qs = PharmacyClaim.objects.filter(
            organization=org
        ).select_related(
            'pharmacy',
            'pharmacy__owner',
            'pharmacy__owner__user',
            'requested_by',
            'responded_by',
        ).order_by('-created_at')

        if membership.role == 'REGION_ADMIN':
            if scoped_pharmacy_ids:
                claims_qs = claims_qs.filter(pharmacy_id__in=scoped_pharmacy_ids)
            else:
                claims_qs = claims_qs.none()

        claims_data = PharmacyClaimSerializer(
            claims_qs,
            many=True,
            context={'request': request},
        ).data

        accepted_data = [
            {
                'claim_id': claim.id,
                'pharmacy_id': claim.pharmacy_id,
                'pharmacy_name': claim.pharmacy.name,
                'pharmacy_email': claim.pharmacy.email,
                'owner_email': getattr(getattr(claim.pharmacy.owner, 'user', None), 'email', None),
            }
            for claim in claims_qs
            if claim.status == PharmacyClaim.Status.ACCEPTED
        ]

        shifts_qs = Shift.objects.filter(pharmacy__organization=org)
        selected_pharmacy = None
        if workspace == "platform":
            shifts_qs = _public_platform_shifts(date.today(), timezone.now().time())
        else:
            if membership.role == 'REGION_ADMIN':
                if scoped_pharmacy_ids:
                    shifts_qs = shifts_qs.filter(pharmacy_id__in=scoped_pharmacy_ids)
                else:
                    shifts_qs = shifts_qs.none()
            if requested_pharmacy_id is not None:
                allowed_pharmacy = Pharmacy.objects.filter(id=requested_pharmacy_id, organization=org)
                if membership.role == 'REGION_ADMIN':
                    allowed_pharmacy = allowed_pharmacy.filter(id__in=scoped_pharmacy_ids)
                if not allowed_pharmacy.exists():
                    raise PermissionDenied("You do not have access to this pharmacy.")
                shifts_qs = shifts_qs.filter(pharmacy_id=requested_pharmacy_id)
                selected_pharmacy = allowed_pharmacy.first()
        shifts = ShiftSerializer(shifts_qs, many=True).data
        today = date.today()
        now = timezone.now().time()
        future_shifts = shifts_qs.filter(_future_shift_filter(today, now)).distinct()
        confirmed_shifts = _user_confirmed_platform_shifts(request.user, today, now) if workspace == "platform" else shifts_qs.filter(slot_assignments__isnull=False).distinct()
        invoices_qs = Invoice.objects.filter(user=request.user, pharmacy__isnull=True) if workspace == "platform" else Invoice.objects.filter(pharmacy__organization=org)
        if workspace != "platform" and requested_pharmacy_id is not None:
            invoices_qs = invoices_qs.filter(pharmacy_id=requested_pharmacy_id)
        open_shifts = _open_active_shifts(shifts_qs, today, now)
        all_active_shifts = _all_active_shifts(shifts_qs, today, now)
        extras = _dashboard_payload_extras(
            shifts_qs=future_shifts,
            confirmed_qs=confirmed_shifts,
            invoices_qs=invoices_qs,
            selected_pharmacy=selected_pharmacy,
            today=today,
            now=now,
            open_qs=open_shifts,
            all_qs=all_active_shifts,
            dashboard_role="organization",
            user=request.user,
        )

        return Response({
            'organization': {
                'id':   org.id,
                'name': org.name,
                'role': membership.role,
                'admin_level': membership.admin_level,
                'job_title': membership.job_title,
                'region': membership.region,
            },
            'claimed_pharmacies': accepted_data,
            'pharmacy_claims': claims_data,
            'shifts':            shifts,
            'active_shifts':      future_shifts.count(),
            'confirmed_shifts_count': confirmed_shifts.count(),
            **extras,
        }, status=status.HTTP_200_OK)


class OwnerDashboard(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        user_serializer = UserProfileSerializer(user)
        requested_pharmacy_id = _parse_dashboard_pharmacy_id(request)
        workspace = _parse_dashboard_workspace(request)
        today = date.today()
        now = timezone.now().time()

        if workspace == "platform":
            public_shifts = _public_platform_shifts(today, now).filter(created_by=user).distinct()
            confirmed_shifts = public_shifts.filter(
                slot_assignments__isnull=False,
                payment_status__in=['PAID', 'NOT_REQUIRED'],
            ).distinct()
            invoices_qs = Invoice.objects.filter(user=user, pharmacy__isnull=True)
            extras = _dashboard_payload_extras(
                shifts_qs=public_shifts,
                confirmed_qs=confirmed_shifts,
                community_qs=public_shifts,
                invoices_qs=invoices_qs,
                selected_pharmacy=None,
                today=today,
                now=now,
                dashboard_role="owner",
                user=user,
            )
            return Response({
                "user": user_serializer.data,
                "upcoming_shifts_count": public_shifts.count(),
                "confirmed_shifts_count": confirmed_shifts.count(),
                "community_shifts_count": public_shifts.count(),
                "shifts": [_dashboard_shift_box(shift) for shift in public_shifts[:12]],
                **extras,
            })

        # Pharmacies I control: Owner pharmacies ∪ pharmacies where I’m PHARMACY_ADMIN
        owner_pharmacies = Pharmacy.objects.filter(owner__user=user)
        admin_pharmacies = pharmacies_user_admins(user)
        pharmacies = _scope_pharmacies((owner_pharmacies | admin_pharmacies).distinct(), requested_pharmacy_id)
        selected_pharmacy = pharmacies.filter(id=requested_pharmacy_id).first() if requested_pharmacy_id else None

        if not pharmacies.exists():
            # Keep your exact empty payload behavior for non-owners/non-admins
            data = {
                "user": user_serializer.data,
                "upcoming_shifts_count": 0,
                "confirmed_shifts_count": 0,
                "shifts": [],
                "bills_summary": {
                    "total_billed": "N/A",
                    "points": "N/A"
                },
            }
            return Response(data)

        # Same as before, just using the unified pharmacies set
        shifts_qs = Shift.objects.filter(pharmacy__in=pharmacies).distinct()
        open_shifts = _open_active_shifts(shifts_qs, today, now)
        all_active_shifts = _all_active_shifts(shifts_qs, today, now)
        personal_shift_scope = shifts_qs.filter(created_by=user).distinct()
        personal_upcoming_shifts = personal_shift_scope.filter(_future_shift_filter(today, now)).distinct()

        # Upcoming shifts
        upcoming_shifts = shifts_qs.filter(
            slots__date__gt=today
        ) | shifts_qs.filter(
            slots__date=today,
            slots__end_time__gt=now
        )
        upcoming_shifts = upcoming_shifts.distinct()

        # ---- Correct confirmed shifts logic ----
        # Confirmed shifts: at least one assignment
        confirmed_shifts = shifts_qs.filter(
            slot_assignments__isnull=False,
            payment_status__in=['PAID', 'NOT_REQUIRED'],
        ).distinct()
        personal_confirmed_shifts = personal_shift_scope.filter(
            slot_assignments__isnull=False,
            payment_status__in=['PAID', 'NOT_REQUIRED'],
        ).distinct()

        # Build shift summary boxes
        shift_boxes = []
        for shift in upcoming_shifts:
            slot = shift.slots.order_by('date').first()
            shift_date = slot.date if slot else None
            shift_boxes.append({
                'id': shift.id,
                'pharmacy_name': shift.pharmacy.name if shift.pharmacy else '',
                'date': shift_date,
            })

        invoices_qs = Invoice.objects.filter(pharmacy__in=pharmacies)
        extras = _dashboard_payload_extras(
            shifts_qs=upcoming_shifts,
            confirmed_qs=confirmed_shifts,
            invoices_qs=invoices_qs,
            selected_pharmacy=selected_pharmacy,
            today=today,
            now=now,
            open_qs=open_shifts,
            all_qs=all_active_shifts,
            dashboard_role="owner",
            user=user,
        )
        extras["upcoming_stats"] = _dashboard_upcoming_stats(personal_upcoming_shifts, today, now)

        data = {
            "user": user_serializer.data,
            "upcoming_shifts_count": upcoming_shifts.count(),
            "confirmed_shifts_count": confirmed_shifts.count(),
            "shifts": shift_boxes,
            **extras,
        }
        return Response(data)

class PharmacistDashboard(APIView):
    permission_classes = [IsAuthenticated, IsPharmacist]

    def get(self, request):
        user = request.user
        user_serializer = UserProfileSerializer(user)
        today = date.today()
        now = timezone.now().time()
        requested_pharmacy_id = _parse_dashboard_pharmacy_id(request)
        workspace = _parse_dashboard_workspace(request)
        member_pharmacy_ids = list(Membership.objects.filter(
            user=user, is_active=True
        ).values_list('pharmacy_id', flat=True))
        if workspace == "platform":
            public_shifts = _public_platform_shifts(today, now).filter(role_needed__in=_shift_roles_visible_to_user(user))
            confirmed_shifts = _user_confirmed_platform_shifts(user, today, now)
            invoices_qs = Invoice.objects.filter(user=user, pharmacy__isnull=True)
            extras = _dashboard_payload_extras(
                shifts_qs=public_shifts,
                confirmed_qs=confirmed_shifts,
                community_qs=public_shifts,
                invoices_qs=invoices_qs,
                selected_pharmacy=None,
                today=today,
                now=now,
                dashboard_role="pharmacist",
                user=user,
            )
            data = {
                "user": user_serializer.data,
                "message": "Welcome Pharmacist!",
                "upcoming_shifts_count": public_shifts.count(),
                "confirmed_shifts_count": confirmed_shifts.count(),
                "community_shifts_count": public_shifts.count(),
                "shifts": [_dashboard_shift_box(shift) for shift in public_shifts[:12]],
                "community_shifts": [_dashboard_shift_box(shift) for shift in public_shifts[:12]],
                **extras,
            }
            return Response(data)
        if requested_pharmacy_id is not None:
            if requested_pharmacy_id not in member_pharmacy_ids:
                raise PermissionDenied("You do not have access to this pharmacy.")
            member_pharmacy_ids = [requested_pharmacy_id]
        selected_pharmacy = Pharmacy.objects.filter(id=requested_pharmacy_id).first() if requested_pharmacy_id else None

        # Internal workspace: selected pharmacy behaves like that pharmacy's home page,
        # scoped to the worker's membership type and current escalation level.
        visible_shifts = _worker_visible_pharmacy_shifts(user, member_pharmacy_ids)
        upcoming_shifts = visible_shifts.filter(_future_shift_filter(today, now)).distinct()
        open_shifts = _open_active_shifts(visible_shifts, today, now)
        all_active_shifts = _all_active_shifts(visible_shifts, today, now)

        confirmed_shifts = _pharmacy_confirmed_shifts(member_pharmacy_ids).filter(slot_assignments__user=user).distinct()

        # Community shifts: future, pharmacy__isnull, NO assignments yet
        community_shifts = Shift.objects.filter(
            pharmacy_id__in=member_pharmacy_ids,
            visibility__in=COMMUNITY_LEVELS, # Use the constant you already have
            slots__date__gte=today
        ).exclude(
            slots__assignments__user=user # Exclude shifts they are already assigned to
        ).distinct()


        shifts_data = []
        for shift in upcoming_shifts:
            pharmacy_name = shift.pharmacy.name if shift.pharmacy else "Community"
            slot = shift.slots.order_by('date').first()
            shift_date = slot.date if slot else None
            shifts_data.append({
                'id': shift.id,
                'pharmacy_name': pharmacy_name,
                'date': shift_date,
            })

        community_shifts_data = []
        for shift in community_shifts:
            slot = shift.slots.order_by('date').first()
            shift_date = slot.date if slot else None
            community_shifts_data.append({
                'id': shift.id,
                'pharmacy_name': "Community",
                'date': shift_date,
            })

        invoices_qs = Invoice.objects.filter(user=user)
        if requested_pharmacy_id is not None:
            invoices_qs = invoices_qs.filter(pharmacy_id=requested_pharmacy_id)
        extras = _dashboard_payload_extras(
            shifts_qs=upcoming_shifts,
            confirmed_qs=confirmed_shifts,
            community_qs=community_shifts,
            invoices_qs=invoices_qs,
            selected_pharmacy=selected_pharmacy,
            today=today,
            now=now,
            open_qs=open_shifts,
            all_qs=all_active_shifts,
            dashboard_role="pharmacist",
            user=user,
        )

        data = {
            "user": user_serializer.data,
            "message": "Welcome Pharmacist!",
            "upcoming_shifts_count": upcoming_shifts.count(),
            "confirmed_shifts_count": confirmed_shifts.count(),
            "community_shifts_count": community_shifts.count(),
            "shifts": shifts_data,
            "community_shifts": community_shifts_data,
            **extras,
        }
        return Response(data)

class OtherStaffDashboard(APIView):
    permission_classes = [IsAuthenticated, IsOtherstaff]

    def get(self, request):
        user = request.user
        user_serializer = UserProfileSerializer(user)
        today = date.today()
        now = timezone.now().time()
        requested_pharmacy_id = _parse_dashboard_pharmacy_id(request)
        workspace = _parse_dashboard_workspace(request)
        member_pharmacy_ids = list(Membership.objects.filter(
            user=user, is_active=True
        ).values_list('pharmacy_id', flat=True))
        if workspace == "platform":
            public_shifts = _public_platform_shifts(today, now).filter(role_needed__in=_shift_roles_visible_to_user(user))
            confirmed_shifts = _user_confirmed_platform_shifts(user, today, now)
            invoices_qs = Invoice.objects.filter(user=user, pharmacy__isnull=True)
            extras = _dashboard_payload_extras(
                shifts_qs=public_shifts,
                confirmed_qs=confirmed_shifts,
                community_qs=public_shifts,
                invoices_qs=invoices_qs,
                selected_pharmacy=None,
                today=today,
                now=now,
                dashboard_role="otherstaff",
                user=user,
            )
            data = {
                "user": user_serializer.data,
                "message": f"Welcome {other_staff_role_label(getattr(getattr(user, 'otherstaffonboarding', None), 'role_type', None))}!",
                "upcoming_shifts_count": public_shifts.count(),
                "confirmed_shifts_count": confirmed_shifts.count(),
                "community_shifts_count": public_shifts.count(),
                "shifts": [_dashboard_shift_box(shift) for shift in public_shifts[:12]],
                "community_shifts": [_dashboard_shift_box(shift) for shift in public_shifts[:12]],
                **extras,
            }
            return Response(data)
        if requested_pharmacy_id is not None:
            if requested_pharmacy_id not in member_pharmacy_ids:
                raise PermissionDenied("You do not have access to this pharmacy.")
            member_pharmacy_ids = [requested_pharmacy_id]
        selected_pharmacy = Pharmacy.objects.filter(id=requested_pharmacy_id).first() if requested_pharmacy_id else None

        visible_shifts = _worker_visible_pharmacy_shifts(user, member_pharmacy_ids)
        upcoming_shifts = visible_shifts.filter(_future_shift_filter(today, now)).distinct()
        open_shifts = _open_active_shifts(visible_shifts, today, now)
        all_active_shifts = _all_active_shifts(visible_shifts, today, now)
        confirmed_shifts = _pharmacy_confirmed_shifts(member_pharmacy_ids).filter(slot_assignments__user=user).distinct()

        community_shifts = Shift.objects.filter(
            pharmacy_id__in=member_pharmacy_ids,
            visibility__in=COMMUNITY_LEVELS, # Use the constant you already have
            slots__date__gte=today
        ).exclude(
            slots__assignments__user=user # Exclude shifts they are already assigned to
        ).distinct()

        shifts_data = []
        for shift in upcoming_shifts:
            pharmacy_name = shift.pharmacy.name if shift.pharmacy else "Community"
            slot = shift.slots.order_by('date').first()
            shift_date = slot.date if slot else None
            shifts_data.append({
                'id': shift.id,
                'pharmacy_name': pharmacy_name,
                'date': shift_date,
            })

        community_shifts_data = []
        for shift in community_shifts:
            slot = shift.slots.order_by('date').first()
            shift_date = slot.date if slot else None
            community_shifts_data.append({
                'id': shift.id,
                'pharmacy_name': "Community",
                'date': shift_date,
            })

        invoices_qs = Invoice.objects.filter(user=user)
        if requested_pharmacy_id is not None:
            invoices_qs = invoices_qs.filter(pharmacy_id=requested_pharmacy_id)
        extras = _dashboard_payload_extras(
            shifts_qs=upcoming_shifts,
            confirmed_qs=confirmed_shifts,
            community_qs=community_shifts,
            invoices_qs=invoices_qs,
            selected_pharmacy=selected_pharmacy,
            today=today,
            now=now,
            open_qs=open_shifts,
            all_qs=all_active_shifts,
            dashboard_role="otherstaff",
            user=user,
        )

        data = {
            "user": user_serializer.data,
            "message": f"Welcome {other_staff_role_label(getattr(getattr(user, 'otherstaffonboarding', None), 'role_type', None))}!",
            "upcoming_shifts_count": upcoming_shifts.count(),
            "confirmed_shifts_count": confirmed_shifts.count(),
            "community_shifts_count": community_shifts.count(),
            "shifts": shifts_data,
            "community_shifts": community_shifts_data,
            **extras,
        }
        return Response(data)

class ExplorerDashboard(APIView):
    permission_classes = [IsAuthenticated, IsExplorer]

    def get(self, request):
        user_serializer = UserProfileSerializer(request.user)
        data = {
            "user": user_serializer.data,
            "message": "Welcome Explorer!",
            # "available_jobs": [],  # Can be populated later with available jobs
        }
        return Response(data)




















































# Roster
class RosterOwnerViewSet(viewsets.ModelViewSet):
    """
    Lists rostered assignments and allows DELETING a specific assignment.
    """
    serializer_class = RosterAssignmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Include all assignments for controlled pharmacies (historical records
        # may not have been marked is_rostered=True)
        qs = ShiftSlotAssignment.objects.all()

        owned_pharmacies = Pharmacy.objects.none()
        if hasattr(user, 'owneronboarding'):
            owned_pharmacies |= Pharmacy.objects.filter(owner=user.owneronboarding)

        org_pharmacies = Pharmacy.objects.none()
        org_ids = list(
            OrganizationMembership.objects.filter(user=user, role='ORG_ADMIN').values_list('organization', flat=True)
        )
        if org_ids:
            org_pharmacies |= Pharmacy.objects.filter(organization_id__in=org_ids)

        admin_pharmacies = Pharmacy.objects.filter(
            admin_assignments__user=user,
            admin_assignments__is_active=True
        )  # + pharmacies where I'm Pharmacy Admin

        controlled_pharmacies = (owned_pharmacies | org_pharmacies | admin_pharmacies).distinct()
        qs = qs.filter(
            shift__pharmacy__in=controlled_pharmacies
        ).select_related('shift__pharmacy', 'slot', 'user').prefetch_related(
            'user__workforce_timesheets__period'
        ).distinct()

        # <<< --- START OF FIX --- >>>
        # Filter by the specific pharmacy ID if provided in the request
        pharmacy_id = self.request.query_params.get('pharmacy')
        if pharmacy_id:
            qs = qs.filter(shift__pharmacy__id=pharmacy_id)
        # <<< --- END OF FIX --- >>>

        start_date_str = self.request.query_params.get('start_date')
        end_date_str = self.request.query_params.get('end_date')

        if start_date_str:
            try:
                start_date = date.fromisoformat(start_date_str)
                qs = qs.filter(slot_date__gte=start_date)
            except ValueError:
                pass

        if end_date_str:
            try:
                end_date = date.fromisoformat(end_date_str)
                qs = qs.filter(slot_date__lte=end_date)
            except ValueError:
                pass
        return qs

    @action(detail=False, methods=['get'], url_path='members-for-roster')
    def members_for_roster(self, request):
        # This action is correct as you provided.
        user = request.user
        pharmacy_id = request.query_params.get('pharmacy_id')
        target_role = request.query_params.get('role')

        controlled_pharmacies_query = Pharmacy.objects.none()
        if hasattr(user, 'owneronboarding'):
            controlled_pharmacies_query |= Pharmacy.objects.filter(owner=user.owneronboarding)

        org_ids = list(
            OrganizationMembership.objects.filter(user=user, role='ORG_ADMIN').values_list('organization', flat=True)
        )
        if org_ids:
            controlled_pharmacies_query |= Pharmacy.objects.filter(organization_id__in=org_ids)
        if is_any_admin(user):
            scoped_admin_ids = [
                pharm.id
                for pharm in pharmacies_user_admins(user)
                if has_admin_capability(user, pharm, CAPABILITY_MANAGE_ROSTER)
            ]
            if scoped_admin_ids:
                controlled_pharmacies_query |= Pharmacy.objects.filter(id__in=scoped_admin_ids)

        qs = Membership.objects.filter(
            is_active=True,
            pharmacy__in=controlled_pharmacies_query
        )

        if pharmacy_id:
            qs = qs.filter(pharmacy_id=pharmacy_id)
        if target_role:
            qs = qs.filter(role=target_role)

        serializer = MembershipSerializer(qs.select_related('user'), many=True)
        return Response(serializer.data)

class RosterShiftManageViewSet(viewsets.ModelViewSet):
    """
    Handles EDITING, DELETING, and ESCALATING a Shift from the roster context.
    """
    queryset = Shift.objects.all()
    serializer_class = ShiftSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # This logic is correct and remains unchanged
        user = self.request.user
        controlled_pharmacies = Pharmacy.objects.none()
        admin_pharmacies = Pharmacy.objects.filter(
            admin_assignments__user=user,
            admin_assignments__is_active=True
        )
        controlled_pharmacies |= admin_pharmacies
        if hasattr(user, 'owneronboarding'):
            controlled_pharmacies |= Pharmacy.objects.filter(owner=user.owneronboarding)
        org_ids = list(
            OrganizationMembership.objects.filter(user=user, role='ORG_ADMIN').values_list('organization', flat=True)
        )
        if org_ids:
            controlled_pharmacies |= Pharmacy.objects.filter(organization_id__in=org_ids)
        return Shift.objects.filter(pharmacy__in=controlled_pharmacies)

    def update(self, request, *args, **kwargs):
        """
        Handles PATCH requests to edit a shift.
        It now supports re-assigning a new user at the same time.
        """
        shift_instance = self.get_object()

        with transaction.atomic():
            # First, let the serializer handle the update of the Shift and its Slots.
            response = super().update(request, *args, **kwargs)

            # Only mutate assignments when the caller explicitly includes user_id.
            if 'user_id' not in request.data:
                return response

            shift_instance.refresh_from_db()
            existing_assignments = {
                (assignment.slot_id, assignment.slot_date): assignment
                for assignment in shift_instance.slot_assignments.select_related('slot')
            }

            new_user_id = request.data.get('user_id')
            if new_user_id in (None, '', 'null'):
                # Explicit clear requested by caller.
                shift_instance.slot_assignments.all().delete()
                return response

            newly_assigned_user = get_object_or_404(User, pk=new_user_id)
            desired_keys = set()

            # Build the desired assignment state first, then remove obsolete rows.
            for slot in shift_instance.slots.all():
                slot_date = slot.date
                desired_keys.add((slot.id, slot_date))
                rate, rate_reason = get_locked_rate_for_slot(
                    slot=slot,
                    shift=shift_instance,
                    user=newly_assigned_user,
                    override_date=slot_date
                )
                try:
                    assignment_defaults = staff_assignment_defaults(
                        user=newly_assigned_user,
                        pharmacy=shift_instance.pharmacy,
                        work_date=slot_date,
                    )
                except DjangoValidationError as exc:
                    raise DRFValidationError(
                        getattr(exc, "message_dict", {"detail": exc.messages})
                    ) from exc
                ShiftSlotAssignment.objects.update_or_create(
                    slot=slot,
                    slot_date=slot_date,
                    defaults={
                        'shift': shift_instance,
                        'user': newly_assigned_user,
                        'unit_rate': rate,
                        'rate_reason': rate_reason,
                        'is_rostered': True,
                        **assignment_defaults,
                    }
                )

            obsolete_assignment_ids = [
                assignment.id
                for key, assignment in existing_assignments.items()
                if key not in desired_keys
            ]
            if obsolete_assignment_ids:
                ShiftSlotAssignment.objects.filter(id__in=obsolete_assignment_ids).delete()

            return response

    @action(detail=False, methods=['get'], url_path='list-open-shifts')
    def list_open_shifts(self, request):
        """
        Lists all unassigned shifts for pharmacies controlled by the current user.
        This is for the owner's view to see their own created open shifts.
        """
        user = self.request.user
        # Use the existing get_queryset logic to filter by controlled pharmacies
        controlled_pharmacy_ids = self.get_queryset().values_list('pharmacy', flat=True).distinct()

        # Filter for shifts in controlled pharmacies that have no assignments
        qs = Shift.objects.filter(
            pharmacy__id__in=controlled_pharmacy_ids,
            slots__date__gte=date.today() # Only future/current shifts
        ).annotate(
            assigned_slot_count=Count('slots__assignments', distinct=True)
        ).filter(assigned_slot_count=0).distinct()

        # Filter by pharmacy if provided
        pharmacy_id = request.query_params.get('pharmacy')
        if pharmacy_id:
            qs = qs.filter(pharmacy_id=pharmacy_id)

        # Apply date filters if present
        start_date_str = self.request.query_params.get('start_date')
        end_date_str = self.request.query_params.get('end_date')

        if start_date_str:
            start_date = date.fromisoformat(start_date_str)
            qs = qs.filter(slots__date__gte=start_date)
        if end_date_str:
            end_date = date.fromisoformat(end_date_str)
            qs = qs.filter(slots__date__lte=end_date)

        serializer = OpenShiftSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='create-open-shift')
    def create_open_shift(self, request):
        """
        Allows an owner/admin to create an unassigned community shift for others to claim.
        """
        pharmacy_id = request.data.get('pharmacy_id')
        role_needed = request.data.get('role_needed')
        slot_date_str = request.data.get('slot_date')
        start_time_str = request.data.get('start_time')
        end_time_str = request.data.get('end_time')
        description = request.data.get('description', '')

        if not all([pharmacy_id, role_needed, slot_date_str, start_time_str, end_time_str]):
            return Response({"detail": "Missing required fields for open shift creation."}, status=status.HTTP_400_BAD_REQUEST)

        pharmacy = get_object_or_404(Pharmacy, pk=pharmacy_id)

        try:
            slot_date = date.fromisoformat(slot_date_str)
            start_time = datetime.strptime(start_time_str, '%H:%M').time()
            end_time = datetime.strptime(end_time_str, '%H:%M').time()
            if start_time >= end_time:
                return Response({"detail": "End time must be after start time."}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError:
            return Response({"detail": "Invalid date or time format. Use YYYY-MM-DD and HH:MM."}, status=status.HTTP_400_BAD_REQUEST)

        requesting_user = request.user
        has_permission = False
        if hasattr(requesting_user, 'owneronboarding') and pharmacy.owner == requesting_user.owneronboarding:
            has_permission = True
        elif OrganizationMembership.objects.filter(
            user=requesting_user,
            role='ORG_ADMIN',
            organization_id=pharmacy.organization_id
        ).exists():
            has_permission = True
        elif has_admin_capability(requesting_user, pharmacy, CAPABILITY_MANAGE_ROSTER):
            has_permission = True

        if not has_permission:
            return Response({'detail': 'Permission denied: Not authorized to create shifts for this pharmacy.'}, status=status.HTTP_403_FORBIDDEN)

        rate_kwargs = {
            'rate_type': None,
            'fixed_rate': None,
        }
        if role_needed == 'PHARMACIST':
            default_rate_type = getattr(pharmacy, 'default_rate_type', None)
            default_fixed_rate = getattr(pharmacy, 'default_fixed_rate', None)
            rate_kwargs['rate_type'] = default_rate_type or 'FLEXIBLE'
            rate_kwargs['fixed_rate'] = default_fixed_rate if rate_kwargs['rate_type'] == 'FIXED' else None

        # Determine starting visibility (escalation level)
        allowed_tiers = self.serializer_class.build_allowed_tiers(pharmacy)
        requested_visibility = request.data.get('visibility')
        if requested_visibility:
            if allowed_tiers and requested_visibility not in allowed_tiers:
                return Response(
                    {"detail": f"Invalid visibility. Must be one of {allowed_tiers}."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            start_visibility = requested_visibility
        else:
            # Default to LOCUM_CASUAL if permitted, else fall back to first allowed tier
            if allowed_tiers and 'LOCUM_CASUAL' in allowed_tiers:
                start_visibility = 'LOCUM_CASUAL'
            elif allowed_tiers:
                start_visibility = allowed_tiers[0]
            else:
                start_visibility = 'LOCUM_CASUAL'

        new_shift = Shift.objects.create(
            pharmacy=pharmacy,
            role_needed=role_needed,
            # Open shifts should be treated as locum/casual so they don't require pay bands
            employment_type='LOCUM',
            visibility=start_visibility,
            single_user_only=True,
            created_by=requesting_user,
            description=description,
            **rate_kwargs,
        )

        new_slot = ShiftSlot.objects.create(
            shift=new_shift,
            date=slot_date,
            start_time=start_time,
            end_time=end_time,
            is_recurring=False,
        )


        # _dbg(f"approve: created open shift id={new_shift.id} vis={new_shift.visibility} emp={new_shift.employment_type}")

        return Response({
            "detail": "Open shift created successfully.",
            "shift_id": new_shift.id,
            "slot_id": new_slot.id,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def escalate(self, request, pk=None):
        """
        Escalate a roster-managed shift while clearing any existing assignments.
        """
        shift = self.get_object()

        if not BaseShiftViewSet._user_can_manage_pharmacy(request.user, shift.pharmacy):
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        # Clear all existing assignments before escalating
        shift.slot_assignments.all().delete()

        allowed_tiers = self.serializer_class.build_allowed_tiers(shift.pharmacy)
        if not allowed_tiers:
            return Response({'detail': 'No escalation tiers available for this pharmacy.'}, status=status.HTTP_400_BAD_REQUEST)

        current_index = BaseShiftViewSet._resolve_current_index(shift, allowed_tiers)

        target_visibility = request.data.get('target_visibility')
        if target_visibility:
            if target_visibility not in allowed_tiers:
                return Response(
                    {'detail': f"Invalid target_visibility. Must be one of {allowed_tiers}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            target_index = allowed_tiers.index(target_visibility)
        else:
            target_index = current_index + 1

        if target_index <= current_index:
            return Response({'detail': 'Shift is already at or above that visibility level.'}, status=status.HTTP_400_BAD_REQUEST)
        if target_index >= len(allowed_tiers):
            return Response({'detail': 'Already at the highest escalation level.'}, status=status.HTTP_400_BAD_REQUEST)

        next_visibility = allowed_tiers[target_index]
        if next_visibility == PUBLIC_LEVEL:
            try:
                enforce_public_shift_daily_limit(shift.pharmacy)
            except ValidationError as exc:
                raise ValidationError(exc.detail if hasattr(exc, 'detail') else exc.args[0])

        visibility = BaseShiftViewSet._apply_escalation(shift, allowed_tiers, target_index)
        detail_prefix = f'Shift escalated to {visibility}'.rstrip('.')
        return Response({'detail': f'{detail_prefix} and is now unassigned.'}, status=status.HTTP_200_OK)

class CreateShiftAndAssignView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        pharmacy_id = request.data.get('pharmacy_id')
        role_needed = request.data.get('role_needed')
        slot_date_str = request.data.get('slot_date')
        start_time_str = request.data.get('start_time')
        end_time_str = request.data.get('end_time')
        user_id = request.data.get('user_id')

        if not all([pharmacy_id, role_needed, slot_date_str, start_time_str, end_time_str, user_id]):
            return Response({"detail": "Missing required fields for shift creation and assignment."}, status=status.HTTP_400_BAD_REQUEST)

        pharmacy = get_object_or_404(Pharmacy, pk=pharmacy_id)
        candidate_user = get_object_or_404(User, pk=user_id)

        try:
            slot_date = date.fromisoformat(slot_date_str)
            start_time = datetime.strptime(start_time_str, '%H:%M').time()
            end_time = datetime.strptime(end_time_str, '%H:%M').time()
            if start_time >= end_time:
                return Response({"detail": "End time must be after start time."}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError:
            return Response({"detail": "Invalid date or time format. Use YYYY-MM-DD and HH:MM."}, status=status.HTTP_400_BAD_REQUEST)

        requesting_user = request.user
        has_permission = False
        if hasattr(requesting_user, 'owneronboarding') and pharmacy.owner == requesting_user.owneronboarding:
            has_permission = True
        elif OrganizationMembership.objects.filter(
            user=requesting_user,
            role='ORG_ADMIN',
            organization_id=pharmacy.organization_id
        ).exists():
            has_permission = True
        elif has_admin_capability(requesting_user, pharmacy, CAPABILITY_MANAGE_ROSTER):
            has_permission = True

        if not has_permission:
            return Response({'detail': 'Permission denied: Not authorized to create shifts for this pharmacy.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            assignment_defaults = staff_assignment_defaults(
                user=candidate_user,
                pharmacy=pharmacy,
                work_date=slot_date,
            )
        except DjangoValidationError as exc:
            return Response(
                getattr(exc, "message_dict", {"detail": exc.messages}),
                status=status.HTTP_400_BAD_REQUEST,
            )

        shift_data = {
            "pharmacy": pharmacy,
            "role_needed": role_needed,
            "employment_type": assignment_defaults["engagement_terms_snapshot"]["employment_type"],
            "is_roster_container": True,
            "visibility": "FULL_PART_TIME",
            "single_user_only": True,
            "created_by": requesting_user,
        }
        if role_needed == "PHARMACIST":
            shift_data["rate_type"] = "FLEXIBLE"

        new_shift = Shift.objects.create(**shift_data)

        new_slot = ShiftSlot.objects.create(
            shift=new_shift,
            date=slot_date,
            start_time=start_time,
            end_time=end_time,
            is_recurring=False,
            recurring_days=[],
            recurring_end_date=None
        )

        rate, rate_reason = get_locked_rate_for_slot(
            slot=new_slot,
            shift=new_shift,
            user=candidate_user,
            override_date=slot_date
        )

        assignment = ShiftSlotAssignment.objects.create(
            shift=new_shift,
            slot=new_slot,
            slot_date=slot_date,
            user=candidate_user,
            unit_rate=rate,
            rate_reason=rate_reason,
            is_rostered=True,
            **assignment_defaults,
        )

        notify_shift_users(
            [candidate_user],
            shift=new_shift,
            title="Shift assigned",
            body=f"You have been assigned a shift at {pharmacy.name}.",
            kind="shift_assigned",
            payload={
                "slot_id": new_slot.id,
                "assignment_ids": [assignment.id],
            },
        )

        return Response({
            "detail": "Shift created and assigned successfully.",
            "shift_id": new_shift.id,
            "slot_id": new_slot.id,
            "assignment_id": assignment.id
        }, status=status.HTTP_201_CREATED)

class RosterWorkerViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RosterAssignmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        Returns rostered assignments for pharmacies where the user is a member.
        The queryset is now filtered by the 'pharmacy', 'start_date', and 
        'end_date' query parameters if they are provided in the request.
        """
        user = self.request.user
        
        # Get all pharmacies where the user has an active membership
        member_pharmacy_ids = list(Membership.objects.filter(
            user=user, is_active=True
        ).values_list('pharmacy_id', flat=True))
        
        # Start with a base queryset of all assignments either in those pharmacies
        # OR explicitly assigned to the current user (to surface public-pool assignments).
        qs = ShiftSlotAssignment.objects.filter(
            Q(shift__pharmacy_id__in=member_pharmacy_ids) | Q(user=user)
        ).select_related('shift__pharmacy', 'slot', 'user').prefetch_related(
            'user__workforce_timesheets__period'
        ).distinct()

        # --- START OF FIX (This part is correct, but the following part needs to be removed) ---

        # 1. Filter by the specific pharmacy ID from the request
        pharmacy_id_param = self.request.query_params.get('pharmacy')
        # The user-specific filter is removed to show all assignments for the pharmacy.
        # The frontend will handle opacity/interactivity for non-user shifts.
        if pharmacy_id_param:
            try:
                # Security check: Ensure the requested pharmacy is one the user can see
                requested_pharmacy_id = int(pharmacy_id_param)
                if requested_pharmacy_id in member_pharmacy_ids:
                    qs = qs.filter(shift__pharmacy_id=requested_pharmacy_id)
                else:
                    # If not a member, still allow if the user is directly assigned there
                    has_assignment = ShiftSlotAssignment.objects.filter(
                        is_rostered=True,
                        user=user,
                        shift__pharmacy_id=requested_pharmacy_id
                    ).exists()
                    if has_assignment:
                        qs = qs.filter(shift__pharmacy_id=requested_pharmacy_id)
                    else:
                        return ShiftSlotAssignment.objects.none()
            except (ValueError, TypeError):
                # If pharmacy_id is not a valid integer, ignore it
                pass

        # 2. Filter by the date range from the request
        start_date_str = self.request.query_params.get('start_date')
        end_date_str = self.request.query_params.get('end_date')

        if start_date_str:
            try:
                start_date = date.fromisoformat(start_date_str)
                qs = qs.filter(slot_date__gte=start_date)
            except ValueError:
                pass  # Ignore invalid date format

        if end_date_str:
            try:
                end_date = date.fromisoformat(end_date_str)
                qs = qs.filter(slot_date__lte=end_date)
            except ValueError:
                pass  # Ignore invalid date format
                
        # --- END OF FIX (The user-specific filter was here) ---

        # 3. Exclude draft roster period assignments:
        # Workers can view shifts for published roster periods only.
        # Legacy assignments and marketplace shifts (is_rostered=False) remain visible.
        try:
            draft_periods = list(RosterPeriod.objects.filter(status=RosterPeriod.Status.DRAFT))
            draft_q = Q()
            for dp in draft_periods:
                draft_q |= Q(
                    is_rostered=True,
                    shift__pharmacy_id=dp.pharmacy_id,
                    slot_date__gte=dp.week_start,
                    slot_date__lte=dp.week_start + timedelta(days=6),
                )
            if draft_q:
                qs = qs.exclude(draft_q)
        except Exception:
            # If RosterPeriod table is missing (e.g. unmigrated database) or query fails,
            # preserve original queryset to guarantee legacy worker roster continuity.
            pass

        return qs

    @action(detail=False, methods=['get'])
    def pharmacies(self, request):
        user = request.user
        memberships = (
            Membership.objects
            .filter(user=user, is_active=True)
            .select_related('pharmacy')
        )

        data = []
        for m in memberships:
            p = m.pharmacy

            # Safely use legacy 'address' if it exists; otherwise compose from new parts.
            address = (
                getattr(p, "address", None)  # legacy compatibility (if still present anywhere)
                or ", ".join(filter(None, [
                    (p.street_address or "").strip(),
                    (p.suburb or "").strip(),
                    (p.state or "").strip(),
                    (p.postcode or "").strip(),
                ]))
            )

            data.append({
                "id": p.id,
                "name": p.name,
                "address": address,
                # keep returning the structured bits too (harmless + future-proof)
                "street_address": p.street_address,
                "suburb": p.suburb,
                "state": p.state,
                "postcode": p.postcode,
                "latitude": p.latitude,
                "longitude": p.longitude,
            })

        return Response(data)



























from django.http import HttpResponse, Http404


# --- Stage 2: code moved to client_profile/domains (re-exported so existing import paths keep working) ---
_MOVED_LAZY = {
    "ALL_OTHER_STAFF_SHIFT_ROLES": "client_profile.domains.shifts.base",
    "ActiveShiftViewSet": "client_profile.domains.shifts.browse",
    "ChainViewSet": "client_profile.domains.orgs.views",
    "ChatMessagePagination": "client_profile.domains.chat.views",
    "ChatParticipantView": "client_profile.domains.chat.views",
    "CommunityShiftViewSet": "client_profile.domains.shifts.browse",
    "ConfirmedShiftViewSet": "client_profile.domains.shifts.browse",
    "ConversationViewSet": "client_profile.domains.chat.views",
    "DeviceTokenViewSet": "client_profile.domains.notifications.views",
    "ESCALATION_FIELD_MAP": "client_profile.domains.shifts.base",
    "ExplorerOnboardingV2MeView": "client_profile.domains.onboarding.views",
    "ExplorerPostViewSet": "client_profile.domains.explorer.views",
    "GenerateInvoiceView": "client_profile.domains.invoices.views",
    "HistoryShiftViewSet": "client_profile.domains.shifts.browse",
    "Http400": "client_profile.domains.common.access",
    "InvoiceDetailView": "client_profile.domains.invoices.views",
    "InvoiceListView": "client_profile.domains.invoices.views",
    "IsPharmacistOrOtherStaff": "client_profile.domains.common.access",
    "IsPostOwner": "client_profile.domains.explorer.views",
    "LeaveRequestViewSet": "client_profile.domains.shifts.leave",
    "MAX_ACTIVE_PHARMACY_MEMBERSHIPS": "client_profile.domains.common.access",
    "MagicLinkInfoView": "client_profile.domains.memberships.views",
    "MembershipApplicationViewSet": "client_profile.domains.memberships.views",
    "MembershipInviteLinkViewSet": "client_profile.domains.memberships.views",
    "MembershipViewSet": "client_profile.domains.memberships.views",
    "MessageReactionView": "client_profile.domains.chat.views",
    "MessageViewSet": "client_profile.domains.chat.views",
    "MyConfirmedShiftsViewSet": "client_profile.domains.shifts.browse",
    "MyHistoryShiftsViewSet": "client_profile.domains.shifts.browse",
    "MyMembershipsViewSet": "client_profile.domains.memberships.views",
    "NON_INTERN_OTHER_STAFF_SHIFT_ROLES": "client_profile.domains.shifts.base",
    "NotificationPagination": "client_profile.domains.notifications.views",
    "NotificationViewSet": "client_profile.domains.notifications.views",
    "OFFER_EXPIRY_HOURS": "client_profile.domains.shifts.base",
    "OrganizationViewSet": "client_profile.domains.orgs.views",
    "OtherStaffOnboardingV2MeView": "client_profile.domains.onboarding.views",
    "OwnerOnboardingClaim": "client_profile.domains.orgs.claims",
    "OwnerOnboardingV2MeView": "client_profile.domains.onboarding.views",
    "PharmacistOnboardingV2MeView": "client_profile.domains.onboarding.views",
    "PharmacyAdminViewSet": "client_profile.domains.orgs.views",
    "PharmacyClaimViewSet": "client_profile.domains.orgs.claims",
    "PharmacyViewSet": "client_profile.domains.orgs.views",
    "PillRewardsViewSet": "client_profile.domains.pills.views",
    "PublicJobBoardView": "client_profile.domains.shifts.browse",
    "PublicOrganizationDetailView": "client_profile.domains.orgs.views",
    "PublicShiftViewSet": "client_profile.domains.shifts.browse",
    "RatingViewSet": "client_profile.domains.ratings.views",
    "RefereeRejectView": "client_profile.domains.onboarding.views",
    "RefereeSubmitResponseView": "client_profile.domains.onboarding.views",
    "SHIFT_OFFER_BUZZ_COOLDOWN": "client_profile.domains.shifts.base",
    "SharedShiftDetailView": "client_profile.domains.shifts.browse",
    "ShiftDescriptionTemplateViewSet": "client_profile.domains.shifts.browse",
    "ShiftDetailViewSet": "client_profile.domains.shifts.browse",
    "ShiftInterestViewSet": "client_profile.domains.shifts.offers",
    "ShiftOfferViewSet": "client_profile.domains.shifts.offers",
    "ShiftRejectionViewSet": "client_profile.domains.shifts.offers",
    "ShiftSavedViewSet": "client_profile.domains.shifts.offers",
    "SubmitMembershipApplication": "client_profile.domains.memberships.views",
    "TalentPostPagination": "client_profile.domains.explorer.views",
    "UserAvailabilityViewSet": "client_profile.domains.availability.views",
    "WorkerShiftRequestViewSet": "client_profile.domains.shifts.worker_requests",
    "_build_org_claims_url": "client_profile.domains.orgs.claims",
    "_build_owner_claims_url": "client_profile.domains.orgs.claims",
    "_collect_org_access_scope": "client_profile.domains.common.access",
    "_count_active_memberships": "client_profile.domains.common.access",
    "_create_owner_claim_notification": "client_profile.domains.orgs.claims",
    "_format_membership_person": "client_profile.domains.memberships.views",
    "_frontend_base_url_for_notifications": "client_profile.domains.memberships.views",
    "_future_or_current_slot_q": "client_profile.domains.shifts.base",
    "_get_org_pharmacies_queryset": "client_profile.domains.common.access",
    "_get_request_ip": "client_profile.domains.common.access",
    "_invoice_queryset_for_user": "client_profile.domains.invoices.views",
    "_log_shift_profile_access": "client_profile.domains.shifts.base",
    "_matching_shift_slot_exists": "client_profile.domains.shifts.base",
    "_membership_controller_users": "client_profile.domains.memberships.views",
    "_normalized_role_code": "client_profile.domains.common.access",
    "_notify_membership_invitation_sent": "client_profile.domains.memberships.views",
    "_notify_membership_response": "client_profile.domains.memberships.views",
    "_notify_org_of_claim_response": "client_profile.domains.orgs.claims",
    "_otherstaff_onboarding_role": "client_profile.domains.common.access",
    "_past_slot_q": "client_profile.domains.shifts.base",
    "_pharmacy_membership_manage_url": "client_profile.domains.memberships.views",
    "_send_owner_claim_email": "client_profile.domains.orgs.claims",
    "_send_pharmacy_created_email": "client_profile.domains.orgs.claims",
    "_shift_has_past_slot_exists": "client_profile.domains.shifts.base",
    "_slot_locked_for_shift_offer": "client_profile.domains.shifts.base",
    "_user_can_invite_members_to_pharmacy": "client_profile.domains.memberships.views",
    "_user_can_perform_shift_role": "client_profile.domains.shifts.base",
    "_worker_membership_url": "client_profile.domains.memberships.views",
    "invoice_pdf_view": "client_profile.domains.invoices.views",
    "log": "client_profile.domains.common.logs",
    "preview_invoice_lines": "client_profile.domains.invoices.views",
    "report_invoice_issue": "client_profile.domains.invoices.views",
    "send_invoice_email": "client_profile.domains.invoices.views",
}

def __getattr__(name):
    # Lazy re-export: avoids import-time cycles between this legacy module and the domain modules, which
    # still import shared helpers back from here. Result is cached so later lookups are plain attributes.
    target = _MOVED_LAZY.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    import importlib
    value = getattr(importlib.import_module(target), name)
    globals()[name] = value
    return value


def __dir__():
    return sorted(set(globals()) | set(_MOVED_LAZY))


if False:  # pragma: no cover - static analysis / IDE navigation only
    from client_profile.domains.availability.views import UserAvailabilityViewSet  # noqa: F401
    from client_profile.domains.chat.views import ChatMessagePagination, ChatParticipantView, ConversationViewSet, MessageReactionView, MessageViewSet  # noqa: F401
    from client_profile.domains.common.access import Http400, IsPharmacistOrOtherStaff, MAX_ACTIVE_PHARMACY_MEMBERSHIPS, _collect_org_access_scope, _count_active_memberships, _get_org_pharmacies_queryset, _get_request_ip, _normalized_role_code, _otherstaff_onboarding_role  # noqa: F401
    from client_profile.domains.common.logs import log  # noqa: F401
    from client_profile.domains.explorer.views import ExplorerPostViewSet, IsPostOwner, TalentPostPagination  # noqa: F401
    from client_profile.domains.invoices.views import GenerateInvoiceView, InvoiceDetailView, InvoiceListView, _invoice_queryset_for_user, invoice_pdf_view, preview_invoice_lines, report_invoice_issue, send_invoice_email  # noqa: F401
    from client_profile.domains.memberships.views import MagicLinkInfoView, MembershipApplicationViewSet, MembershipInviteLinkViewSet, MembershipViewSet, MyMembershipsViewSet, SubmitMembershipApplication, _format_membership_person, _frontend_base_url_for_notifications, _membership_controller_users, _notify_membership_invitation_sent, _notify_membership_response, _pharmacy_membership_manage_url, _user_can_invite_members_to_pharmacy, _worker_membership_url  # noqa: F401
    from client_profile.domains.notifications.views import DeviceTokenViewSet, NotificationPagination, NotificationViewSet  # noqa: F401
    from client_profile.domains.onboarding.views import ExplorerOnboardingV2MeView, OtherStaffOnboardingV2MeView, OwnerOnboardingV2MeView, PharmacistOnboardingV2MeView, RefereeRejectView, RefereeSubmitResponseView  # noqa: F401
    from client_profile.domains.orgs.claims import OwnerOnboardingClaim, PharmacyClaimViewSet, _build_org_claims_url, _build_owner_claims_url, _create_owner_claim_notification, _notify_org_of_claim_response, _send_owner_claim_email, _send_pharmacy_created_email  # noqa: F401
    from client_profile.domains.orgs.views import ChainViewSet, OrganizationViewSet, PharmacyAdminViewSet, PharmacyViewSet, PublicOrganizationDetailView  # noqa: F401
    from client_profile.domains.pills.views import PillRewardsViewSet  # noqa: F401
    from client_profile.domains.ratings.views import RatingViewSet  # noqa: F401
    from client_profile.domains.shifts.base import ALL_OTHER_STAFF_SHIFT_ROLES, BaseShiftViewSet, COMMUNITY_LEVELS, ESCALATION_FIELD_MAP, NON_INTERN_OTHER_STAFF_SHIFT_ROLES, OFFER_EXPIRY_HOURS, PUBLIC_LEVEL, SHIFT_OFFER_BUZZ_COOLDOWN, _future_or_current_slot_q, _log_shift_profile_access, _matching_shift_slot_exists, _past_slot_q, _shift_has_past_slot_exists, _shift_roles_visible_to_user, _slot_locked_for_shift_offer, _user_can_perform_shift_role  # noqa: F401
    from client_profile.domains.shifts.browse import ActiveShiftViewSet, CommunityShiftViewSet, ConfirmedShiftViewSet, HistoryShiftViewSet, MyConfirmedShiftsViewSet, MyHistoryShiftsViewSet, PublicJobBoardView, PublicShiftViewSet, SharedShiftDetailView, ShiftDescriptionTemplateViewSet, ShiftDetailViewSet  # noqa: F401
    from client_profile.domains.shifts.leave import LeaveRequestViewSet  # noqa: F401
    from client_profile.domains.shifts.offers import ShiftInterestViewSet, ShiftOfferViewSet, ShiftRejectionViewSet, ShiftSavedViewSet  # noqa: F401
    from client_profile.domains.shifts.worker_requests import WorkerShiftRequestViewSet  # noqa: F401
