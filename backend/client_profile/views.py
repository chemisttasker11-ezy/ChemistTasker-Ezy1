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



# --- Stage 2: names moved to client_profile/domains that this module still uses itself (imported here so module-level uses keep working) ---
from client_profile.domains.common.access import (
    _get_request_ip,
    _normalized_role_code,
    _otherstaff_onboarding_role,
    Http400,
    IsPharmacistOrOtherStaff,
)
# --- end Stage 2 imports ---

NON_INTERN_OTHER_STAFF_SHIFT_ROLES = ("ASSISTANT", "TECHNICIAN", "STUDENT")
ALL_OTHER_STAFF_SHIFT_ROLES = NON_INTERN_OTHER_STAFF_SHIFT_ROLES + ("INTERN",)






def _shift_roles_visible_to_user(user):
    top_role = _normalized_role_code(getattr(user, "role", None))
    if top_role == "PHARMACIST":
        return ["PHARMACIST"]
    if top_role == "EXPLORER":
        return ["EXPLORER"]
    if top_role == "OTHER_STAFF":
        staff_role = _otherstaff_onboarding_role(user)
        if staff_role == "INTERN":
            return ["INTERN"]
        if staff_role in ALL_OTHER_STAFF_SHIFT_ROLES:
            return list(NON_INTERN_OTHER_STAFF_SHIFT_ROLES)
        return list(NON_INTERN_OTHER_STAFF_SHIFT_ROLES)
    return ["PHARMACIST", "TECHNICIAN", "ASSISTANT", "EXPLORER", "INTERN", "STUDENT"]


def _user_can_perform_shift_role(user, shift_role):
    return _normalized_role_code(shift_role) in _shift_roles_visible_to_user(user)
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

log = logging.getLogger("client_profile.views")
import re
SHIFT_OFFER_BUZZ_COOLDOWN = timedelta(hours=1)
# import logging
# logger = logging.getLogger("roster.debug")

# # Flip to False when done debugging
# DEBUG_VERBOSE = True

# def _dbg(msg: str):
#     # Prints to console and logger; safe to remove later
#     print(f"[CLAIM_DBG] {msg}")
#     logger.info(f"[CLAIM_DBG] {msg}")





def _log_shift_profile_access(*, request, shift, candidate, action, slot=None):
    ShiftProfileAccessAudit.objects.create(
        shift=shift,
        slot=slot,
        target_user=candidate,
        actor=request.user if getattr(request.user, "is_authenticated", False) else None,
        action=action,
        request_ip=_get_request_ip(request),
        user_agent=(request.META.get("HTTP_USER_AGENT", "") or "")[:1000],
    )









































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



















# Shifts Mangment
COMMUNITY_LEVELS = ['FULL_PART_TIME', 'LOCUM_CASUAL', 'OWNER_CHAIN','ORG_CHAIN']
PUBLIC_LEVEL = 'PLATFORM'
OFFER_EXPIRY_HOURS = 48
ESCALATION_FIELD_MAP = {
    'LOCUM_CASUAL': 'escalate_to_locum_casual',
    'OWNER_CHAIN': 'escalate_to_owner_chain',
    'ORG_CHAIN': 'escalate_to_org_chain',
    'PLATFORM': 'escalate_to_platform',
}

class ShiftDescriptionTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = ShiftDescriptionTemplateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        managed = BaseShiftViewSet._managed_pharmacies(self.request.user)
        qs = ShiftDescriptionTemplate.objects.filter(pharmacy__in=managed).select_related(
            'pharmacy',
            'created_by',
            'updated_by',
        )
        pharmacy_id = self.request.query_params.get('pharmacy')
        role_needed = self.request.query_params.get('role_needed') or self.request.query_params.get('roleNeeded')
        if pharmacy_id:
            qs = qs.filter(pharmacy_id=pharmacy_id)
        if role_needed:
            qs = qs.filter(role_needed=str(role_needed).upper())
        return qs.order_by('pharmacy_id', 'role_needed')

    def _get_pharmacy(self, pharmacy_id):
        pharmacy = get_object_or_404(Pharmacy, pk=pharmacy_id)
        if not BaseShiftViewSet._user_can_manage_pharmacy(self.request.user, pharmacy):
            self.permission_denied(self.request)
        return pharmacy

    def create(self, request, *args, **kwargs):
        pharmacy_id = request.data.get('pharmacy')
        role_needed = str(request.data.get('role_needed') or request.data.get('roleNeeded') or '').upper()
        description = (request.data.get('description') or '').strip()

        if not pharmacy_id:
            return Response({'pharmacy': 'This field is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not role_needed:
            return Response({'role_needed': 'This field is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if role_needed not in dict(Shift.ROLE_CHOICES):
            return Response({'role_needed': 'Invalid shift role.'}, status=status.HTTP_400_BAD_REQUEST)

        pharmacy = self._get_pharmacy(pharmacy_id)
        template, created = ShiftDescriptionTemplate.objects.get_or_create(
            pharmacy=pharmacy,
            role_needed=role_needed,
            defaults={
                'description': description,
                'created_by': request.user,
                'updated_by': request.user,
            },
        )
        if not created:
            template.description = description
            template.updated_by = request.user
            template.save(update_fields=['description', 'updated_by', 'updated_at'])
        serializer = self.get_serializer(template)
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def perform_update(self, serializer):
        pharmacy = serializer.validated_data.get('pharmacy', serializer.instance.pharmacy)
        if not BaseShiftViewSet._user_can_manage_pharmacy(self.request.user, pharmacy):
            self.permission_denied(self.request)
        serializer.save(updated_by=self.request.user)


class BaseShiftViewSet(viewsets.ModelViewSet):
    queryset = Shift.objects.all()
    serializer_class = ShiftSerializer
    permission_classes = [permissions.IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        # Some actions should be callable without requiring object-level permissions (no `pk`).
        # - `calculate_rates` is a collection action used by the Post Shift form (draft pricing).
        # Allow these actions for authenticated users without requiring "manage pharmacy":
        # - express_interest / reject / claim_shift (worker interactions)
        # - calculate_rates (draft pricing helper)
        # - counter_offers (workers submitting counter offers; owners still gate accept/reject in their own actions)
        if request.method in SAFE_METHODS or self.action in ['express_interest', 'reject', 'claim_shift', 'calculate_rates', 'counter_offers']:
            return

        user = request.user
        if self.action == 'create':
            pharm_id = request.data.get('pharmacy')
            pharmacy = get_object_or_404(Pharmacy, pk=pharm_id)
        else:
            pharmacy = self.get_object().pharmacy

        if self._user_can_manage_pharmacy(user, pharmacy):
            return

        self.permission_denied(request)

    @staticmethod
    def _user_can_manage_pharmacy(user, pharmacy):
        if pharmacy.owner and getattr(pharmacy.owner, 'user', None) == user:
            return True

        if OrganizationMembership.objects.filter(
            user=user,
            role='ORG_ADMIN',
            organization_id=pharmacy.organization_id
        ).exists():
            return True

        if OrganizationMembership.objects.filter(
            user=user,
            role__in=['CHIEF_ADMIN', 'REGION_ADMIN'],
            pharmacies=pharmacy,
        ).exists():
            return True

        if has_admin_capability(user, pharmacy, CAPABILITY_MANAGE_ROSTER):
            return True

        return False

    @staticmethod
    def _managed_pharmacies(user):
        """
        Pharmacies the user can manage because they own them, are an org admin
        over them, or hold an active PharmacyAdmin assignment.
        """
        if not user or not getattr(user, "is_authenticated", False):
            return Pharmacy.objects.none()

        pharmacies = Pharmacy.objects.none()

        if hasattr(user, "owneronboarding"):
            pharmacies |= Pharmacy.objects.filter(owner=user.owneronboarding)

        org_ids = list(
            OrganizationMembership.objects.filter(user=user, role="ORG_ADMIN").values_list(
                "organization_id", flat=True
            )
        )
        if org_ids:
            pharmacies |= Pharmacy.objects.filter(
                organization_id__in=org_ids
            )

        if user:
            managed_admin_pharmacies = [
                pharm.id
                for pharm in pharmacies_user_admins(user)
                if has_admin_capability(user, pharm, CAPABILITY_MANAGE_ROSTER)
            ]
            if managed_admin_pharmacies:
                pharmacies |= Pharmacy.objects.filter(id__in=managed_admin_pharmacies)

        return pharmacies.distinct()

    @staticmethod
    def _worker_role_for_shift(user):
        role = getattr(user, 'role', None)
        if role == 'OTHER_STAFF':
            return _otherstaff_onboarding_role(user)
        return _normalized_role_code(role)

    @staticmethod
    def _is_public_shift_member_access(user, shift):
        if not user or not getattr(user, "is_authenticated", False):
            return False
        if getattr(shift, "visibility", None) != PUBLIC_LEVEL:
            return False
        if getattr(shift, "post_anonymously", False):
            return False
        if not _user_can_perform_shift_role(user, getattr(shift, "role_needed", None)):
            return False
        return Membership.objects.filter(
            user=user,
            pharmacy=shift.pharmacy,
            employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES + FAVORITE_STAFF_EMPLOYMENT_TYPES,
            is_active=True,
        ).exists()

    def get_queryset(self):
        now = timezone.now()
        self._auto_escalate_shifts(now)
        qs = Shift.objects.all().annotate(interested_users_count=Count('interests'))
        user = self.request.user
        if getattr(user, "role", None) in ["PHARMACIST", "OTHER_STAFF", "EXPLORER"]:
            qs = qs.filter(Q(dedicated_user__isnull=True) | Q(dedicated_user=user))
        return qs

    def _auto_escalate_shifts(self, now):
        date_filter = Q()
        for field in ESCALATION_FIELD_MAP.values():
            date_filter |= Q(**{f'{field}__lte': now})

        if not date_filter:
            return

        candidates = Shift.objects.filter(
            interests__isnull=True
        ).filter(date_filter).select_related('pharmacy', 'pharmacy__owner', 'created_by')

        for shift in candidates:
            allowed_tiers = self.serializer_class.build_allowed_tiers(shift.pharmacy)
            if not allowed_tiers:
                continue

            current_index = self._resolve_current_index(shift, allowed_tiers)
            target_index = current_index

            for idx in range(current_index + 1, len(allowed_tiers)):
                tier = allowed_tiers[idx]
                field = ESCALATION_FIELD_MAP.get(tier)
                if not field:
                    continue
                ts = getattr(shift, field)
                if ts and ts <= now:
                    target_index = idx

            if target_index > current_index:
                target_visibility = allowed_tiers[target_index]
                if target_visibility == PUBLIC_LEVEL:
                    try:
                        enforce_public_shift_daily_limit(shift.pharmacy)
                    except ValidationError:
                        continue
                self._apply_escalation(shift, allowed_tiers, target_index, stamp_missing=False)

    @staticmethod
    def _resolve_current_index(shift, allowed_tiers):
        try:
            return allowed_tiers.index(shift.visibility)
        except ValueError:
            idx = shift.escalation_level or 0
            if idx < 0:
                idx = 0
            if idx >= len(allowed_tiers):
                idx = len(allowed_tiers) - 1
            return idx

    @staticmethod
    def _apply_escalation(shift, allowed_tiers, target_index, *, stamp_missing=True, timestamp=None):
        target_visibility = allowed_tiers[target_index]
        update_fields = ['visibility', 'escalation_level']
        shift.visibility = target_visibility
        shift.escalation_level = target_index

        if stamp_missing:
            stamp_time = timestamp or timezone.now()
            for idx in range(1, target_index + 1):
                tier = allowed_tiers[idx]
                field = ESCALATION_FIELD_MAP.get(tier)
                if field and not getattr(shift, field):
                    setattr(shift, field, stamp_time)
                    update_fields.append(field)

        # Remove duplicates while preserving order
        shift.save(update_fields=list(dict.fromkeys(update_fields)))
        return target_visibility

    def _build_member_status_response(self, request, shift):
        # Retrieve the visibility parameter from the request query params.
        requested_visibility = request.query_params.get('visibility')
        if not requested_visibility:
            requested_visibility = shift.visibility

        # Public/Chemisttasker is handled by shift interests. Historical member tiers
        # must remain viewable after a shift is escalated to public.
        if requested_visibility == PUBLIC_LEVEL:
            return Response(
                {
                    'detail': 'Member status is not applicable for Public shifts via this endpoint. '
                              'Please query /shift-interests directly for public interests.'
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        slot_id_param = request.query_params.get('slot_id')
        slot_date = request.query_params.get('slot_date')

        slot_obj = None
        if slot_id_param:
            slot_obj = get_object_or_404(ShiftSlot, pk=slot_id_param, shift=shift)
        elif not shift.single_user_only:
            # For multi-slot shifts that are not single-user-only, a slot_id is required for specific status.
            return Response(
                {'detail': 'slot_id is required for multi-slot shifts via this endpoint.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        interests_query = ShiftInterest.objects.filter(shift=shift)
        rejections_query = ShiftRejection.objects.filter(shift=shift)

        if shift.single_user_only:
            interests_query = interests_query.filter(slot__isnull=True)
            rejections_query = rejections_query.filter(slot__isnull=True)
        else:  # Multi-slot (non-single_user_only)
            interests_query = interests_query.filter(slot=slot_obj)
            rejections_query = rejections_query.filter(slot=slot_obj)
            if slot_obj and slot_obj.is_recurring and slot_date:
                rejections_query = rejections_query.filter(slot_date=slot_date)

        interested_user_ids = {i.user_id for i in interests_query}
        rejected_user_ids = {r.user_id for r in rejections_query}

        memberships_qs = Membership.objects.filter(
            is_active=True,
            role=shift.role_needed
        ).select_related('user', 'pharmacy', 'pharmacy__organization')

        # Apply filtering based on the requested_visibility from the query parameter
        if requested_visibility == 'FULL_PART_TIME':
            memberships_qs = memberships_qs.filter(
                pharmacy=shift.pharmacy,
                employment_type__in=['FULL_TIME', 'PART_TIME', 'CASUAL'],
            )
        elif requested_visibility == 'LOCUM_CASUAL':
            memberships_qs = memberships_qs.filter(
                pharmacy=shift.pharmacy,
                employment_type__in=['LOCUM', 'SHIFT_HERO'],
            )
        elif requested_visibility == 'OWNER_CHAIN':
            owner = getattr(shift.pharmacy, 'owner', None)
            chain_ids = Chain.objects.filter(
                owner=owner,
                pharmacies=shift.pharmacy,
            ).values_list('id', flat=True) if owner else []
            if chain_ids:
                memberships_qs = memberships_qs.filter(
                    pharmacy__chains__id__in=chain_ids
                )
            else:
                memberships_qs = Membership.objects.none()
        elif requested_visibility == 'ORG_CHAIN':
            if shift.pharmacy.organization_id:
                memberships_qs = memberships_qs.filter(
                    pharmacy__organization_id=shift.pharmacy.organization_id
                )
            else:
                memberships_qs = Membership.objects.none()
        else:
            memberships_qs = Membership.objects.none()

        data = []
        for membership in memberships_qs.distinct():
            user = membership.user
            member_interaction_status = 'no_response'

            display_name = membership.invited_name if membership.invited_name else user.get_full_name()

            is_assigned = False
            if shift.single_user_only:
                is_assigned = ShiftSlotAssignment.objects.filter(
                    user=user,
                    shift=shift
                ).exists()
            else:
                is_assigned = ShiftSlotAssignment.objects.filter(
                    user=user,
                    slot=slot_obj,
                    **({'slot_date': slot_date} if slot_obj and slot_obj.is_recurring and slot_date else {})
                ).exists()

            pending_offer_qs = ShiftOffer.objects.filter(
                shift=shift,
                user=user,
                status=ShiftOffer.Status.PENDING,
            )
            if shift.single_user_only:
                pending_offer_qs = pending_offer_qs.filter(slot__isnull=True)
            else:
                pending_offer_qs = pending_offer_qs.filter(slot=slot_obj)
                if slot_obj and slot_obj.is_recurring and slot_date:
                    pending_offer_qs = pending_offer_qs.filter(
                        Q(offered_slot_date=slot_date) | Q(offered_slot_date__isnull=True)
                    )
            pending_offer = pending_offer_qs.order_by('-created_at').first()
            pending_confirmation = pending_offer is not None
            pending_confirmation_counter_offer_data = None
            if pending_offer and pending_offer.counter_offer_id:
                pending_confirmation_counter_offer_data = ShiftCounterOfferSerializer(
                    pending_offer.counter_offer,
                    context={
                        'request': request,
                        'shift': shift,
                        'include_user_detail': True,
                    },
                ).data
            if pending_offer and pending_confirmation_counter_offer_data is None:
                accepted_counter_offer_qs = ShiftCounterOffer.objects.filter(
                    shift=shift,
                    user=user,
                    status=ShiftCounterOffer.Status.ACCEPTED,
                    slots__isnull=False,
                )
                if not shift.single_user_only and slot_obj:
                    accepted_counter_offer_qs = accepted_counter_offer_qs.filter(slots__slot=slot_obj)
                    if slot_obj.is_recurring and slot_date:
                        accepted_counter_offer_qs = accepted_counter_offer_qs.filter(
                            Q(slots__slot_date=slot_date) | Q(slots__slot_date__isnull=True)
                        )
                accepted_counter_offer = accepted_counter_offer_qs.order_by('-updated_at').first()
                if accepted_counter_offer:
                    pending_confirmation_counter_offer_data = ShiftCounterOfferSerializer(
                        accepted_counter_offer,
                        context={
                            'request': request,
                            'shift': shift,
                            'include_user_detail': True,
                        },
                    ).data
            if pending_offer and pending_confirmation_counter_offer_data is None:
                pending_confirmation_counter_offer_data = {
                    'id': None,
                    'shift': shift.id,
                    'user': user.id,
                    'user_detail': UserProfileSerializer(user, context={'request': request}).data,
                    'travel_origin': None,
                    'request_travel': False,
                    'status': 'ACCEPTED',
                    'slots': [{
                        'id': None,
                        'slot_id': pending_offer.slot_id,
                        'slot_date': pending_offer.offered_slot_date,
                        'slot': ShiftSlotSerializer(pending_offer.slot, context={'request': request}).data if pending_offer.slot_id else None,
                        'proposed_start_time': pending_offer.offered_start_time,
                        'proposed_end_time': pending_offer.offered_end_time,
                        'proposed_rate': pending_offer.offered_rate,
                    }],
                    'created_at': pending_offer.created_at,
                    'updated_at': pending_offer.updated_at,
                }

            active_counter_offer_qs = ShiftCounterOffer.objects.filter(
                shift=shift,
                user=user,
                status=ShiftCounterOffer.Status.PENDING,
                slots__isnull=False,
            )
            if not shift.single_user_only and slot_obj:
                active_counter_offer_qs = active_counter_offer_qs.filter(slots__slot=slot_obj)
                if slot_obj.is_recurring and slot_date:
                    active_counter_offer_qs = active_counter_offer_qs.filter(
                        Q(slots__slot_date=slot_date) | Q(slots__slot_date__isnull=True)
                    )
            active_counter_offer_exists = active_counter_offer_qs.exists()

            awaiting_payment_qs = ShiftOffer.objects.filter(
                shift=shift,
                user=user,
                status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            )
            if shift.single_user_only:
                awaiting_payment_qs = awaiting_payment_qs.filter(slot__isnull=True)
            else:
                awaiting_payment_qs = awaiting_payment_qs.filter(slot=slot_obj)
                if slot_obj and slot_obj.is_recurring and slot_date:
                    awaiting_payment_qs = awaiting_payment_qs.filter(
                        Q(offered_slot_date=slot_date) | Q(offered_slot_date__isnull=True)
                    )
            awaiting_payment_offer = awaiting_payment_qs.order_by('-updated_at').first()
            awaiting_payment = awaiting_payment_offer is not None
            awaiting_payment_counter_offer_data = None
            if awaiting_payment_offer and awaiting_payment_offer.counter_offer_id:
                awaiting_payment_counter_offer_data = ShiftCounterOfferSerializer(
                    awaiting_payment_offer.counter_offer,
                    context={
                        'request': request,
                        'shift': shift,
                        'include_user_detail': True,
                    },
                ).data
            if awaiting_payment_offer and awaiting_payment_counter_offer_data is None:
                awaiting_payment_counter_offer_data = {
                    'id': None,
                    'shift': shift.id,
                    'user': user.id,
                    'user_detail': UserProfileSerializer(user, context={'request': request}).data,
                    'travel_origin': None,
                    'request_travel': False,
                    'status': 'ACCEPTED',
                    'slots': [{
                        'id': None,
                        'slot_id': awaiting_payment_offer.slot_id,
                        'slot_date': awaiting_payment_offer.offered_slot_date,
                        'slot': ShiftSlotSerializer(awaiting_payment_offer.slot, context={'request': request}).data if awaiting_payment_offer.slot_id else None,
                        'proposed_start_time': awaiting_payment_offer.offered_start_time,
                        'proposed_end_time': awaiting_payment_offer.offered_end_time,
                        'proposed_rate': awaiting_payment_offer.offered_rate,
                    }],
                    'created_at': awaiting_payment_offer.created_at,
                    'updated_at': awaiting_payment_offer.updated_at,
                }
            if active_counter_offer_exists:
                pending_confirmation = False
                pending_offer = None
                pending_confirmation_counter_offer_data = None
                awaiting_payment = False
                awaiting_payment_offer = None
                awaiting_payment_counter_offer_data = None

            if is_assigned:
                member_interaction_status = 'accepted'
            elif user.id in interested_user_ids:
                member_interaction_status = 'interested'
            elif user.id in rejected_user_ids:
                member_interaction_status = 'rejected'

            data.append({
                'user_id': user.id,
                'name': display_name,
                'employment_type': membership.employment_type,
                'role': membership.role,
                'status': member_interaction_status,
                'is_member': True,
                'membership_id': membership.id,
                'pharmacy_id': membership.pharmacy_id,
                'pharmacy_name': membership.pharmacy.name if membership.pharmacy else None,
                'organization_id': membership.pharmacy.organization_id if membership.pharmacy else None,
                'organization_name': (
                    membership.pharmacy.organization.name
                    if membership.pharmacy and membership.pharmacy.organization
                    else None
                ),
                'visibility_level': requested_visibility,
                'pending_confirmation': pending_confirmation,
                'pending_offer_id': pending_offer.id if pending_offer else None,
                'pending_confirmation_counter_offer': pending_confirmation_counter_offer_data,
                'awaiting_payment': awaiting_payment,
                'awaiting_payment_offer_id': awaiting_payment_offer.id if awaiting_payment_offer else None,
                'awaiting_payment_counter_offer': awaiting_payment_counter_offer_data,
            })

        return Response(data)

    @action(detail=True, methods=['post'])
    def escalate(self, request, pk=None):
        shift = self.get_object()
        user = request.user

        if not self._user_can_manage_pharmacy(user, shift.pharmacy):
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        allowed_tiers = self.serializer_class.build_allowed_tiers(shift.pharmacy)
        if not allowed_tiers:
            return Response({'detail': 'No escalation tiers available for this pharmacy.'}, status=status.HTTP_400_BAD_REQUEST)

        current_index = self._resolve_current_index(shift, allowed_tiers)

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

        visibility = self._apply_escalation(shift, allowed_tiers, target_index)
        return Response({'detail': f'Shift escalated to {visibility}.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def express_interest(self, request, pk=None):
        shift = self.get_queryset().filter(pk=pk).distinct().first()
        if not shift:
            raise NotFound("Shift not found.")
        user  = request.user

        # 1) Onboarding required
        if shift.visibility == PUBLIC_LEVEL and not self._is_public_shift_member_access(user, shift):
            if user.role == 'PHARMACIST':
                po = PharmacistOnboarding.objects.filter(user=user).first()
                if not po:
                    return Response(
                        {'detail': 'Please complete your pharmacist onboarding before applying for public shifts.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                if not po.verified:
                    return Response(
                        {'detail': 'Your onboarding must be verified by admin before applying for public shifts.'},
                        status=status.HTTP_403_FORBIDDEN
                    )
            elif user.role == 'OTHER_STAFF':
                os = OtherStaffOnboarding.objects.filter(user=user).first()
                if not os:
                    return Response(
                        {'detail': 'Please complete your staff onboarding before applying for public shifts.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                if not os.verified:
                    return Response(
                        {'detail': 'Your onboarding must be verified by admin before applying for public shifts.'},
                        status=status.HTTP_403_FORBIDDEN
                    )


        # 2) Interest logic
        slot_ids = request.data.get('slot_ids')
        if slot_ids is None:
            slot_ids = request.data.get('slotIds')
        slot_id = request.data.get('slot_id')
        if slot_id is None:
            slot_id = request.data.get('slotId')

        if slot_ids is not None and not isinstance(slot_ids, list):
            return Response({'detail': 'slot_ids must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

        has_slot_payload = slot_ids is not None or slot_id is not None
        raw_target_slot_ids = slot_ids if slot_ids is not None else ([slot_id] if slot_id is not None else [])
        target_slot_ids = []
        for value in raw_target_slot_ids:
            if value in (None, ''):
                continue
            try:
                target_slot_ids.append(int(value))
            except (TypeError, ValueError):
                return Response({'detail': f'Invalid slot_id: {value}'}, status=status.HTTP_400_BAD_REQUEST)

        interests = []
        created_interests = []
        if shift.single_user_only:
            interest, created = ShiftInterest.objects.get_or_create(
                shift=shift,
                slot=None,
                user=user
            )
            interests.append(interest)
            if created:
                created_interests.append(interest)
        else:
            if target_slot_ids:
                slots = list(ShiftSlot.objects.filter(pk__in=target_slot_ids, shift=shift))
                found_ids = {slot.id for slot in slots}
                missing_ids = [value for value in target_slot_ids if value not in found_ids]
                if missing_ids:
                    return Response({'detail': f'Invalid slot_id(s): {missing_ids}'}, status=status.HTTP_400_BAD_REQUEST)
            elif has_slot_payload:
                return Response({'detail': 'slot_ids cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)
            else:
                slots = [None]

            for slot in slots:
                interest, created = ShiftInterest.objects.get_or_create(
                    shift=shift,
                    slot=slot,
                    user=user
                )
                interests.append(interest)
                if created:
                    created_interests.append(interest)

        if created_interests:
            is_public = (shift.visibility == 'PLATFORM')
            applicant_name = "A candidate" if is_public else (user.get_full_name() or user.email)
            title = "New public shift interest" if is_public else "New member shift interest"
            interest_details = build_offer_shift_details(shift, created_interests[0])
            body = (
                f"{applicant_name} expressed interest in "
                f"{len(created_interests)} slot(s) at {shift.pharmacy.name}. {interest_details['shift_summary']}"
            )
            manager_recipients = notify_shift_managers(
                shift,
                title=title,
                body=body,
                kind="shift_interest",
                payload={
                    "interest_ids": [interest.id for interest in created_interests],
                    "slot_ids": [interest.slot_id for interest in created_interests if interest.slot_id],
                    "slot_id": next((interest.slot_id for interest in created_interests if interest.slot_id), None),
                    **interest_details,
                },
            )
            primary_email_recipient = shift.created_by or (manager_recipients[0] if manager_recipients else None)
            ctx = build_shift_interest_context(shift, created_interests[0], recipient=primary_email_recipient)
            interest_slots = []
            for interest in created_interests:
                slot = getattr(interest, "slot", None)
                if slot:
                    interest_slots.append({
                        "date": slot.date.strftime("%d %B, %Y").lstrip("0"),
                        "start_time": slot.start_time.strftime("%I:%M %p").lstrip("0"),
                        "end_time": slot.end_time.strftime("%I:%M %p").lstrip("0"),
                    })
            if interest_slots:
                ctx["slots"] = interest_slots

            email_recipient = primary_email_recipient if primary_email_recipient and primary_email_recipient.email else None
            if email_recipient:
                email_kwargs = dict(
                    subject=f"New interest in your shift at {shift.pharmacy.name}",
                    recipient_list=[email_recipient.email],
                    template_name="emails/shift_interest.html" if is_public else "emails/shift_member_interest.html",
                    context=ctx,
                    text_template="emails/shift_interest.txt" if is_public else "emails/shift_member_interest.txt",
                    suppress_auto_notification=True,
                )
                async_task('users.tasks.send_async_email', **email_kwargs)

        # 3) Serialize and return
        serializer = (
            ShiftInterestSerializer(interests, many=True, context={'request': request})
            if len(interests) > 1
            else ShiftInterestSerializer(interests[0], context={'request': request})
        )
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED if created_interests else status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def reveal_profile(self, request, pk=None):
        shift = self.get_object()
        user_id = request.data.get('user_id')
        
        if user_id is None:
            return Response({'detail': 'user_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        candidate = get_object_or_404(User, pk=user_id)
        slot_id = request.data.get('slot_id')
        slot = get_object_or_404(ShiftSlot, pk=slot_id, shift=shift) if slot_id is not None else None

        # Handle single user shifts
        if shift.single_user_only:
            # For single user shifts, try slot-specific first (recurring slots share one user), then fallback to slot=None
            if slot_id is not None:
                interest = ShiftInterest.objects.filter(
                    shift=shift, slot_id=slot_id, user=candidate
                ).first()
                if not interest:
                    interest = ShiftInterest.objects.filter(
                        shift=shift, slot__isnull=True, user=candidate
                    ).first()
            else:
                interest = ShiftInterest.objects.filter(
                    shift=shift, slot__isnull=True, user=candidate
                ).first()

            if not interest:
                return Response({'detail': 'No ShiftInterest matches the given query.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            # Existing multi-slot logic
            if slot_id is not None:
                try:
                    interest = ShiftInterest.objects.get(
                        shift=shift, slot_id=slot_id, user=candidate
                    )
                except ShiftInterest.DoesNotExist:
                    interest = get_object_or_404(
                        ShiftInterest, shift=shift, slot__isnull=True, user=candidate
                    )
            else:
                interest = get_object_or_404(
                    ShiftInterest, shift=shift, slot__isnull=True, user=candidate
                )

        # Rest of the reveal logic remains the same...
        already_revealed_user = shift.revealed_users.filter(pk=user_id).exists()
        already_revealed_interest = bool(interest.revealed)

        if (shift.reveal_quota is not None
            and shift.reveal_count >= shift.reveal_quota
            and not already_revealed_user):
            return Response({'detail': 'Reveal quota exceeded.'}, status=status.HTTP_403_FORBIDDEN)

        if not already_revealed_user:
            shift.revealed_users.add(candidate)
            shift.reveal_count += 1
            shift.save()

        if not already_revealed_interest:
            interest.revealed = True
            interest.save()

        _log_shift_profile_access(
            request=request,
            shift=shift,
            candidate=candidate,
            action=ShiftProfileAccessAudit.Action.REVEAL_PROFILE,
            slot=slot,
        )

        # Notify only the first time this interest/profile is revealed.
        if not already_revealed_interest:
            ctx = build_shift_email_context(shift, user=candidate, role=candidate.role.lower())
            reveal_details = build_offer_shift_details(shift, interest)
            notify_shift_users(
                [candidate],
                shift=shift,
                title=f"Profile revealed: {shift.pharmacy.name}",
                body=f"Your profile was shared with {shift.pharmacy.name} for an upcoming shift. {reveal_details['shift_summary']}",
                kind="shift_profile_revealed",
                payload={
                    "slot_id": slot_id,
                    **reveal_details,
                },
            )

            if candidate.email:
                async_task(
                    'users.tasks.send_async_email',
                    subject=f"Your profile was revealed for a shift at {shift.pharmacy.name}",
                    recipient_list=[candidate.email],
                    template_name="emails/shift_reveal.html",
                    context=ctx,
                    text_template="emails/shift_reveal.txt",
                    suppress_auto_notification=True,
                )

        try:
            po = PharmacistOnboarding.objects.get(user=candidate)
            profile_data = {
                'phone_number': candidate.mobile_number,
                'short_bio': po.short_bio,
                'resume': request.build_absolute_uri(po.resume.url) if po.resume else None,
                'rate_preference': po.rate_preference or None,
            }
        except PharmacistOnboarding.DoesNotExist:
            os = OtherStaffOnboarding.objects.get(user=candidate)
            profile_data = {
                'phone_number': candidate.mobile_number,
                'short_bio': os.short_bio,
                'resume': request.build_absolute_uri(os.resume.url) if os.resume else None,
            }

        return Response({
            'id': candidate.id,
            'first_name': candidate.first_name,
            'last_name': candidate.last_name,
            'email': candidate.email,
            **profile_data
        })

    @action(detail=True, methods=['post'])
    def accept_user(self, request, pk=None):
        """
        Assigns a user to a shift by creating a time-bound offer.
        The worker must confirm the offer before any slot assignment is created.
        """
        shift = self.get_object()
        user_id = request.data.get('user_id')
        if user_id is None:
            return Response({'detail': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        candidate = get_object_or_404(User, pk=user_id)
        # Normalize slot id from various payload shapes and auto-pick when possible
        slot_id = request.data.get('slot_id')
        if slot_id in (None, ''):
            slot_id = request.data.get('slotId')
        if slot_id in (None, ''):
            slot_id = request.data.get('slot')  # alternate key some clients send
        if slot_id in ('', 'null'):
            slot_id = None
        if isinstance(slot_id, str) and slot_id.isdigit():
            slot_id = int(slot_id)

        # TEMP DEBUG - remove after investigation
        try:
            slots_qs = shift.slots.all()
            unassigned_ids = [
                s.id for s in slots_qs
                if not ShiftSlotAssignment.objects.filter(slot=s).exists()
            ]
            # print({
            #     "DBG": "accept_user",
            #     "shift_id": shift.id,
            #     "single_user_only": shift.single_user_only,
            #     "slot_id_raw": request.data.get('slot_id'),
            #     "slotId_raw": request.data.get('slotId'),
            #     "slot_alt_raw": request.data.get('slot'),
            #     "slot_id_normalized": slot_id,
            #     "slots_count": slots_qs.count(),
            #     "unassigned_ids": unassigned_ids,
            #     "user_id": user_id,
            # })
        except Exception as e:
            # print({"DBG": "accept_user_error", "error": str(e)})
            pass
        # For multi-slot shifts, auto-pick when possible (prefer unassigned)
        if not shift.single_user_only and slot_id is None:
            slots_qs = shift.slots.all()
            if slots_qs.count() == 1:
                slot_id = slots_qs.first().id
            else:
                unassigned_ids = [
                    s.id for s in slots_qs
                    if not ShiftSlotAssignment.objects.filter(slot=s).exists()
                ]
                if len(unassigned_ids) == 1:
                    slot_id = unassigned_ids[0]
                elif unassigned_ids:
                    slot_id = unassigned_ids[0]

        # For multi-slot shifts, prefer an explicit slot_id; if still None after auto-pick, raise.
        if not shift.single_user_only and slot_id is None:
            return Response(
                {'detail': 'slot_id is required for multi-slot shifts.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        slot_obj = None
        if not shift.single_user_only and slot_id is not None:
            slot_obj = get_object_or_404(shift.slots, pk=slot_id)
            if _slot_locked_for_shift_offer(shift=shift, slot=slot_obj):
                return Response({'detail': 'This slot is already locked or awaiting payment.'}, status=status.HTTP_400_BAD_REQUEST)
        elif shift.single_user_only:
            locked_slot = next(
                (slot for slot in shift.slots.all() if _slot_locked_for_shift_offer(shift=shift, slot=slot)),
                None,
            )
            if locked_slot:
                return Response({'detail': 'This shift is already locked or awaiting payment.'}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        existing_offer = ShiftOffer.objects.filter(
            shift=shift,
            user=candidate,
            slot=slot_obj,
            status=ShiftOffer.Status.PENDING,
        ).first()
        if existing_offer and existing_offer.expires_at and existing_offer.expires_at <= now:
            existing_offer.status = ShiftOffer.Status.EXPIRED
            existing_offer.save(update_fields=["status", "updated_at"])
            existing_offer = None

        offered_slot_date = slot_obj.date if slot_obj else None
        offered_start_time = slot_obj.start_time if slot_obj else None
        offered_end_time = slot_obj.end_time if slot_obj else None
        offered_rate = slot_obj.rate if slot_obj else (shift.fixed_rate or shift.max_hourly_rate or shift.min_hourly_rate)

        if existing_offer:
            existing_offer.offered_slot_date = offered_slot_date
            existing_offer.offered_start_time = offered_start_time
            existing_offer.offered_end_time = offered_end_time
            existing_offer.offered_rate = offered_rate
            existing_offer.save(update_fields=[
                "offered_slot_date",
                "offered_start_time",
                "offered_end_time",
                "offered_rate",
                "updated_at",
            ])
            return Response({
                'status': 'Offer is already pending candidate confirmation.',
                'offer_id': existing_offer.id,
                'worker_confirmation_required': True,
            }, status=status.HTTP_200_OK)
        else:
            offer = ShiftOffer.objects.create(
                shift=shift,
                slot=slot_obj,
                user=candidate,
                offered_slot_date=offered_slot_date,
                offered_start_time=offered_start_time,
                offered_end_time=offered_end_time,
                offered_rate=offered_rate,
                expires_at=now + timedelta(hours=OFFER_EXPIRY_HOURS),
            )

        if candidate.email:
            ctx = build_shift_offer_context(shift, offer, recipient=candidate)
            offer_details = build_offer_shift_details(shift, offer)
            ctx.update(offer_details)
            notify_shift_users(
                [candidate],
                shift=shift,
                title="Shift offer received",
                body=f"You have received a shift offer. Please confirm to lock it in. {offer_details['shift_summary']}",
                kind="shift_offer_received",
                payload={"offer_id": offer.id, **offer_details},
            )
            async_task(
                'users.tasks.send_async_email',
                subject="You have a new shift offer",
                recipient_list=[candidate.email],
                template_name="emails/shift_offer.html",
                context=ctx,
                text_template="emails/shift_offer.txt",
                suppress_auto_notification=True,
            )

        return Response({
            'status': f'Offer sent to {candidate.get_full_name() or candidate.email}.',
            'offer_id': offer.id,
        }, status=status.HTTP_200_OK)


    @action(detail=False, methods=['get'], url_path='counter-offers-batch')
    def counter_offers_batch(self, request):
        raw_ids = request.query_params.get('shift_ids', '')
        parsed_ids = []
        for value in raw_ids.split(','):
            value = value.strip()
            if not value:
                continue
            try:
                parsed_ids.append(int(value))
            except (TypeError, ValueError):
                raise ValidationError({'shift_ids': 'Use a comma-separated list of numeric shift IDs.'})
        shift_ids = list(dict.fromkeys(parsed_ids))
        if len(shift_ids) > 100:
            raise ValidationError({'shift_ids': 'A maximum of 100 shifts can be requested at once.'})
        if not shift_ids:
            return Response({})

        shifts = (
            self.filter_queryset(self.get_queryset())
            .filter(id__in=shift_ids)
            .select_related('pharmacy')
        )
        result = {}
        for shift in shifts:
            from client_profile.domains.shifts.counter_offers import visible_counter_offers_for_shift
            offers = visible_counter_offers_for_shift(
                shift=shift,
                user=request.user,
                can_manage_pharmacy=self._user_can_manage_pharmacy(request.user, shift.pharmacy),
            )
            result[str(shift.id)] = ShiftCounterOfferSerializer(
                offers,
                many=True,
                context={
                    'request': request,
                    'shift': shift,
                    'include_user_detail': True,
                },
            ).data

        return Response(result)

    @action(detail=True, methods=['get', 'post'], url_path='counter-offers')
    def counter_offers(self, request, pk=None):
        shift = self.get_object()

        if request.method == 'GET':
            from client_profile.domains.shifts.counter_offers import visible_counter_offers_for_shift
            offers = visible_counter_offers_for_shift(
                shift=shift,
                user=request.user,
                can_manage_pharmacy=self._user_can_manage_pharmacy(request.user, shift.pharmacy),
            )
            serializer = ShiftCounterOfferSerializer(
                offers,
                many=True,
                context={
                    'request': request,
                    'shift': shift,
                    'include_user_detail': True,  # owner can see identity (after reveal check in serializer)
                },
            )
            return Response(serializer.data)

        serializer = ShiftCounterOfferSerializer(data=request.data, context={'request': request, 'shift': shift})
        serializer.is_valid(raise_exception=True)
        try:
            # print(f"[counter_offers POST] shift={shift.id} user={getattr(request.user, 'id', None)} slots_payload={request.data.get('slots')}")
            vd = getattr(serializer, 'validated_data', {})
            # print(f"[counter_offers POST] validated slots count={len(vd.get('slots', []))} slots={vd.get('slots')}")
        except Exception:
            pass
        offer = serializer.save()

        # Ensure the user is marked as interested in the targeted slots (or shift-level) without triggering the
        # express_interest email/notification path. This keeps counter-offer slots disabled and visible in interests.
        self._ensure_interest_for_counter_offer(shift=shift, user=request.user, offer=offer)

        # Notify shift managers in-app; keep email limited to owner/creator.
        offer_slot_ids = list(offer.slots.values_list('slot_id', flat=True))
        primary_slot_id = offer_slot_ids[0] if offer_slot_ids else None
        is_public = (shift.visibility == 'PLATFORM')
        sender_name = "A candidate" if is_public else (offer.user.get_full_name() if offer.user else "A candidate")
        offer_details = build_counter_offer_shift_details(shift, offer)
        notify_shift_managers(
            shift,
            title=f"New counter offer: {shift.pharmacy.name}",
            body=f"{sender_name} sent a counter offer for your shift. {offer_details['shift_summary']}",
            kind="shift_counter_offer_received",
            payload={
                "offer_id": offer.id,
                "slot_id": primary_slot_id,
                "slot_ids": offer_slot_ids,
                **offer_details,
            },
        )

        recipients = []
        if shift.created_by:
            recipients.append(shift.created_by)
        elif getattr(getattr(shift.pharmacy, "owner", None), "user", None):
            recipients.append(shift.pharmacy.owner.user)

        seen_emails = set()
        for recipient in recipients:
            if not recipient or not recipient.email:
                continue
            if recipient.email in seen_emails:
                continue
            seen_emails.add(recipient.email)
            ctx = build_shift_counter_offer_context(shift, offer, recipient=recipient)
            async_task(
                'users.tasks.send_async_email',
                subject=f"New counter offer for {shift.pharmacy.name}",
                recipient_list=[recipient.email],
                template_name="emails/shift_counter_offer.html",
                context=ctx,
                text_template="emails/shift_counter_offer.txt",
                suppress_auto_notification=True,
            )
        output = ShiftCounterOfferSerializer(offer, context={'request': request, 'shift': shift})
        try:
            # print(f"[counter_offers POST] saved slots={list(offer.slots.values('id','slot_id','slot_date','proposed_start_time','proposed_end_time','proposed_rate'))}")
            pass
        except Exception:
            pass
        return Response(output.data, status=status.HTTP_201_CREATED)

    @staticmethod
    def _ensure_interest_for_counter_offer(*, shift, user, offer):
        slots_qs = offer.slots.select_related('slot')
        slots = list(slots_qs)
        if slots:
            for offer_slot in slots:
                slot = offer_slot.slot
                if not slot:
                    continue
                ShiftInterest.objects.get_or_create(
                    shift=shift,
                    slot=slot,
                    user=user,
                )
        else:
            # No specific slots: record shift-level interest
            ShiftInterest.objects.get_or_create(
                shift=shift,
                slot=None,
                user=user,
            )

    @action(detail=True, methods=['post'], url_path='counter-offers/(?P<offer_id>[^/.]+)/accept')
    def accept_counter_offer(self, request, pk=None, offer_id=None):
        shift = self.get_object()
        if not self._user_can_manage_pharmacy(request.user, shift.pharmacy):
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        offer = get_object_or_404(ShiftCounterOffer, pk=offer_id, shift=shift)

        slot_id = request.data.get('slot_id')
        if slot_id in (None, ''):
            slot_id = request.data.get('slotId')
        if slot_id in ('', 'null'):
            slot_id = None
        if isinstance(slot_id, str) and slot_id.isdigit():
            slot_id = int(slot_id)

        log.warning(
            "[counter_offer_accept] shift_id=%s offer_id=%s slot_id=%s single_user_only=%s request_data=%s",
            shift.id,
            offer.id,
            slot_id,
            shift.single_user_only,
            request.data,
        )
        log.warning(
            "[counter_offer_accept] request_query=%s",
            dict(request.query_params),
        )

        offer_slot_ids = list(offer.slots.values_list('slot_id', flat=True))
        log.warning(
            "[counter_offer_accept] offer_slot_ids=%s offer_status=%s",
            offer_slot_ids,
            offer.status,
        )

        if slot_id is None:
            if offer_slot_ids:
                unassigned_offer_slots = [
                    sid for sid in offer_slot_ids
                    if not ShiftSlotAssignment.objects.filter(slot_id=sid).exists()
                ]
                slot_id = unassigned_offer_slots[0] if unassigned_offer_slots else offer_slot_ids[0]
                log.warning(
                    "[counter_offer_accept] auto-selected slot_id=%s from offer slots",
                    slot_id,
                )

        # Allow per-slot acceptance even if the offer was already accepted for another slot.
        if offer.status != ShiftCounterOffer.Status.PENDING and slot_id is None:
            return Response({'detail': 'Counter offer is not pending.'}, status=status.HTTP_400_BAD_REQUEST)
        if offer.status == ShiftCounterOffer.Status.REJECTED:
            return Response({'detail': 'Counter offer has been rejected.'}, status=status.HTTP_400_BAD_REQUEST)

        offer_slots_qs = offer.slots.select_related('slot')
        if slot_id is not None:
            offer_slots_qs = offer_slots_qs.filter(slot_id=slot_id)
        offer_slots = list(offer_slots_qs)
        if not offer_slots:
            return Response({'detail': 'Counter offer has no slots for this selection.'}, status=status.HTTP_400_BAD_REQUEST)

        for offer_slot in offer_slots:
            slot = offer_slot.slot
            slot_date = offer_slot.slot_date or slot.date
            if _slot_locked_for_shift_offer(shift=shift, slot=slot, slot_date=slot_date, ignore_user=offer.user):
                return Response({'detail': 'One or more slots are no longer available.'}, status=status.HTTP_400_BAD_REQUEST)

        offer.status = ShiftCounterOffer.Status.ACCEPTED
        offer.decided_by = request.user
        offer.decided_at = timezone.now()
        offer.save(update_fields=['status', 'decided_by', 'decided_at', 'updated_at'])

        created_offers = []
        now = timezone.now()
        for offer_slot in offer_slots:
            slot = offer_slot.slot
            existing_offer = ShiftOffer.objects.filter(
                shift=shift,
                user=offer.user,
                slot=slot,
                status=ShiftOffer.Status.PENDING,
            ).first()
            if existing_offer and existing_offer.expires_at and existing_offer.expires_at <= now:
                existing_offer.status = ShiftOffer.Status.EXPIRED
                existing_offer.save(update_fields=["status", "updated_at"])
                existing_offer = None

            effective_date = offer_slot.slot_date or slot.date
            effective_start = offer_slot.proposed_start_time or slot.start_time
            effective_end = offer_slot.proposed_end_time or slot.end_time
            effective_rate = offer_slot.proposed_rate if offer_slot.proposed_rate is not None else slot.rate

            if existing_offer:
                existing_offer.offered_slot_date = effective_date
                existing_offer.offered_start_time = effective_start
                existing_offer.offered_end_time = effective_end
                existing_offer.offered_rate = effective_rate
                existing_offer.counter_offer = offer
                existing_offer.save(update_fields=[
                    "offered_slot_date",
                    "offered_start_time",
                    "offered_end_time",
                    "offered_rate",
                    "counter_offer",
                    "updated_at",
                ])
                shift_offer = existing_offer
            else:
                shift_offer = ShiftOffer.objects.create(
                    shift=shift,
                    slot=slot,
                    user=offer.user,
                    offered_slot_date=effective_date,
                    offered_start_time=effective_start,
                    offered_end_time=effective_end,
                    offered_rate=effective_rate,
                    counter_offer=offer,
                    expires_at=now + timedelta(hours=OFFER_EXPIRY_HOURS),
                )
            created_offers.append(shift_offer)

        if offer.user and offer.user.email:
            ctx = build_shift_counter_offer_context(shift, offer, recipient=offer.user)
            ctx["payment_required"] = False
            ctx["worker_confirmation_required"] = True
            offer_details = build_offer_shift_details(shift, created_offers[0] if created_offers else None)
            ctx.update(offer_details)
            ctx["shift_link"] = worker_offer_url(offer.user, shift, created_offers[0] if created_offers else None)
            notify_shift_users(
                [offer.user],
                shift=shift,
                title="Counter offer accepted",
                body=f"Your counter offer was accepted. Please confirm the shift offer to lock it in. {offer_details['shift_summary']}",
                kind="shift_counter_offer_accepted",
                payload={
                    "shift_id": shift.id,
                    "offer_id": offer.id,
                    "generated_offer_ids": [o.id for o in created_offers],
                    "worker_confirmation_required": True,
                    **offer_details,
                },
            )
            async_task(
                'users.tasks.send_async_email',
                subject="Your counter offer was accepted",
                recipient_list=[offer.user.email],
                template_name="emails/shift_counter_offer_accepted.html",
                context=ctx,
                text_template="emails/shift_counter_offer_accepted.txt",
                suppress_auto_notification=True,
            )

        return Response({
            'detail': 'Offer sent for candidate confirmation.',
            'offer_ids': [o.id for o in created_offers],
            'assignment_ids': [],
            'payment_required': False,
            'payment_status': shift.payment_status,
            'worker_confirmation_required': True,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='counter-offers/(?P<offer_id>[^/.]+)/reject')
    def reject_counter_offer(self, request, pk=None, offer_id=None):
        shift = self.get_object()
        if not self._user_can_manage_pharmacy(request.user, shift.pharmacy):
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        offer = get_object_or_404(ShiftCounterOffer, pk=offer_id, shift=shift)
        if offer.status != ShiftCounterOffer.Status.PENDING:
            return Response({'detail': 'Counter offer is not pending.'}, status=status.HTTP_400_BAD_REQUEST)

        offer.status = ShiftCounterOffer.Status.REJECTED
        offer.decided_by = request.user
        offer.decided_at = timezone.now()
        offer.save(update_fields=['status', 'decided_by', 'decided_at', 'updated_at'])

        if offer.user and offer.user.email:
            ctx = build_shift_counter_offer_context(shift, offer, recipient=offer.user)
            offer_details = build_counter_offer_shift_details(shift, offer)
            ctx.update(offer_details)
            notify_shift_users(
                [offer.user],
                shift=shift,
                title=f"Counter offer declined: {shift.pharmacy.name}",
                body=f"Your counter offer was declined. {offer_details['shift_summary']}",
                kind="shift_counter_offer_declined",
                payload={
                    "offer_id": offer.id,
                    "slot_ids": list(offer.slots.values_list('slot_id', flat=True)),
                    **offer_details,
                },
            )
            async_task(
                'users.tasks.send_async_email',
                subject=f"Your counter offer for {shift.pharmacy.name} was declined",
                recipient_list=[offer.user.email],
                template_name="emails/shift_counter_offer_rejected.html",
                context=ctx,
                text_template="emails/shift_counter_offer_rejected.txt",
                suppress_auto_notification=True,
            )

        return Response({'detail': 'Counter offer rejected.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        shift = self.get_object()
        user = request.user
        slot_ids = request.data.get('slot_ids')
        if slot_ids is None:
            slot_ids = request.data.get('slotIds')
        slot_id = request.data.get('slot_id')
        if slot_id is None:
            slot_id = request.data.get('slotId')
        slot_date = request.data.get('slot_date')  # required if recurring

        if slot_ids is not None and not isinstance(slot_ids, list):
            return Response({'detail': 'slot_ids must be a list.'}, status=400)

        raw_target_slot_ids = slot_ids if slot_ids is not None else ([slot_id] if slot_id is not None else [])
        target_slot_ids = []
        for value in raw_target_slot_ids:
            try:
                target_slot_ids.append(int(value))
            except (TypeError, ValueError):
                return Response({'detail': f'Invalid slot_id: {value}'}, status=400)

        if not target_slot_ids:
            # Treat an empty payload as "reject the whole shift". Single-user shifts
            # store that as slot=None; multi-slot shifts expand to all concrete slots.
            slots = [None] if shift.single_user_only else list(ShiftSlot.objects.filter(shift=shift))
            if not slots:
                return Response({'detail': 'No slots are available to reject.'}, status=400)
        else:
            slots = list(ShiftSlot.objects.filter(pk__in=target_slot_ids, shift=shift))
            found_ids = {slot.id for slot in slots}
            missing_ids = [value for value in target_slot_ids if value not in found_ids]
            if missing_ids:
                return Response({'detail': f'Invalid slot_id(s): {missing_ids}'}, status=400)

        # Parse slot_date if provided (for recurring slots)
        if slot_date:
            try:
                slot_date_obj = datetime.strptime(slot_date, "%Y-%m-%d").date()
            except ValueError:
                return Response({'detail': 'Invalid slot_date format, use YYYY-MM-DD'}, status=400)
        else:
            slot_date_obj = None

        rejections = []
        created_rejections = []
        for slot in slots:
            rejection, created = ShiftRejection.objects.get_or_create(
                shift=shift,
                slot=slot,
                slot_date=slot_date_obj if slot is not None and slot.is_recurring else None,
                user=user
            )
            rejections.append(rejection)
            if created:
                created_rejections.append(rejection)

        serializer = ShiftRejectionSerializer(rejections, many=True) if len(rejections) > 1 else ShiftRejectionSerializer(rejections[0])

        # --- Send escalation prompt email if this is a new rejection ---
        if created_rejections and shift.created_by and shift.created_by.email:
            rejected_slots = []
            for rejection in created_rejections:
                slot = getattr(rejection, "slot", None)
                if slot:
                    rejected_slots.append({
                        "date": slot.date.strftime("%d %B, %Y").lstrip("0"),
                        "start_time": slot.start_time.strftime("%I:%M %p").lstrip("0"),
                        "end_time": slot.end_time.strftime("%I:%M %p").lstrip("0"),
                        "time_range": (
                            f"{slot.start_time.strftime('%I:%M %p').lstrip('0')} - "
                            f"{slot.end_time.strftime('%I:%M %p').lstrip('0')}"
                        ),
                    })
            ctx = build_shift_email_context(
                shift,
                user=shift.created_by,
                role=shift.created_by.role.lower(),
                extra={
                    "rejector_name": user.get_full_name() or user.email,
                    "rejected_slots": rejected_slots,
                }
            )
            ctx["escalation_message"] = (
                f"{user.get_full_name() or user.email} has declined "
                f"{len(created_rejections)} slot(s) on this shift."
                "\n\nIf you need to reach a wider audience, you can escalate the shift to the platform with a single click—"
                "making it visible to the entire ChemistTasker community. This can help you find the right fit, faster."
            )

            notification_payload = {
                "title": f"Shift declined: {shift.pharmacy.name}",
                "body": f"{user.get_full_name() or user.email} declined {len(created_rejections)} slot(s).",
                "user_ids": [shift.created_by_id],
                "payload": {
                    "shift_id": shift.id,
                    "rejection_ids": [rejection.id for rejection in created_rejections],
                    "slot_ids": [rejection.slot_id for rejection in created_rejections if rejection.slot_id],
                },
            }
            if ctx.get("shift_link"):
                notification_payload["action_url"] = ctx["shift_link"]

            async_task(
                'users.tasks.send_async_email',
                subject=f"Shift Update: {user.get_full_name() or user.email} has declined your shift",
                recipient_list=[shift.created_by.email],
                template_name="emails/shift_rejected.html",
                context=ctx,
                text_template="emails/shift_rejected.txt",
                notification=notification_payload
            )

        return Response(serializer.data, status=status.HTTP_201_CREATED if created_rejections else status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='generate-share-link')
    def generate_share_link(self, request, pk=None):
        shift = self.get_object()

        # ✅ SECURITY: Only allow sharing if shift is public
        if shift.visibility != 'PLATFORM':
            return Response(
                {'detail': 'You must escalate this shift to platform level before it can be shared.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        shift.share_token = uuid.uuid4()
        shift.save(update_fields=['share_token'])

        return Response({'share_token': str(shift.share_token)})

    @action(detail=True, methods=['post'], url_path='manual-assign')
    def manual_assign(self, request, pk=None):
        """
        Owner/Admin directly assigns staff to slots based on calendar selection.
        Accepts a list of slot/date combinations.
        """
        shift = self.get_object()
        user_id = request.data.get('user_id')
        assignments = request.data.get('assignments', [])  # Expect list of {slot_id, slot_date}

        self.check_permissions(request)
        self.check_object_permissions(request, shift.pharmacy)

        if not user_id or not isinstance(assignments, list):
            return Response({"detail": "user_id and assignments list are required."}, status=400)

        candidate = get_object_or_404(User, pk=user_id)
        membership = Membership.objects.filter(user=candidate, pharmacy=shift.pharmacy).first()

        if not membership or membership.employment_type not in ['FULL_TIME', 'PART_TIME', 'CASUAL']:
            return Response({
                "detail": (
                    "Only direct full-time, part-time or casual pharmacy staff can be rostered here. "
                    "Locum, Shift Hero and external workers must accept a shift offer."
                )
            }, status=400)

        assignment_ids = []

        for entry in assignments:
            slot_id = entry.get('slot_id')
            slot_date = entry.get('slot_date')
            # Remove checks for start_time/end_time

            if not slot_id or not slot_date:
                continue  # Skip invalid

            slot = get_object_or_404(shift.slots, pk=slot_id)

            try:
                assignment_defaults = staff_assignment_defaults(
                    user=candidate,
                    pharmacy=shift.pharmacy,
                    work_date=slot_date,
                )
            except DjangoValidationError as exc:
                return Response(
                    getattr(exc, "message_dict", {"detail": exc.messages}),
                    status=status.HTTP_400_BAD_REQUEST,
                )
            assn, _ = ShiftSlotAssignment.objects.update_or_create(
                slot=slot,
                slot_date=slot_date,
                defaults={
                    "shift": shift,
                    "user": candidate,
                    "unit_rate": Decimal('0.00'),
                    "rate_reason": {"source": "Rostered manual assign"},
                    "is_rostered": True,
                    **assignment_defaults,
                }
            )
            assignment_ids.append(assn.id)

        if assignment_ids:
            notify_shift_users(
                [candidate],
                shift=shift,
                title="Shift assigned",
                body=f"You have been assigned {len(assignment_ids)} slot(s) at {shift.pharmacy.name}.",
                kind="shift_assigned",
                payload={
                    "assignment_ids": assignment_ids,
                },
            )

        return Response({
            "detail": f"{len(assignment_ids)} slot(s) rostered for {candidate.get_full_name()}",
            "assignment_ids": assignment_ids
        }, status=200)

class CommunityShiftViewSet(BaseShiftViewSet):
    """Community‐level shifts, only for users who are active members of that pharmacy."""
    def get_queryset(self):
        user = self.request.user
        # _dbg(f"get_queryset: user_id={getattr(user,'id',None)} email={getattr(user,'email',None)} top_role={getattr(user,'role',None)}")

        qs = super().get_queryset().filter(
            Q(visibility__in=COMMUNITY_LEVELS) |
            Q(visibility=PUBLIC_LEVEL, post_anonymously=False)
        ).annotate(
            slot_count=Count('slots', distinct=True)
        ).filter(
            Q(employment_type__in=['FULL_TIME', 'PART_TIME'], slot_count=0) |
            Q(slots__date__gte=date.today())
        )
        # Scope by pharmacy when requested
        pharmacy_id = self.request.query_params.get('pharmacy')
        if pharmacy_id:
            qs = qs.filter(pharmacy_id=pharmacy_id)

        # Optional date range filters
        start_date_str = self.request.query_params.get('start_date')
        end_date_str = self.request.query_params.get('end_date')
        if start_date_str:
            try:
                start_date = date.fromisoformat(start_date_str)
                qs = qs.filter(
                    Q(employment_type__in=['FULL_TIME', 'PART_TIME'], slot_count=0) |
                    Q(slots__date__gte=start_date)
                )
            except ValueError:
                pass
        if end_date_str:
            try:
                end_date = date.fromisoformat(end_date_str)
                qs = qs.filter(
                    Q(employment_type__in=['FULL_TIME', 'PART_TIME'], slot_count=0) |
                    Q(slots__date__lte=end_date)
                )
            except ValueError:
                pass

        # NEW: Filter by 'unassigned' query parameter
        unassigned_param = self.request.query_params.get('unassigned')
        if unassigned_param and unassigned_param.lower() == 'true':
            qs = qs.annotate(assigned_slot_count=Count('slots__assignments', distinct=True)).filter(assigned_slot_count=0)

        # Q filters for all escalation levels:
        eligible_q = (
            # 1. Full/part time at this pharmacy
            Q(
                visibility='FULL_PART_TIME',
                pharmacy__memberships__user=user,
                pharmacy__memberships__employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
                pharmacy__memberships__is_active=True,
            )
            |
            # 2. Any active member at this pharmacy (for locum_casual)
            Q(
                visibility='LOCUM_CASUAL',
                pharmacy__memberships__user=user,
                pharmacy__memberships__employment_type__in=FAVORITE_STAFF_EMPLOYMENT_TYPES,
                pharmacy__memberships__is_active=True,
            )
            |
            Q(
                visibility='LOCUM_CASUAL',
                post_anonymously=False,
                pharmacy__memberships__user=user,
                pharmacy__memberships__employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
                pharmacy__memberships__is_active=True,
            )
            |
            Q(
                visibility=PUBLIC_LEVEL,
                post_anonymously=False,
                pharmacy__memberships__user=user,
                pharmacy__memberships__employment_type__in=(
                    PHARMACY_STAFF_EMPLOYMENT_TYPES + FAVORITE_STAFF_EMPLOYMENT_TYPES
                ),
                pharmacy__memberships__is_active=True,
            )
            |
            # 3. Any active member at any pharmacy with the same owner as the shift’s pharmacy
            Q(
                visibility='OWNER_CHAIN',
                pharmacy__owner__in=Pharmacy.objects.filter(
                    memberships__user=user,
                    memberships__is_active=True,
                    memberships__employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
                ).values_list('owner', flat=True)
            )
            |
            # 4. Any active member at any pharmacy in the same organization as the shift’s pharmacy
            Q(
                visibility='ORG_CHAIN',
                pharmacy__organization__in=Pharmacy.objects.filter(
                    memberships__user=user,
                    memberships__is_active=True,
                    memberships__employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
                ).values_list('organization', flat=True)
            )
        )

        qs = qs.filter(eligible_q).distinct()

        qs = qs.filter(role_needed__in=_shift_roles_visible_to_user(user))

        params = self.request.query_params
        search = params.get('search')
        roles = params.getlist('roles') or params.getlist('role')
        employment_types = params.getlist('employment_types') or params.getlist('employment_type')
        cities = params.getlist('city')
        states = params.getlist('state')
        min_rate = params.get('min_rate')
        only_urgent = params.get('only_urgent') == 'true'
        negotiable_only = params.get('negotiable_only') == 'true'
        flexible_only = params.get('flexible_only') == 'true'
        travel_provided = params.get('travel_provided') == 'true'
        accommodation_provided = params.get('accommodation_provided') == 'true'
        bulk_shifts_only = params.get('bulk_shifts_only') == 'true'
        time_of_day = params.getlist('time_of_day')

        if search:
            qs = qs.filter(
                Q(pharmacy__name__icontains=search) |
                Q(pharmacy__suburb__icontains=search) |
                Q(pharmacy__street_address__icontains=search) |
                Q(role_needed__icontains=search)
            )
        if roles:
            qs = qs.filter(role_needed__in=roles)
        if employment_types:
            qs = qs.filter(employment_type__in=employment_types)
        if cities:
            qs = qs.filter(pharmacy__suburb__in=cities)
        if states:
            qs = qs.filter(pharmacy__state__in=states)
        if only_urgent:
            qs = qs.filter(is_urgent=True)
        if negotiable_only:
            qs = qs.filter(rate_type='FLEXIBLE')
        if flexible_only:
            qs = qs.filter(flexible_timing=True)
        if travel_provided:
            qs = qs.filter(has_travel=True)
        if accommodation_provided:
            qs = qs.filter(has_accommodation=True)
        if bulk_shifts_only:
            qs = qs.annotate(slot_count=Count('slots', distinct=True)).filter(slot_count__gte=5)
        if min_rate:
            try:
                min_rate_val = float(min_rate)
                qs = qs.filter(
                    Q(fixed_rate__gte=min_rate_val) |
                    Q(slots__rate__gte=min_rate_val) |
                    Q(min_hourly_rate__gte=min_rate_val) |
                    Q(max_hourly_rate__gte=min_rate_val) |
                    Q(min_annual_salary__gte=min_rate_val) |
                    Q(max_annual_salary__gte=min_rate_val)
                )
            except ValueError:
                pass
        if time_of_day:
            time_q = Q()
            for tod in time_of_day:
                if tod == 'morning':
                    time_q |= Q(slots__start_time__lt='12:00')
                elif tod == 'afternoon':
                    time_q |= Q(slots__start_time__gte='12:00', slots__start_time__lt='17:00')
                elif tod == 'evening':
                    time_q |= Q(slots__start_time__gte='17:00')
            if time_q:
                qs = qs.filter(Q(slot_count=0) | time_q)

        return qs.distinct()

    @action(detail=True, methods=['post'], url_path='claim-shift')
    def claim_shift(self, request, pk=None):
        """
        Allows a worker to claim an open, unassigned community shift.
        Deep debug version for permission tracing.
        """

        try:
            shift = self.get_object()
        except Exception as e:
            import traceback
            return Response({"detail": f"get_object() failed: {e}"}, status=status.HTTP_403_FORBIDDEN)


        user = request.user
        slot_id = request.data.get('slot_id')


        # --- 1. Visibility check ---
        is_eligible = self.get_queryset().filter(pk=shift.pk).exists()
        if not is_eligible:
            return Response(
                {"detail": "You do not have permission to perform this action. [DBG:NOT_ELIGIBLE_VIS]"},
                status=status.HTTP_403_FORBIDDEN
            )

        # --- 2. Membership verification ---
        all_memberships = list(
            Membership.objects.filter(user=user, is_active=True)
            .values('pharmacy_id', 'role', 'employment_type', 'is_active')
        )

        is_member_of_pharmacy = Membership.objects.filter(
            user=user,
            pharmacy=shift.pharmacy,
            is_active=True
        ).exists()

        if not is_member_of_pharmacy:
            return Response(
                {"detail": "You must be an active member of this pharmacy to claim this shift. [DBG:NOT_MEMBER]"},
                status=status.HTTP_403_FORBIDDEN
            )

        membership = Membership.objects.filter(
            user=user, pharmacy=shift.pharmacy, is_active=True
        ).first()
        # --- 3. Tier eligibility check ---
        allowed_ftpt = {'FULL_TIME', 'PART_TIME', 'CASUAL'}
        allowed_locum = {'LOCUM', 'SHIFT_HERO'}

        if membership and membership.employment_type in allowed_locum:
            return Response(
                {
                    "detail": (
                        "Locum and Shift Hero workers must express interest and accept the final shift offer "
                        "so ABN/TFN engagement terms are recorded before assignment."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if shift.visibility == 'FULL_PART_TIME':
            ok = membership and membership.employment_type in allowed_ftpt
            if not ok:
                return Response(
                    {"detail": f"Only full/part-time/casual pharmacy members can claim this shift. [DBG:TIER_MISMATCH emp={getattr(membership,'employment_type',None)}]"},
                    status=status.HTTP_403_FORBIDDEN
                )
        elif shift.visibility == 'LOCUM_CASUAL':
            allowed_for_shift = allowed_locum
            if not getattr(shift, "post_anonymously", False):
                allowed_for_shift = allowed_locum | allowed_ftpt
            ok = membership and membership.employment_type in allowed_for_shift
            if not ok:
                return Response(
                    {"detail": f"Only eligible pharmacy members can claim this shift. [DBG:TIER_MISMATCH emp={getattr(membership,'employment_type',None)}]"},
                    status=status.HTTP_403_FORBIDDEN
                )

        # --- 4. Role match check ---
        user_role = getattr(user, 'role', None)
        onboarding_role = None
        # print(f"[CLAIM_DBG] Step 4 - user.top_role={user_role}")

        if user_role == 'OTHER_STAFF':
            try:
                onboarding = OtherStaffOnboarding.objects.get(user=user)
                onboarding_role = onboarding.role_type
            except OtherStaffOnboarding.DoesNotExist:
                return Response(
                    {"detail": "Cannot determine your specific role. Please complete your onboarding. [DBG:NO_OTHERSTAFF_ONBOARDING]"},
                    status=status.HTTP_403_FORBIDDEN
                )

        effective_user_role = _normalized_role_code(onboarding_role or user_role)
        if not _user_can_perform_shift_role(user, shift.role_needed):
            return Response(
                {"detail": f"This shift requires a {shift.role_needed}, but your role is {effective_user_role}. [DBG:ROLE_MISMATCH]"},
                status=status.HTTP_403_FORBIDDEN
            )

        # --- 5. Check if shift already taken ---
        any_assigned = ShiftSlotAssignment.objects.filter(shift=shift).exists()
        if any_assigned:
            return Response({"detail": "This shift is no longer available."}, status=status.HTTP_400_BAD_REQUEST)

        # --- 6. Slot selection ---
        if shift.single_user_only:
            slots_to_claim = list(shift.slots.all())
        elif slot_id:
            slot = get_object_or_404(ShiftSlot, pk=slot_id, shift=shift)
            slots_to_claim = [slot]
        else:
            slots_to_claim = list(shift.slots.all())

        if not slots_to_claim:
            return Response({"detail": "No valid slots found to claim for this shift."}, status=status.HTTP_400_BAD_REQUEST)

        # --- 7. Create assignments ---
        assignment_ids = []
        with transaction.atomic():
            for slot in slots_to_claim:
                taken = ShiftSlotAssignment.objects.filter(slot=slot, slot_date=slot.date).exists()
                if taken:
                    continue

                rate, reason = get_locked_rate_for_slot(shift=shift, slot=slot, user=user, override_date=slot.date)

                assignment = ShiftSlotAssignment.objects.create(
                    shift=shift,
                    slot=slot,
                    slot_date=slot.date,
                    user=user,
                    unit_rate=rate,
                    rate_reason=reason,
                    is_rostered=True
                )
                assignment_ids.append(assignment.id)

        # --- 8. Cleanup and notification ---
        ShiftInterest.objects.filter(shift=shift, user=user).delete()
        ShiftRejection.objects.filter(shift=shift, user=user).delete()

        if shift.created_by and shift.created_by.email:
            try:
                ctx = build_shift_email_context(
                    shift,
                    user=shift.created_by,
                    extra={"claimer_name": user.get_full_name() or user.email,
                        "shift_date": slots_to_claim[0].date}
                )
                async_task(
                    'users.tasks.send_async_email',
                    subject=f"Your shift at {shift.pharmacy.name} was claimed",
                    recipient_list=[shift.created_by.email],
                    template_name="emails/shift_claimed.html",
                    context=ctx,
                    text_template="emails/shift_claimed.txt",
                    notification={
                        "title": f"Shift claimed: {shift.pharmacy.name}",
                        "body": f"{user.get_full_name() or user.email} claimed your shift on {slots_to_claim[0].date}",
                        "payload": {"shift_id": shift.id},
                        "user_ids": [getattr(shift.created_by, 'id', None)],
                        "action_url": build_roster_email_link(shift.created_by, shift.pharmacy),
                    },
                )
                # print("[CLAIM_DBG] Step 8 - Notification queued")
            except Exception as e:
                # print(f"[CLAIM_DBG] Step 8 - Notification error={e}")
                pass


        return Response({
            "detail": "Shift claimed successfully.",
            "assignment_ids": assignment_ids
        }, status=status.HTTP_201_CREATED)

class PublicShiftViewSet(BaseShiftViewSet):
    """Platform‐public shifts, filtered by the user’s exact clinical role."""
    def get_queryset(self):
        now = timezone.now()
        today = date.today()
        qs = super().get_queryset().filter(
            visibility=PUBLIC_LEVEL
        ).annotate(
            slot_count=Count('slots', distinct=True)
        ).filter(
            Q(employment_type__in=['FULL_TIME', 'PART_TIME'], slot_count=0) |
            Q(slots__date__gte=date.today())
        ).filter(
            Q(employment_type__in=['FULL_TIME', 'PART_TIME'], slot_count=0) |
            Q(slots__date__gt=today) |
            Q(slots__date=today, slots__end_time__gt=now.time())
        )

        user = self.request.user
        qs = qs.filter(role_needed__in=_shift_roles_visible_to_user(user))

        # --- Filters from query params ---
        params = self.request.query_params
        search = params.get('search')
        roles = params.getlist('roles') or params.getlist('role')
        employment_types = params.getlist('employment_types') or params.getlist('employment_type')
        cities = params.getlist('city')
        states = params.getlist('state')
        min_rate = params.get('min_rate')
        only_urgent = params.get('only_urgent') == 'true'
        negotiable_only = params.get('negotiable_only') == 'true'
        flexible_only = params.get('flexible_only') == 'true'
        travel_provided = params.get('travel_provided') == 'true'
        accommodation_provided = params.get('accommodation_provided') == 'true'
        bulk_shifts_only = params.get('bulk_shifts_only') == 'true'
        time_of_day = params.getlist('time_of_day')
        start_date_param = params.get('start_date')
        end_date_param = params.get('end_date')

        if search:
            qs = qs.filter(
                Q(pharmacy__name__icontains=search) |
                Q(pharmacy__suburb__icontains=search) |
                Q(pharmacy__street_address__icontains=search) |
                Q(role_needed__icontains=search)
            )
        if roles:
            qs = qs.filter(role_needed__in=roles)
        if employment_types:
            qs = qs.filter(employment_type__in=employment_types)
        if cities:
            qs = qs.filter(pharmacy__suburb__in=cities)
        if states:
            qs = qs.filter(pharmacy__state__in=states)
        if only_urgent:
            qs = qs.filter(is_urgent=True)
        if negotiable_only:
            qs = qs.filter(rate_type='FLEXIBLE')
        if flexible_only:
            qs = qs.filter(flexible_timing=True)
        if travel_provided:
            qs = qs.filter(has_travel=True)
        if accommodation_provided:
            qs = qs.filter(has_accommodation=True)
        if bulk_shifts_only:
            qs = qs.annotate(slot_count=Count('slots', distinct=True)).filter(slot_count__gte=5)
        if min_rate:
            try:
                min_rate_val = float(min_rate)
                qs = qs.filter(
                    Q(fixed_rate__gte=min_rate_val) |
                    Q(slots__rate__gte=min_rate_val) |
                    Q(min_hourly_rate__gte=min_rate_val) |
                    Q(max_hourly_rate__gte=min_rate_val) |
                    Q(min_annual_salary__gte=min_rate_val) |
                    Q(max_annual_salary__gte=min_rate_val)
                )
            except ValueError:
                pass
        if time_of_day:
            time_q = Q()
            for tod in time_of_day:
                if tod == 'morning':
                    time_q |= Q(slots__start_time__lt='12:00')
                elif tod == 'afternoon':
                    time_q |= Q(slots__start_time__gte='12:00', slots__start_time__lt='17:00')
                elif tod == 'evening':
                    time_q |= Q(slots__start_time__gte='17:00')
            if time_q:
                qs = qs.filter(Q(slot_count=0) | time_q)
        if start_date_param or end_date_param:
            try:
                start_d = date.fromisoformat(start_date_param) if start_date_param else date(1970, 1, 1)
                end_d = date.fromisoformat(end_date_param) if end_date_param else date(2100, 1, 1)
                qs = qs.filter(
                    Q(slot_count=0) |
                    Q(slots__date__range=(start_d, end_d))
                )
            except ValueError:
                pass

        return qs.distinct()


def _future_or_current_slot_q(now, today):
    return (
        Q(is_recurring=True, recurring_end_date__gte=today) |
        Q(date__gt=today) |
        Q(date=today, end_time__gte=now.time())
    )


def _past_slot_q(now, today):
    return (
        Q(is_recurring=True, recurring_end_date__lt=today) |
        Q(date__lt=today) |
        Q(date=today, end_time__lt=now.time())
    )


def _matching_shift_slot_exists(*, now, today, assigned_user_id=None, state='active'):
    slots = ShiftSlot.objects.filter(shift_id=OuterRef('pk'))
    slot_assignments = ShiftSlotAssignment.objects.filter(
        shift_id=OuterRef('shift_id'),
        slot_id=OuterRef('pk'),
    )
    if assigned_user_id is not None:
        slot_assignments = slot_assignments.filter(user_id=assigned_user_id)

    pending_payment = ShiftOffer.objects.filter(
        shift_id=OuterRef('shift_id'),
        slot_id=OuterRef('pk'),
        status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
    )

    slots = slots.annotate(
        has_assignment=Exists(slot_assignments),
        has_pending_payment=Exists(pending_payment),
    )

    if state == 'active':
        slots = slots.filter(_future_or_current_slot_q(now, today)).filter(
            Q(has_assignment=False) | Q(has_pending_payment=True)
        )
    elif state == 'confirmed':
        slots = slots.filter(_future_or_current_slot_q(now, today)).filter(
            has_assignment=True,
            has_pending_payment=False,
        )
    # elif state == 'history':
    #     slots = slots.filter(_past_slot_q(now, today)).filter(
    #         has_assignment=True,
    #         has_pending_payment=False,
    #     )

# this part will be removed later
    elif state == 'history':
        slots = slots.filter(
            has_assignment=True,
            has_pending_payment=False,
        )


    else:
        raise ValueError(f"Unsupported slot lifecycle state: {state}")

    return Exists(slots)


def _shift_has_past_slot_exists(*, now, today):
    slots = ShiftSlot.objects.filter(shift_id=OuterRef('pk')).filter(_past_slot_q(now, today))
    return Exists(slots)


def _slot_locked_for_shift_offer(*, shift, slot, slot_date=None, ignore_user=None):
    if not slot:
        return False
    target_date = slot_date or getattr(slot, "date", None)
    assignment_qs = ShiftSlotAssignment.objects.filter(shift=shift, slot=slot)
    if target_date:
        assignment_qs = assignment_qs.filter(slot_date=target_date)
    if assignment_qs.exists():
        return True
    pending_qs = ShiftOffer.objects.filter(
        shift=shift,
        slot=slot,
        status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
    )
    if ignore_user is not None:
        ignore_user_id = getattr(ignore_user, "id", ignore_user)
        pending_qs = pending_qs.exclude(user_id=ignore_user_id)
    if target_date:
        pending_qs = pending_qs.filter(
            Q(offered_slot_date=target_date) | Q(offered_slot_date__isnull=True)
        )
    return pending_qs.exists()


class ActiveShiftViewSet(BaseShiftViewSet):
    """Upcoming & unassigned shifts (no slot has an assignment)."""
    @staticmethod
    def _has_open_active_occurrence(shift, *, now, today):
        if shift.employment_type in ['FULL_TIME', 'PART_TIME'] and not shift.slots.exists():
            return True

        assigned_pairs = {
            (assignment.slot_id, assignment.slot_date)
            for assignment in shift.slot_assignments.all()
        }
        pending_pairs = {
            (offer.slot_id, offer.offered_slot_date)
            for offer in shift.offers.filter(
                status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
                slot_id__isnull=False,
            )
        }

        try:
            entries = expand_shift_slots(shift)
        except Exception:
            entries = []

        for entry in entries:
            slot = entry.get("slot")
            slot_date = entry.get("date")
            if not slot or not slot_date:
                continue
            if slot_date < today:
                continue
            if slot_date == today and slot.end_time < now.time():
                continue
            key = (slot.id, slot_date)
            if key in assigned_pairs:
                continue
            return True

        return bool(pending_pairs)

    def get_queryset(self):
        user = self.request.user
        now  = timezone.now()
        today = date.today()

        qs = super().get_queryset()

        qs = qs.filter(
            Q(created_by=user) | Q(pharmacy__in=self._managed_pharmacies(user))
        )

        qs = qs.annotate(
            slot_count=Count('slots', distinct=True),
            has_active_slot=(
                _matching_shift_slot_exists(now=now, today=today, state='active')
            ),
        ).filter(
            Q(employment_type__in=['FULL_TIME', 'PART_TIME'], slot_count=0) |
            Q(slots__is_recurring=True, slots__recurring_end_date__gte=today) |
            Q(has_active_slot=True)
        )

        qs = qs.distinct().prefetch_related('slots', 'slot_assignments', 'offers')
        open_ids = [
            shift.id
            for shift in qs
            if self._has_open_active_occurrence(shift, now=now, today=today)
        ]
        qs = Shift.objects.filter(id__in=open_ids).prefetch_related('slots', 'slot_assignments', 'offers')
        try:
            ids = list(qs.values_list('id', flat=True))
            # print(
            #     f"[ActiveShiftViewSet:get_queryset] user_id={getattr(user, 'id', None)} "
            #     f"role={getattr(user, 'role', None)} total={len(ids)} ids={ids}"
            # )
        except Exception:
            pass
        return qs

    @action(detail=True, methods=['get'])
    def member_status(self, request, pk=None):
        shift = self.get_object()
        return self._build_member_status_response(request, shift)

        # Check if the shift is public-level; if so, this endpoint is not applicable.
        # This check remains as it was.
        if shift.visibility == PUBLIC_LEVEL:
            return Response({'detail': 'Member status is not applicable for Public shifts via this endpoint. Please query /shift-interests directly for public interests.'}, status=status.HTTP_400_BAD_REQUEST)

        # Retrieve the visibility parameter from the request query params.
        # This is the key change: use the requested visibility for filtering.
        requested_visibility = request.query_params.get('visibility')

        # Fallback if requested_visibility is unexpectedly None, though the frontend should always provide it.
        # In this case, we would use the shift's current visibility from the DB.
        if not requested_visibility:
            requested_visibility = shift.visibility


        slot_id_param = request.query_params.get('slot_id')
        slot_date = request.query_params.get('slot_date')

        slot_obj = None
        if slot_id_param:
            slot_obj = get_object_or_404(ShiftSlot, pk=slot_id_param, shift=shift)
        elif not shift.single_user_only:
            # For multi-slot shifts that are not single-user-only, a slot_id is required for specific status.
            return Response({'detail': 'slot_id is required for multi-slot shifts via this endpoint.'}, status=status.HTTP_400_BAD_REQUEST)

        interests_query = ShiftInterest.objects.filter(shift=shift)
        rejections_query = ShiftRejection.objects.filter(shift=shift)

        if shift.single_user_only:
            interests_query = interests_query.filter(slot__isnull=True)
            rejections_query = rejections_query.filter(slot__isnull=True)
        else: # Multi-slot (non-single_user_only)
            interests_query = interests_query.filter(slot=slot_obj)
            rejections_query = rejections_query.filter(slot=slot_obj)
            if slot_obj and slot_obj.is_recurring and slot_date:
                rejections_query = rejections_query.filter(slot_date=slot_date)

        interested_user_ids = {i.user_id for i in interests_query}
        rejected_user_ids = {r.user_id for r in rejections_query}

        memberships_qs = Membership.objects.filter(
            is_active=True,
            role=shift.role_needed
        ).select_related('user')

        # Apply filtering based on the 'requested_visibility' from the query parameter
        if requested_visibility == 'FULL_PART_TIME':
            memberships_qs = memberships_qs.filter(
                pharmacy=shift.pharmacy,
                employment_type__in=['FULL_TIME', 'PART_TIME', 'CASUAL'],
            )
        elif requested_visibility == 'LOCUM_CASUAL':
            memberships_qs = memberships_qs.filter(
                pharmacy=shift.pharmacy,
                employment_type__in=['LOCUM', 'SHIFT_HERO'],

            )
        elif requested_visibility == 'OWNER_CHAIN':
            owner_pharmacies = Pharmacy.objects.filter(owner=shift.pharmacy.owner)
            memberships_qs = memberships_qs.filter(
                pharmacy__in=owner_pharmacies
            )
        elif requested_visibility == 'ORG_CHAIN':
            org_pharmacies = Pharmacy.objects.filter(organization=shift.pharmacy.organization)
            memberships_qs = memberships_qs.filter(
                pharmacy__in=org_pharmacies
            )
        else:
            # This 'else' branch handles cases where the requested_visibility
            # doesn't match a specific membership filter (e.g., 'PLATFORM'
            # which is handled by the early return, or an unexpected value).
            # If no explicit membership type is needed for this visibility,
            # it might return an empty queryset or a default set based on your business logic.
            memberships_qs = Membership.objects.none() # Default to empty if no specific rule applies

        data = []
        for membership in memberships_qs.distinct():
            user = membership.user
            member_interaction_status = 'no_response'

            display_name = membership.invited_name if membership.invited_name else user.get_full_name()

            is_assigned = False
            if shift.single_user_only:
                is_assigned = ShiftSlotAssignment.objects.filter(
                    user=user,
                    shift=shift
                ).exists()
            else:
                is_assigned = ShiftSlotAssignment.objects.filter(
                    user=user,
                    slot=slot_obj,
                    **({'slot_date': slot_date} if slot_obj and slot_obj.is_recurring and slot_date else {})
                ).exists()

            if is_assigned:
                member_interaction_status = 'accepted'
            elif user.id in interested_user_ids:
                # ✅ CHANGE THIS:
                member_interaction_status = 'interested'
            elif user.id in rejected_user_ids:
                # ✅ CHANGE THIS:
                member_interaction_status = 'rejected'

            data.append({
                'user_id': user.id,
                'name': display_name,
                'employment_type': membership.employment_type,
                'role': membership.role,
                'status': member_interaction_status,
                'is_member': True
            })

        return Response(data)

class ConfirmedShiftViewSet(BaseShiftViewSet):
    """Upcoming & in-progress shifts with at least one confirmed slot."""
    def get_queryset(self):
        user  = self.request.user
        now   = timezone.now()
        today = date.today()

        qs = super().get_queryset()

        qs = qs.filter(
            Q(created_by=user) | Q(pharmacy__in=self._managed_pharmacies(user))
        )
        qs = qs.annotate(
            has_confirmed_slot=_matching_shift_slot_exists(
                now=now,
                today=today,
                state='confirmed',
            )
        ).filter(has_confirmed_slot=True)

        return qs

    # Move this entire method OUTSIDE of get_queryset
    @action(detail=True, methods=['post'], url_path='view_assigned_profile')
    def view_assigned_profile(self, request, pk=None):
        shift = self.get_object()
        user_id = request.data.get('user_id')
        if user_id is None:
            return Response({'detail': 'user_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        candidate = get_object_or_404(User, pk=user_id)
        slot_id = request.data.get('slot_id')
        slot = get_object_or_404(ShiftSlot, pk=slot_id, shift=shift) if slot_id is not None else None

        # Verify the user is actually assigned to this shift/slot
        if shift.single_user_only:
            if not ShiftSlotAssignment.objects.filter(shift=shift, user=candidate).exists():
                return Response({'detail': 'User is not assigned to this shift.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            if slot_id is None:
                # If slot_id is not provided for a multi-slot shift, check if assigned to any slot of this shift
                if not ShiftSlotAssignment.objects.filter(shift=shift, user=candidate).exists():
                    return Response({'detail': 'User is not assigned to any slot in this shift.'}, status=status.HTTP_404_NOT_FOUND)
            else:
                if not ShiftSlotAssignment.objects.filter(shift=shift, slot_id=slot_id, user=candidate).exists():
                    return Response({'detail': 'User is not assigned to this specific slot.'}, status=status.HTTP_404_NOT_FOUND)

        _log_shift_profile_access(
            request=request,
            shift=shift,
            candidate=candidate,
            action=ShiftProfileAccessAudit.Action.VIEW_ASSIGNED_PROFILE,
            slot=slot,
        )

        # Retrieve profile data without sending an email
        profile_data = {}
        try:
            po = PharmacistOnboarding.objects.get(user=candidate)
            profile_data = {
                'phone_number': candidate.mobile_number, 
                'short_bio': po.short_bio,
                'resume': request.build_absolute_uri(po.resume.url) if po.resume else None,
                'rate_preference': po.rate_preference or None,
            }
        except PharmacistOnboarding.DoesNotExist:
            try:
                os = OtherStaffOnboarding.objects.get(user=candidate)
                profile_data = {
                    'phone_number': candidate.mobile_number,
                    'short_bio': os.short_bio,
                    'resume': request.build_absolute_uri(os.resume.url) if os.resume else None,
                }
            except OtherStaffOnboarding.DoesNotExist:
                # Handle cases where user might not have a full onboarding profile yet
                profile_data = {
                    'phone_number': None,
                    'short_bio': None,
                    'resume': None,
                    'rate_preference': None,
                }


        return Response({
            'id': candidate.id,
            'first_name': candidate.first_name,
            'last_name': candidate.last_name,
            'email': candidate.email,
            **profile_data
        })

class HistoryShiftViewSet(BaseShiftViewSet):
    """History shifts for managed pharmacies."""
    def get_queryset(self):
        user = self.request.user
        now  = timezone.now()
        today = date.today()

        qs = super().get_queryset()

        qs = qs.filter(
            Q(created_by=user) | Q(pharmacy__in=self._managed_pharmacies(user))
        )

        qs = qs.annotate(
            has_history_slot=_matching_shift_slot_exists(
                now=now,
                today=today,
                state='history',
            )
        ).filter(has_history_slot=True)

        return qs


    @action(detail=True, methods=['post'], url_path='view_assigned_profile')
    def view_assigned_profile(self, request, pk=None):
        shift = self.get_object()
        user_id = request.data.get('user_id')
        if user_id is None:
            return Response({'detail': 'user_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        candidate = get_object_or_404(User, pk=user_id)
        slot_id = request.data.get('slot_id')
        slot = get_object_or_404(ShiftSlot, pk=slot_id, shift=shift) if slot_id is not None else None

        # Verify the user is actually assigned to this shift/slot
        if shift.single_user_only:
            if not ShiftSlotAssignment.objects.filter(shift=shift, user=candidate).exists():
                return Response({'detail': 'User is not assigned to this shift.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            if slot_id is None:
                # If slot_id is not provided for a multi-slot shift, check if assigned to any slot of this shift
                if not ShiftSlotAssignment.objects.filter(shift=shift, user=candidate).exists():
                    return Response({'detail': 'User is not assigned to any slot in this shift.'}, status=status.HTTP_404_NOT_FOUND)
            else:
                if not ShiftSlotAssignment.objects.filter(shift=shift, slot_id=slot_id, user=candidate).exists():
                    return Response({'detail': 'User is not assigned to this specific slot.'}, status=status.HTTP_404_NOT_FOUND)

        _log_shift_profile_access(
            request=request,
            shift=shift,
            candidate=candidate,
            action=ShiftProfileAccessAudit.Action.VIEW_ASSIGNED_PROFILE,
            slot=slot,
        )

        # Retrieve profile data without sending an email or consuming reveal quota
        profile_data = {}
        try:
            po = PharmacistOnboarding.objects.get(user=candidate)
            profile_data = {
                'phone_number': candidate.mobile_number,
                'short_bio': po.short_bio,
                'resume': request.build_absolute_uri(po.resume.url) if po.resume else None,
                'rate_preference': po.rate_preference or None,
            }
        except PharmacistOnboarding.DoesNotExist:
            try:
                os = OtherStaffOnboarding.objects.get(user=candidate)
                profile_data = {
                    'phone_number': candidate.mobile_number,
                    'short_bio': os.short_bio,
                    'resume': request.build_absolute_uri(os.resume.url) if os.resume else None,
                }
            except OtherStaffOnboarding.DoesNotExist:
                profile_data = {
                    'phone_number': None,
                    'short_bio': None,
                    'resume': None,
                    'rate_preference': None,
                }

        return Response({
            'id': candidate.id,
            'first_name': candidate.first_name,
            'last_name': candidate.last_name,
            'email': candidate.email,
            **profile_data
        })

class ShiftInterestViewSet(viewsets.ModelViewSet):
    """
    Only return interests for the given `?shift=` (and optional `?slot=`),
    so that each shift’s page only shows its own interests.
    """
    serializer_class = ShiftInterestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = ShiftInterest.objects.select_related('shift', 'slot', 'user').annotate(
            average_rating=Avg('user__ratings_received_as_worker__stars')
        )

        shift_id = self.request.query_params.get('shift')
        if shift_id is not None:
            shift = get_object_or_404(Shift, pk=shift_id)
            if BaseShiftViewSet._user_can_manage_pharmacy(self.request.user, shift.pharmacy):
                qs = qs.filter(shift_id=shift_id)
            else:
                qs = qs.filter(shift_id=shift_id, user=self.request.user)
        else:
            qs = qs.filter(user=self.request.user)

        slot_param = self.request.query_params.get('slot')
        if slot_param == 'null':
            qs = qs.filter(slot__isnull=True)
        elif slot_param is not None:
            try:
                slot_id_int = int(slot_param)
                qs = qs.filter(slot_id=slot_id_int)
            except ValueError:
                raise Http400('Invalid slot ID provided. Must be an integer or "null".')

        user_id = self.request.query_params.get('user')
        if user_id is not None:
            if str(user_id) == str(self.request.user.id):
                qs = qs.filter(user_id=user_id)
            else:
                qs = qs.filter(user=self.request.user)

        return qs

    # Add a custom list method to ensure a 200 OK with content
    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK) # Ensure 200 OK

class ShiftRejectionViewSet(viewsets.ModelViewSet):
    queryset = ShiftRejection.objects.all()
    serializer_class = ShiftRejectionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = ShiftRejection.objects.select_related('shift', 'slot', 'user')

        shift_id = self.request.query_params.get('shift')
        if shift_id is not None:
            shift = get_object_or_404(Shift, pk=shift_id)
            if BaseShiftViewSet._user_can_manage_pharmacy(self.request.user, shift.pharmacy):
                qs = qs.filter(shift_id=shift_id)
            else:
                qs = qs.filter(shift_id=shift_id, user=self.request.user)
        else:
            qs = qs.filter(user=self.request.user)

        slot_param = self.request.query_params.get('slot')
        if slot_param == 'null':
            qs = qs.filter(slot__isnull=True)
        elif slot_param is not None:
            try:
                slot_id_int = int(slot_param)
                qs = qs.filter(slot_id=slot_id_int)
            except ValueError:
                raise Http400('Invalid slot ID provided. Must be an integer or "null".')

        user_id = self.request.query_params.get('user')
        if user_id is not None:
            if str(user_id) == str(self.request.user.id):
                qs = qs.filter(user_id=user_id)
            else:
                qs = qs.filter(user=self.request.user)

        return qs


class ShiftSavedViewSet(viewsets.ModelViewSet):
    serializer_class = ShiftSavedSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = ShiftSaved.objects.filter(user=self.request.user).select_related('shift')
        shift_id = self.request.query_params.get('shift')
        if shift_id is not None:
            qs = qs.filter(shift_id=shift_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ShiftOfferViewSet(viewsets.ModelViewSet):
    serializer_class = ShiftOfferSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = ShiftOffer.objects.select_related('shift', 'slot', 'user', 'shift__pharmacy')
        user = self.request.user
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)

        if getattr(user, "role", None) in ["PHARMACIST", "OTHER_STAFF", "EXPLORER"]:
            return qs.filter(user=user)

        managed = BaseShiftViewSet._managed_pharmacies(user)
        return qs.filter(shift__pharmacy__in=managed)

    def list(self, request, *args, **kwargs):
        now = timezone.now()
        ShiftOffer.objects.filter(status=ShiftOffer.Status.PENDING, expires_at__lt=now).update(
            status=ShiftOffer.Status.EXPIRED,
            updated_at=now,
        )
        return super().list(request, *args, **kwargs)

    def _resolve_owner_recipient(self, shift):
        pharmacy_owner = getattr(getattr(shift, "pharmacy", None), "owner", None)
        owner_user = getattr(pharmacy_owner, "user", None) if pharmacy_owner else None
        if owner_user and getattr(owner_user, "email", None):
            return owner_user
        creator = getattr(shift, "created_by", None)
        if creator and getattr(creator, "email", None):
            return creator
        return None

    def _first_offer_date(self, shift, offer):
        offered_date = getattr(offer, "offered_slot_date", None)
        if offered_date:
            return offered_date
        try:
            entries = expand_shift_slots(shift)
        except Exception:
            entries = []
        if getattr(offer, "slot_id", None):
            entries = [e for e in entries if e.get("slot") and e["slot"].id == offer.slot_id]
        if entries:
            return entries[0].get("date")
        if offer.slot and getattr(offer.slot, "date", None):
            return offer.slot.date
        return None

    def _format_rate_label(self, shift, *, assignment_rates=None, offer=None):
        assignment_rates = [Decimal(str(r)) for r in (assignment_rates or []) if r is not None]
        if assignment_rates:
            minimum = min(assignment_rates)
            maximum = max(assignment_rates)
            if minimum == maximum:
                return f"${minimum:.2f}/hr"
            return f"${minimum:.2f}–${maximum:.2f}/hr"

        if offer and getattr(offer, "offered_rate", None) is not None:
            return f"${Decimal(str(offer.offered_rate)):.2f}/hr"

        if offer and getattr(offer, "slot", None) and getattr(offer.slot, "rate", None) is not None:
            return f"${Decimal(str(offer.slot.rate)):.2f}/hr"

        fixed_rate = getattr(shift, "fixed_rate", None)
        if fixed_rate is not None:
            return f"${Decimal(str(fixed_rate)):.2f}/hr"

        min_hourly = getattr(shift, "min_hourly_rate", None)
        max_hourly = getattr(shift, "max_hourly_rate", None)
        if min_hourly is not None or max_hourly is not None:
            if min_hourly is not None and max_hourly is not None:
                return f"${Decimal(str(min_hourly)):.2f}–${Decimal(str(max_hourly)):.2f}/hr"
            only = min_hourly if min_hourly is not None else max_hourly
            return f"${Decimal(str(only)):.2f}/hr"

        min_annual = getattr(shift, "min_annual_salary", None)
        max_annual = getattr(shift, "max_annual_salary", None)
        if min_annual is not None or max_annual is not None:
            if min_annual is not None and max_annual is not None:
                return f"${Decimal(str(min_annual)):.0f}–${Decimal(str(max_annual)):.0f} package"
            only = min_annual if min_annual is not None else max_annual
            return f"${Decimal(str(only)):.0f} package"

        return "N/A"

    @action(detail=True, methods=['post'])
    def buzz(self, request, pk=None):
        with transaction.atomic():
            offer = (
                ShiftOffer.objects
                .select_for_update(of=("self",))
                .select_related("shift__pharmacy", "user")
                .get(pk=pk)
            )
            shift = offer.shift
            if not BaseShiftViewSet._user_can_manage_pharmacy(request.user, shift.pharmacy):
                return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
            if offer.status != ShiftOffer.Status.PENDING:
                return Response({
                    'detail': 'This offer no longer needs a reminder.',
                    'offer_id': offer.id,
                    'status': offer.status,
                }, status=status.HTTP_400_BAD_REQUEST)

            now = timezone.now()
            if offer.last_buzzed_at:
                next_buzz_at = offer.last_buzzed_at + SHIFT_OFFER_BUZZ_COOLDOWN
                if next_buzz_at > now:
                    seconds_remaining = int((next_buzz_at - now).total_seconds())
                    minutes_remaining = max(1, (seconds_remaining + 59) // 60)
                    wait_label = (
                        "about 1 hour"
                        if minutes_remaining >= 60
                        else f"about {minutes_remaining} minute{'s' if minutes_remaining != 1 else ''}"
                    )
                    return Response({
                        'detail': f'A reminder was already sent recently. You can send another confirmation reminder in {wait_label}.',
                        'offer_id': offer.id,
                        'next_buzz_at': next_buzz_at.isoformat(),
                        'seconds_remaining': seconds_remaining,
                    }, status=status.HTTP_429_TOO_MANY_REQUESTS)

            offer.last_buzzed_at = now
            offer.save(update_fields=['last_buzzed_at', 'updated_at'])

        pharmacy_display = shift.pharmacy.name
        if getattr(shift, "post_anonymously", False):
            suburb = getattr(shift.pharmacy, "suburb", None)
            pharmacy_display = f"Shift in {suburb}" if suburb else "Anonymous Pharmacy"

        worker_name = offer.user.get_full_name() or offer.user.email
        ctx = build_shift_email_context(shift, user=offer.user, role=offer.user.role.lower())
        ctx["pharmacy_name"] = pharmacy_display
        ctx["offered_rate"] = offer.offered_rate
        ctx["expires_at"] = offer.expires_at
        offer_details = build_offer_shift_details(shift, offer)
        ctx.update(offer_details)
        ctx["shift_link"] = worker_offer_url(offer.user, shift, offer)

        notify_shift_users(
            [offer.user],
            shift=shift,
            title="Reminder: confirm your shift offer",
            body=f"{pharmacy_display} is waiting for you to confirm this shift offer. {offer_details['shift_summary']}",
            kind="shift_offer_buzz",
            payload={
                "offer_id": offer.id,
                "status": offer.status,
                "worker_confirmation_required": True,
                **offer_details,
            },
        )
        if offer.user and offer.user.email:
            async_task(
                'users.tasks.send_async_email',
                subject=f"Reminder: confirm your shift offer at {pharmacy_display}",
                recipient_list=[offer.user.email],
                template_name="emails/shift_offer_buzz.html",
                context=ctx,
                text_template="emails/shift_offer_buzz.txt",
                suppress_auto_notification=True,
            )

        return Response({
            'detail': f'Reminder sent to {worker_name}.',
            'offer_id': offer.id,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        from billing.utils import (
            BILLING_STATE_PAYMENT_REQUIRED,
            get_billing_state_for_pharmacy,
        )

        offer = self.get_object()
        if offer.user_id != request.user.id:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        if offer.status != ShiftOffer.Status.PENDING:
            return Response({'detail': 'Offer is not pending.'}, status=status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        if offer.expires_at and offer.expires_at <= now:
            offer.status = ShiftOffer.Status.EXPIRED
            offer.save(update_fields=['status', 'updated_at'])
            return Response({'detail': 'Offer has expired.'}, status=status.HTTP_400_BAD_REQUEST)

        shift = offer.shift
        slot_obj = offer.slot
        if not shift.single_user_only and slot_obj is None:
            return Response({'detail': 'Offer is missing slot selection.'}, status=status.HTTP_400_BAD_REQUEST)

        from client_profile.engagement_routing import (
            build_shift_engagement_terms,
            freeze_accepted_terms,
            require_acceptance_payload,
        )
        try:
            engagement_terms = build_shift_engagement_terms(shift=shift, user=offer.user, offer=offer)
            require_acceptance_payload(terms=engagement_terms, data=request.data)
        except DjangoValidationError as exc:
            return Response(getattr(exc, 'message_dict', {'detail': exc.messages}), status=status.HTTP_400_BAD_REQUEST)

        if engagement_terms.get("acceptance_required"):
            accepted_terms, terms_accepted_at = freeze_accepted_terms(
                terms=engagement_terms,
                user=request.user,
            )
        else:
            accepted_terms, terms_accepted_at = engagement_terms, None

        assignment_ids = []
        assignment_rates = []
        billing_state = get_billing_state_for_pharmacy(shift.pharmacy, acting_user=request.user)
        requires_payment = billing_state == BILLING_STATE_PAYMENT_REQUIRED

        with transaction.atomic():
            offer.payment_preference_snapshot = accepted_terms.get("payment_preference", "")
            offer.settlement_channel = accepted_terms.get("settlement_channel", "")
            offer.engagement_kind = accepted_terms.get("engagement_kind", "")
            offer.engagement_terms_snapshot = accepted_terms
            offer.engagement_terms_accepted_at = terms_accepted_at
            offer.save(update_fields=[
                "payment_preference_snapshot",
                "settlement_channel",
                "engagement_kind",
                "engagement_terms_snapshot",
                "engagement_terms_accepted_at",
                "updated_at",
            ])

            if requires_payment:
                offer.status = ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT
                offer.save(update_fields=['status', 'updated_at'])
                if shift.payment_status != 'PENDING':
                    shift.payment_status = 'PENDING'
                    shift.save(update_fields=['payment_status'])
            else:
                if shift.payment_status != 'PAID':
                    shift.payment_status = 'PAID'
                    shift.save(update_fields=['payment_status'])
                assignment_ids, assignment_rates = finalize_shift_offer(offer)
                if slot_obj:
                    ShiftOffer.objects.filter(
                        shift=shift,
                        slot=slot_obj,
                        status__in=[ShiftOffer.Status.PENDING, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT],
                    ).exclude(id=offer.id).update(status=ShiftOffer.Status.EXPIRED, updated_at=timezone.now())
                elif shift.single_user_only:
                    ShiftOffer.objects.filter(
                        shift=shift,
                        slot__isnull=True,
                        status__in=[ShiftOffer.Status.PENDING, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT],
                    ).exclude(id=offer.id).update(status=ShiftOffer.Status.EXPIRED, updated_at=timezone.now())

        if not requires_payment:
            transaction.on_commit(lambda: send_shift_payment_finalized_notifications(
                shift=shift,
                offers=[offer],
                paid_by=self._resolve_owner_recipient(shift),
                payment_method="free",
            ))

        pharmacy_display = shift.pharmacy.name
        if getattr(shift, "post_anonymously", False):
            suburb = getattr(shift.pharmacy, "suburb", None)
            pharmacy_display = f"Shift in {suburb}" if suburb else "Anonymous Pharmacy"

        if offer.user and offer.user.email:
            ctx = build_shift_email_context(shift, user=offer.user, role=offer.user.role.lower())
            ctx["pharmacy_name"] = pharmacy_display
            offer_details = build_offer_shift_details(shift, offer)
            ctx.update(offer_details)
            ctx["shift_link"] = worker_offer_url(offer.user, shift, offer) if requires_payment else active_shift_url_for_user(offer.user, shift)
            ctx["payment_required"] = requires_payment
            ctx["rate"] = offer_details["slot_details"][0].get("rate") if offer_details["slot_details"] else ""
            worker_title = "Offer accepted - owner payment pending" if requires_payment else "Shift confirmed"
            worker_body = (
                f"Thanks for confirming. The owner must complete payment before you are locked in. {offer_details['shift_summary']}"
                if requires_payment
                else f"You are confirmed for a shift at {pharmacy_display}. {offer_details['shift_summary']}"
            )
            notify_shift_users(
                [offer.user],
                shift=shift,
                title=worker_title,
                body=worker_body,
                kind="shift_confirmed",
                payload={
                    "offer_id": offer.id,
                    "assignment_ids": assignment_ids,
                    "status": offer.status,
                    "payment_required": requires_payment,
                    **offer_details,
                },
            )
            async_task(
                'users.tasks.send_async_email',
                subject=(
                    f"Thanks for confirming your shift at {pharmacy_display} - owner payment pending"
                    if requires_payment
                    else f"You've been accepted for a shift at {pharmacy_display}"
                ),
                recipient_list=[offer.user.email],
                template_name="emails/shift_accept.html",
                context=ctx,
                text_template="emails/shift_accept.txt",
                suppress_auto_notification=True,
            )

        owner_user = self._resolve_owner_recipient(shift)
        if owner_user and owner_user.email:
            worker_name = offer.user.get_full_name() or offer.user.email
            worker_role_label = user_work_role_label(offer.user, "candidate")
            shift_date = self._first_offer_date(shift, offer)
            shift_link = active_shift_url_for_user(owner_user, shift)
            rate_label = self._format_rate_label(shift, assignment_rates=assignment_rates, offer=offer)
            offer_details = build_offer_shift_details(shift, offer)
            owner_ctx = {
                "owner_name": owner_user.get_full_name() or owner_user.email,
                "worker_name": worker_name,
                "worker_role_label": worker_role_label,
                "pharmacy_name": pharmacy_display,
                "role_needed": shift.role_needed,
                "shift_date": shift_date,
                "shift_link": shift_link,
                "rate": rate_label,
                "billing_state": billing_state,
                "payment_required": requires_payment,
                **offer_details,
            }
            notify_shift_users(
                [owner_user],
                shift=shift,
                title=f"{worker_role_label} confirmed: {pharmacy_display}",
                body=f"{worker_name} confirmed your shift offer." + (" Payment is required to finalize." if requires_payment else ""),
                kind="shift_worker_confirmed",
                payload={
                    "offer_id": offer.id,
                    "status": offer.status,
                    "payment_required": requires_payment,
                    "billing_state": billing_state,
                    **offer_details,
                },
            )
            async_task(
                'users.tasks.send_async_email',
                subject=f"{worker_role_label} confirmed shift offer at {pharmacy_display}" + (" - Action Required" if requires_payment else ""),
                recipient_list=[owner_user.email],
                template_name="emails/owner_worker_confirmed.html",
                context=owner_ctx,
                text_template="emails/owner_worker_confirmed.txt",
                suppress_auto_notification=True,
            )

        return Response({
            'detail': 'Offer accepted.',
            'assignment_ids': assignment_ids,
            'status': offer.status,
            'payment_status': shift.payment_status,
            'requires_payment': requires_payment,
            'billing_state': billing_state,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='activate-payroll')
    def activate_payroll(self, request, pk=None):
        from client_profile.engagement_routing import (
            KIND_SHIFT_EMPLOYMENT,
            PAYMENT_TFN,
            SETTLEMENT_PAYROLL,
            validate_tfn_payroll_profile,
        )

        with transaction.atomic():
            offer = (
                ShiftOffer.objects
                .select_for_update()
                .select_related("shift__pharmacy", "user")
                .get(pk=pk)
            )
            shift = offer.shift
            if not BaseShiftViewSet._user_can_manage_pharmacy(request.user, shift.pharmacy):
                return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
            if not getattr(shift.pharmacy, "use_chemisttasker_payroll", False):
                return Response(
                    {'detail': 'ChemistTasker Payroll is not enabled for this pharmacy.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if (
                offer.payment_preference_snapshot != PAYMENT_TFN
                or offer.engagement_kind != KIND_SHIFT_EMPLOYMENT
            ):
                return Response(
                    {'detail': 'Only accepted external TFN employee shifts can be activated for payroll.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if offer.status not in {
                ShiftOffer.Status.ACCEPTED,
                ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            }:
                return Response(
                    {'detail': 'Accept the shift offer before activating payroll.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            snapshot = offer.engagement_terms_snapshot or {}
            if snapshot.get("award_payroll_review_required"):
                return Response(
                    {
                        'detail': 'This shift needs Award/overtime review before ChemistTasker Payroll can process it.',
                        'reasons': snapshot.get("award_payroll_review_reasons") or [],
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                validate_tfn_payroll_profile(offer.user)
            except DjangoValidationError as exc:
                return Response(
                    getattr(exc, 'message_dict', {'detail': exc.messages}),
                    status=status.HTTP_400_BAD_REQUEST,
                )

            activated_at = timezone.now()
            offer.settlement_channel = SETTLEMENT_PAYROLL
            offer.payroll_activated_at = activated_at
            offer.save(update_fields=[
                "settlement_channel",
                "payroll_activated_at",
                "updated_at",
            ])
            assignment_count = ShiftSlotAssignment.objects.filter(
                source_offer=offer,
                payment_preference_snapshot=PAYMENT_TFN,
                engagement_kind=KIND_SHIFT_EMPLOYMENT,
            ).update(
                settlement_channel=SETTLEMENT_PAYROLL,
                payroll_activated_at=activated_at,
            )

        return Response({
            'status': 'payroll_activated',
            'offer_id': offer.id,
            'assignment_count': assignment_count,
            'payroll_activated_at': activated_at.isoformat(),
        })

    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        offer = self.get_object()
        if offer.user_id != request.user.id:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        if offer.status != ShiftOffer.Status.PENDING:
            return Response({'detail': 'Offer is not pending.'}, status=status.HTTP_400_BAD_REQUEST)
        offer.status = ShiftOffer.Status.DECLINED
        offer.save(update_fields=['status', 'updated_at'])

        shift = offer.shift
        pharmacy_display = shift.pharmacy.name
        if getattr(shift, "post_anonymously", False):
            suburb = getattr(shift.pharmacy, "suburb", None)
            pharmacy_display = f"Shift in {suburb}" if suburb else "Anonymous Pharmacy"

        owner_user = self._resolve_owner_recipient(shift)
        if owner_user and owner_user.email:
            worker_name = offer.user.get_full_name() or offer.user.email
            worker_role_label = user_work_role_label(offer.user, "candidate")
            shift_date = self._first_offer_date(shift, offer)
            shift_link = build_roster_email_link(owner_user, shift.pharmacy)
            rate_label = self._format_rate_label(shift, offer=offer)
            owner_ctx = {
                "owner_name": owner_user.get_full_name() or owner_user.email,
                "worker_name": worker_name,
                "worker_role_label": worker_role_label,
                "pharmacy_name": pharmacy_display,
                "role_needed": shift.role_needed,
                "shift_date": shift_date,
                "shift_link": shift_link,
                "rate": rate_label,
            }
            notify_shift_users(
                [owner_user],
                shift=shift,
                title=f"{worker_role_label} rejected: {pharmacy_display}",
                body=f"{worker_name} rejected your shift offer.",
                kind="shift_worker_rejected",
                payload={"offer_id": offer.id, "status": "DECLINED"},
            )
            async_task(
                'users.tasks.send_async_email',
                subject=f"{worker_role_label} rejected shift offer at {pharmacy_display}",
                recipient_list=[owner_user.email],
                template_name="emails/owner_worker_rejected.html",
                context=owner_ctx,
                text_template="emails/owner_worker_rejected.txt",
                suppress_auto_notification=True,
            )
        return Response({'detail': 'Offer declined.'}, status=status.HTTP_200_OK)

class ShiftDetailViewSet(BaseShiftViewSet):
    @action(detail=False, methods=['post'], url_path='calculate-rates')
    def calculate_rates(self, request):
        from client_profile.services import calculate_shift_rates
        from types import SimpleNamespace
        from datetime import datetime as dt_cls

        data = request.data or {}
        pharmacy_id = data.get('pharmacyId') or data.get('pharmacy_id') or data.get('pharmacy')
        role = data.get('role') or data.get('role_needed') or data.get('roleNeeded')

        if not pharmacy_id:
            return Response({"error": "Pharmacy ID required"}, status=400)

        try:
            pharmacy = Pharmacy.objects.get(pk=pharmacy_id)
        except Pharmacy.DoesNotExist:
            raise NotFound("Pharmacy not found.")

        def to_decimal(val):
            if val is None or val == '':
                return None
            return Decimal(str(val))

        def get_override(*keys):
            for key in keys:
                if key in data:
                    return data.get(key)
            return None

        pharmacy_for_calc = SimpleNamespace(
            state=pharmacy.state,
            rate_weekday=to_decimal(get_override('rate_weekday', 'rateWeekday')) or pharmacy.rate_weekday,
            rate_saturday=to_decimal(get_override('rate_saturday', 'rateSaturday')) or pharmacy.rate_saturday,
            rate_sunday=to_decimal(get_override('rate_sunday', 'rateSunday')) or pharmacy.rate_sunday,
            rate_public_holiday=to_decimal(get_override('rate_public_holiday', 'ratePublicHoliday')) or pharmacy.rate_public_holiday,
            rate_early_morning=to_decimal(get_override('rate_early_morning', 'rateEarlyMorning')) or pharmacy.rate_early_morning,
            rate_late_night=to_decimal(get_override('rate_late_night', 'rateLateNight')) or pharmacy.rate_late_night,
        )

        mock_shift = SimpleNamespace(
            pharmacy=pharmacy_for_calc,
            role_needed=role,
            employment_type=data.get('employmentType') or data.get('employment_type') or 'CASUAL_LOCUM',
            rate_type=data.get('rateType') or data.get('rate_type') or 'FLEXIBLE',
            owner_adjusted_rate=to_decimal(data.get('ownerAdjustedRate') or data.get('owner_adjusted_rate')) or Decimal('0.00'),
        )

        results = []
        def parse_time(raw):
            if raw is None:
                return None
            raw_str = str(raw).strip()
            # normalize HH:MM:SS -> HH:MM to avoid strict format failures
            if len(raw_str) >= 5:
                raw_trimmed = raw_str[:5]
            else:
                raw_trimmed = raw_str
            for fmt in ['%H:%M', '%H:%M:%S']:
                try:
                    return dt_cls.strptime(raw_trimmed if fmt == '%H:%M' else raw_str, fmt).time()
                except ValueError:
                    continue
            return None

        for slot in data.get('slots', []) or []:
            try:
                slot_date_raw = slot.get('date')
                start_raw = slot.get('startTime') or slot.get('start_time')
                end_raw = slot.get('endTime') or slot.get('end_time')
                s_start = parse_time(start_raw)
                s_end = parse_time(end_raw)
                if not (slot_date_raw and s_start and s_end):
                    results.append({"error": "Invalid slot payload", "rate": "0.00"})
                    continue

                s_date = dt_cls.strptime(slot_date_raw, '%Y-%m-%d').date()

                rate, meta = calculate_shift_rates(mock_shift, s_date, s_start, s_end)
                results.append({"rate": str(rate), "meta": meta})
            except Exception as e:
                results.append({"error": str(e), "rate": "0.00"})

        return Response(results)

    @action(detail=True, methods=['get'])
    def member_status(self, request, pk=None):
        shift = self.get_object()
        return self._build_member_status_response(request, shift)

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        if not user.is_authenticated:
            return qs.none()

        combined_filter = Q()

        combined_filter |= Q(created_by=user)

        # 2. Shifts associated with pharmacies owned/managed by the user/their organization
        managed_pharmacies = BaseShiftViewSet._managed_pharmacies(user)
        if managed_pharmacies.exists():
            combined_filter |= Q(pharmacy__in=managed_pharmacies)

        is_owner_admin_of_pharmacy_q = Q(
            pharmacy__owner__user=user
        ) | Q(
            pharmacy__organization__memberships__user=user,
            pharmacy__organization__memberships__role='ORG_ADMIN'
        )
        combined_filter |= is_owner_admin_of_pharmacy_q

        # 3. Shifts visible through Membership relationship (client_profile.models.Membership)
        eligible_membership_q = (
            Q(
                visibility='FULL_PART_TIME',
                pharmacy__memberships__user=user,
                pharmacy__memberships__employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
                pharmacy__memberships__is_active=True,
            )
            |
            Q(
                visibility='LOCUM_CASUAL',
                pharmacy__memberships__user=user,
                pharmacy__memberships__employment_type__in=FAVORITE_STAFF_EMPLOYMENT_TYPES,
                pharmacy__memberships__is_active=True,
            )
            |
            Q(
                visibility='LOCUM_CASUAL',
                post_anonymously=False,
                pharmacy__memberships__user=user,
                pharmacy__memberships__employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
                pharmacy__memberships__is_active=True,
            )
            |
            Q(
                visibility='PLATFORM',
                post_anonymously=False,
                pharmacy__memberships__user=user,
                pharmacy__memberships__employment_type__in=(
                    PHARMACY_STAFF_EMPLOYMENT_TYPES + FAVORITE_STAFF_EMPLOYMENT_TYPES
                ),
                pharmacy__memberships__is_active=True,
            )
            |
            Q(
                visibility='OWNER_CHAIN',
                pharmacy__owner__in=Pharmacy.objects.filter(
                    memberships__user=user,
                    memberships__is_active=True,
                    memberships__employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
                ).values_list('owner', flat=True),
            )
            |
            Q(
                visibility='ORG_CHAIN',
                pharmacy__organization__in=Pharmacy.objects.filter(
                    memberships__user=user,
                    memberships__is_active=True,
                    memberships__employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
                ).values_list('organization', flat=True),
            )
        )
        combined_filter |= eligible_membership_q

        if user.role == 'OWNER':
            try:
                owner_onboarding = OwnerOnboarding.objects.get(user=user)
                user_related_chains = Chain.objects.filter(owner=owner_onboarding)
                combined_filter |= Q(
                    visibility='OWNER_CHAIN',
                    pharmacy__in=user_related_chains.values_list('pharmacies', flat=True),
                    pharmacy__chains__is_active=True # Assuming Chain also has is_active and should be active
                )
            except OwnerOnboarding.DoesNotExist:
                pass

        # For ORG_CHAIN: Shift's pharmacy is related to an organization the user is a member of
        user_org_memberships = OrganizationMembership.objects.filter(user=user)
        if user_org_memberships.exists():
            combined_filter |= Q(
                visibility='ORG_CHAIN',
                pharmacy__organization__in=user_org_memberships.values_list('organization', flat=True)
            )

        # 4. Authenticated users see platform shifts for roles they can perform.
        # The anonymous PublicJobBoardView is intentionally broader; this
        # authenticated listing must not expose every platform role.
        combined_filter |= Q(
            visibility='PLATFORM',
            role_needed__in=_shift_roles_visible_to_user(user),
        )

        # 5. Allow workers to view dedicated shifts and shifts where they have an offer,
        # counter-offer, interest, or assignment.
        combined_filter |= (
            Q(dedicated_user=user)
            | Q(offers__user=user)
            | Q(counter_offers__user=user)
            | Q(interests__user=user)
            | Q(slot_assignments__user=user)
        )

        return qs.filter(combined_filter).distinct()

class PublicJobBoardView(generics.ListAPIView):
    """ Lists all available shifts with PLATFORM visibility for the public job board. """
    serializer_class = SharedShiftSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        """
        This method ensures that only shifts with open, unassigned slots are returned.
        """
        qs = Shift.objects.filter(visibility='PLATFORM', dedicated_user__isnull=True)

        org_param = self.request.query_params.get("organization")
        if org_param:
            try:
                org_id = int(org_param)
                qs = qs.filter(pharmacy__organization_id=org_id)
            except (TypeError, ValueError):
                raise ValidationError({"organization": "Organization must be a valid id."})

        now = timezone.now()
        today = date.today()
        qs = qs.annotate(
            slot_count=Count('slots', distinct=True),
            assigned_count=Count('slots__assignments', distinct=True)
        ).filter(
            Q(employment_type__in=['FULL_TIME', 'PART_TIME'], slot_count=0) |  # slotless FT/PT roles
            Q(assigned_count__lt=F('slot_count'))                              # open, unassigned slots
        ).filter(
            Q(employment_type__in=['FULL_TIME', 'PART_TIME'], slot_count=0) |  # slotless FT/PT
            Q(slots__date__gt=today) |                                        # future slots
            Q(slots__date=today, slots__end_time__gt=now.time())              # today but still active
        )

        # --- Filters from query params (mirror PublicShiftViewSet but without role gating) ---
        params = self.request.query_params
        search = params.get('search')
        roles = params.getlist('roles') or params.getlist('role')
        employment_types = params.getlist('employment_types') or params.getlist('employment_type')
        cities = params.getlist('city')
        states = params.getlist('state')
        min_rate = params.get('min_rate')
        only_urgent = params.get('only_urgent') == 'true'
        negotiable_only = params.get('negotiable_only') == 'true'
        flexible_only = params.get('flexible_only') == 'true'
        travel_provided = params.get('travel_provided') == 'true'
        accommodation_provided = params.get('accommodation_provided') == 'true'
        bulk_shifts_only = params.get('bulk_shifts_only') == 'true'
        time_of_day = params.getlist('time_of_day')
        start_date_param = params.get('start_date')
        end_date_param = params.get('end_date')

        if search:
            qs = qs.filter(
                Q(pharmacy__name__icontains=search) |
                Q(pharmacy__suburb__icontains=search) |
                Q(pharmacy__street_address__icontains=search) |
                Q(role_needed__icontains=search)
            )
        if roles:
            qs = qs.filter(role_needed__in=roles)
        if employment_types:
            qs = qs.filter(employment_type__in=employment_types)
        if cities:
            qs = qs.filter(pharmacy__suburb__in=cities)
        if states:
            qs = qs.filter(pharmacy__state__in=states)
        if only_urgent:
            qs = qs.filter(is_urgent=True)
        if negotiable_only:
            qs = qs.filter(rate_type='FLEXIBLE')
        if flexible_only:
            qs = qs.filter(flexible_timing=True)
        if travel_provided:
            qs = qs.filter(has_travel=True)
        if accommodation_provided:
            qs = qs.filter(has_accommodation=True)
        if bulk_shifts_only:
            qs = qs.annotate(slot_count=Count('slots', distinct=True)).filter(slot_count__gte=5)
        if min_rate:
            try:
                min_rate_val = float(min_rate)
                qs = qs.filter(
                    Q(fixed_rate__gte=min_rate_val) |
                    Q(slots__rate__gte=min_rate_val) |
                    Q(min_hourly_rate__gte=min_rate_val) |
                    Q(max_hourly_rate__gte=min_rate_val) |
                    Q(min_annual_salary__gte=min_rate_val) |
                    Q(max_annual_salary__gte=min_rate_val)
                )
            except ValueError:
                pass
        if time_of_day:
            time_q = Q()
            for tod in time_of_day:
                if tod == 'morning':
                    time_q |= Q(slots__start_time__lt='12:00')
                elif tod == 'afternoon':
                    time_q |= Q(slots__start_time__gte='12:00', slots__start_time__lt='17:00')
                elif tod == 'evening':
                    time_q |= Q(slots__start_time__gte='17:00')
            if time_q:
                qs = qs.filter(Q(slot_count=0) | time_q)
        if start_date_param or end_date_param:
            try:
                start_d = date.fromisoformat(start_date_param) if start_date_param else date(1970, 1, 1)
                end_d = date.fromisoformat(end_date_param) if end_date_param else date(2100, 1, 1)
                qs = qs.filter(
                    Q(slot_count=0) |
                    Q(slots__date__range=(start_d, end_d))
                )
            except ValueError:
                pass

        return qs.distinct().order_by('-created_at')




class SharedShiftDetailView(APIView):
    """
    Provides a read-only, public view for a single shared shift,
    fetched by a secure share token.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        shift = None
        token = request.query_params.get('token')
        base_qs = Shift.objects.annotate(
            slot_count=Count('slots', distinct=True),
            assigned_count=Count('slots__assignments', distinct=True),
        )

        if token:
            try:
                share_token = uuid.UUID(str(token))
            except (TypeError, ValueError):
                return Response({"error": "Invalid share token."}, status=status.HTTP_400_BAD_REQUEST)

            try:
                shift = base_qs.get(share_token=share_token)
            except Shift.DoesNotExist:
                raise NotFound("This share link is invalid or has expired.")
        else:
            return Response({"error": "A share token is required."}, status=status.HTTP_400_BAD_REQUEST)

        tz_name = getattr(shift.pharmacy, 'timezone', None) or getattr(settings, 'TIME_ZONE', None) or 'UTC'
        try:
            now_local = timezone.now().astimezone(ZoneInfo(tz_name))
        except Exception:
            now_local = timezone.now()
        today = now_local.date()
        now_time = now_local.time()
        is_slotless_ftpt = shift.employment_type in ['FULL_TIME', 'PART_TIME'] and shift.slot_count == 0
        has_future_slots = shift.slots.filter(
            Q(is_recurring=True, recurring_end_date__gte=today)
            | Q(date__gt=today)
            | Q(date=today, end_time__gt=now_time)
        ).exists()
        has_open_slots = shift.slot_count > 0 and shift.assigned_count < shift.slot_count
        is_closed = not (is_slotless_ftpt or (has_future_slots and has_open_slots))

        data = SharedShiftSerializer(shift).data
        if is_closed:
            data['is_closed'] = True
            data['closed_reason'] = "This shift doesn't accept candidates anymore."
        else:
            data['is_closed'] = False

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

class LeaveRequestViewSet(viewsets.ViewSet):
    """Compatibility API for the original Sada roster-leave routes.

    The legacy URL remains available for deployed clients, but all active
    reads/writes now use workforce.WorkforceLeaveRequest as the canonical
    leave record. client_profile.LeaveRequest is retained only as migrated
    historical data.
    """

    permission_classes = [permissions.IsAuthenticated]

    def _queryset(self):
        from workforce.models import WorkforceLeaveRequest

        qs = WorkforceLeaveRequest.objects.filter(
            slot_assignment__isnull=False,
        ).exclude(
            status=WorkforceLeaveRequest.Status.CANCELLED,
        ).select_related(
            "pharmacy",
            "user",
            "membership",
            "slot_assignment__slot",
            "slot_assignment__shift__pharmacy",
        )
        user = self.request.user

        from users.org_roles import OrgCapability, membership_capabilities

        visible = Q(user=user)
        if getattr(user, "is_superuser", False):
            return qs
        if hasattr(user, "owneronboarding"):
            visible |= Q(pharmacy__owner=user.owneronboarding)

        admin_pharmacy_ids = PharmacyAdmin.objects.filter(
            user=user,
            is_active=True,
            admin_level__in=[
                PharmacyAdmin.AdminLevel.OWNER,
                PharmacyAdmin.AdminLevel.MANAGER,
                PharmacyAdmin.AdminLevel.ROSTER_MANAGER,
            ],
        ).values_list("pharmacy_id", flat=True)
        visible |= Q(pharmacy_id__in=admin_pharmacy_ids)

        for membership in OrganizationMembership.objects.filter(user=user).prefetch_related("pharmacies"):
            if OrgCapability.MANAGE_ROSTER not in membership_capabilities(membership):
                continue
            if membership.role == "ORG_ADMIN":
                visible |= Q(pharmacy__organization_id=membership.organization_id)
            elif membership.role in {"CHIEF_ADMIN", "REGION_ADMIN"}:
                visible |= Q(
                    pharmacy__organization_id=membership.organization_id,
                    pharmacy_id__in=membership.pharmacies.values_list("id", flat=True),
                )

        return qs.filter(visible).distinct()

    def _get_object(self, pk):
        return get_object_or_404(self._queryset(), pk=pk)

    def list(self, request):
        from workforce.leave_service import serialize_legacy_leave
        return Response([
            serialize_legacy_leave(row)
            for row in self._queryset().order_by("-created_at", "-id")[:500]
        ])

    def retrieve(self, request, pk=None):
        from workforce.leave_service import serialize_legacy_leave
        return Response(serialize_legacy_leave(self._get_object(pk)))

    def create(self, request):
        from workforce.leave_service import create_leave, serialize_legacy_leave
        try:
            row = create_leave(request.user, request.data)
            return Response(serialize_legacy_leave(row), status=status.HTTP_201_CREATED)
        except (PermissionDenied, DjangoPermissionDenied) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else {"detail": getattr(exc, "messages", [str(exc)])}
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)

    def update(self, request, pk=None):
        from workforce.leave_service import serialize_legacy_leave, update_pending_leave
        try:
            row = update_pending_leave(request.user, pk, request.data)
            return Response(serialize_legacy_leave(row))
        except (PermissionDenied, DjangoPermissionDenied) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else {"detail": getattr(exc, "messages", [str(exc)])}
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)

    def partial_update(self, request, pk=None):
        return self.update(request, pk=pk)

    def destroy(self, request, pk=None):
        from workforce.leave_service import decide_leave
        try:
            decide_leave(request.user, pk, "CANCELLED")
            return Response(status=status.HTTP_204_NO_CONTENT)
        except (PermissionDenied, DjangoPermissionDenied) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else {"detail": getattr(exc, "messages", [str(exc)])}
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        from workforce.leave_service import decide_leave
        try:
            row = decide_leave(request.user, pk, "APPROVED", request.data.get("manager_note") or "")
            return Response({"status": row.status})
        except (PermissionDenied, DjangoPermissionDenied) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else {"detail": getattr(exc, "messages", [str(exc)])}
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        from workforce.leave_service import decide_leave
        try:
            row = decide_leave(request.user, pk, "REJECTED", request.data.get("manager_note") or "")
            return Response({"status": row.status})
        except (PermissionDenied, DjangoPermissionDenied) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as exc:
            detail = exc.message_dict if hasattr(exc, "message_dict") else {"detail": getattr(exc, "messages", [str(exc)])}
            return Response(detail, status=status.HTTP_400_BAD_REQUEST)


class WorkerShiftRequestViewSet(viewsets.ModelViewSet):
    """
    Shift Cover Requests:
    - Workers submit a cover request for an assigned or empty time slot.
    - Owners / Org Admins / Pharmacy Admins receive the request email.
    - Approve/Reject sends a role-aware link to the worker (their dashboard).
    """
    queryset = WorkerShiftRequest.objects.all().select_related("pharmacy", "requested_by")
    serializer_class = WorkerShiftRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    # ---------------------------
    # VISIBILITY / LISTING
    # ---------------------------
    def get_queryset(self):
        user = self.request.user

        # Workers: only their own requests
        if getattr(user, "role", None) in ["PHARMACIST", "OTHER_STAFF", "EXPLORER"]:
            return self.queryset.filter(requested_by=user)

        # Owners / Org Admins / Pharmacy Admins: all requests for pharmacies they control
        # (mirror your other viewsets)
        controlled = Pharmacy.objects.none()

        # Owner’s own pharmacies
        if hasattr(user, "owneronboarding"):
            controlled |= Pharmacy.objects.filter(owner=user.owneronboarding)

        # Org-admin pharmacies (direct or claimed)
        org_ids = list(
            OrganizationMembership.objects.filter(user=user, role='ORG_ADMIN').values_list('organization_id', flat=True)
        )
        if org_ids:
            controlled |= Pharmacy.objects.filter(organization_id__in=org_ids)

        # Pharmacy Admin pharmacies
        admin_pharms = Pharmacy.objects.filter(
            admin_assignments__user=user,
            admin_assignments__is_active=True
        )
        controlled |= admin_pharms

        qs = self.queryset.filter(pharmacy__in=controlled).distinct()

        # Filter by pharmacy if provided
        pharmacy_id = self.request.query_params.get('pharmacy')
        if pharmacy_id:
            qs = qs.filter(pharmacy_id=pharmacy_id)

        # Date filters to mirror roster range
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

    # ---------------------------
    # CREATE (Worker submits)
    # ---------------------------
    def perform_create(self, serializer):
        """
        Send emails exactly like your LeaveRequest pattern, but:
        - personalize each email with the recipient's name (owner_name)
        - build the shift_link using that recipient (role-aware)
        """
        req = serializer.save(requested_by=self.request.user)
        pharmacy = req.pharmacy

        # Collect recipients (same schema you use elsewhere)
        recipients = []

        # Pharmacy Admins of this pharmacy
        pharmacy_admins = PharmacyAdmin.objects.filter(
            pharmacy=pharmacy,
            is_active=True
        ).select_related('user')

        # Org Admins if the pharmacy is attached to an organization
        org_admins = []
        if pharmacy.organization_id:
            org_admins = OrganizationMembership.objects.filter(
                role='ORG_ADMIN',
                organization_id=pharmacy.organization_id
            ).select_related('user')

        # Owner user
        owner_user = getattr(pharmacy.owner, "user", None) if hasattr(pharmacy, "owner") and pharmacy.owner else None

        # Build unique recipient user list
        for admin_mem in pharmacy_admins:
            if admin_mem.user and admin_mem.user.email:
                recipients.append(admin_mem.user)

        for admin in org_admins:
            if admin.user and admin.user.email:
                recipients.append(admin.user)

        if owner_user and owner_user.email:
            recipients.append(owner_user)

        # Deduplicate by email
        seen = set()
        unique_recipients = []
        for u in recipients:
            if u.email not in seen:
                seen.add(u.email)
                unique_recipients.append(u)

        # Send ONE email per recipient so the greeting and link are correct
        worker_name = req.requested_by.get_full_name() or req.requested_by.email
        for recipient in unique_recipients:
            ctx = {
                # template expects 'owner_name' in the greeting; we pass the actual recipient's name
                "owner_name": recipient.get_full_name() or recipient.email,
                # request details
                "requested_by": worker_name,                 # templates use this
                "worker_name": worker_name,                  # keep both keys for safety
                "worker_email": req.requested_by.email,
                "note": req.note or "",
                "shift_date": req.slot_date,
                "pharmacy_name": pharmacy.name,
                "shift_link": build_roster_email_link(recipient, pharmacy),
            }

            notification_payload = {
                "title": f"Shift cover request: {pharmacy.name}",
                "body": f"{worker_name} requested cover for {req.slot_date}.",
                "action_url": ctx["shift_link"],
                "payload": {"worker_shift_request_id": req.id},
            }
            if getattr(recipient, "id", None):
                notification_payload["user_ids"] = [recipient.id]

            async_task(
                'users.tasks.send_async_email',
                subject=f"Shift cover request from {worker_name} for {pharmacy.name}",
                recipient_list=[recipient.email],
                template_name="emails/swap_requested.html",
                context=ctx,
                text_template="emails/swap_requested.txt",
                notification=notification_payload,
            )

    def _assert_requester_can_modify(self, request_obj):
        user = self.request.user
        if request_obj.requested_by != user:
            raise PermissionDenied("You can only manage your own cover requests.")
        if request_obj.status != "PENDING":
            raise ValidationError("Only pending cover requests can be updated or cancelled.")

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        self._assert_requester_can_modify(instance)
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self._assert_requester_can_modify(instance)
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _resolve_shift_role_for_request(self, req):
        role = _normalized_role_code(req.role)
        if role == "OTHER_STAFF":
            if req.shift_id and getattr(req.shift, "shift", None):
                assignment_role = _normalized_role_code(req.shift.shift.role_needed)
                if assignment_role in dict(Shift.ROLE_CHOICES):
                    return assignment_role

            requester_role = _otherstaff_onboarding_role(req.requested_by)
            if requester_role in dict(Shift.ROLE_CHOICES):
                return requester_role

            raise ValidationError({
                "role": "Other staff cover requests must resolve to a specific shift role before approval."
            })

        if role not in dict(Shift.ROLE_CHOICES):
            raise ValidationError({"role": "Invalid shift role."})

        return role

    # ---------------------------
    # APPROVE (Admin action)
    # ---------------------------
    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        req = self.get_object()

        # Permission: same people who got the request may decide
        self._assert_decider_permissions(req)

        if req.status != "PENDING":
            return Response({"detail": f"Already {req.status.lower()}."}, status=status.HTTP_400_BAD_REQUEST)

        pharmacy = req.pharmacy
        role_needed = self._resolve_shift_role_for_request(req)
        
        # Check if this request is linked to an existing ShiftSlotAssignment
        if req.shift:
            from client_profile.roster_worker_actions import release_worker_from_assignment
            try:
                release_worker_from_assignment(
                    req,
                    manager=request.user,
                    escalate_to_visibility="LOCUM_CASUAL",
                )
            except DjangoValidationError as e:
                return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

            # Preserve backward-compatible status
            req.status = "AUTO_PUBLISHED"
            req.save(update_fields=["status"])
        else:
            # Request was for an unassigned shift; create open community shift
            shift_data = {
                "pharmacy": pharmacy,
                "role_needed": role_needed,
                "employment_type": "LOCUM",
                "visibility": "LOCUM_CASUAL",
                "single_user_only": True,
                "created_by": request.user,
                "description": f"This shift was created from a cover request by {req.requested_by.get_full_name()} for {req.slot_date}. Note: {req.note or 'No note provided.'}",
            }
            if role_needed == "PHARMACIST":
                shift_data["rate_type"] = "FLEXIBLE"

            new_shift = Shift.objects.create(**shift_data)

            ShiftSlot.objects.create(
                shift=new_shift,
                date=req.slot_date,
                start_time=req.start_time,
                end_time=req.end_time,
                is_recurring=False,
            )

            # Update the request status to show it was auto-published
            req.status = "AUTO_PUBLISHED"
            req.resolved_at = timezone.now()
            req.resolved_by = request.user
            req.save(update_fields=["status", "resolved_at", "resolved_by"])
        
        approval_status_message = "approved and a new community shift has been published"

        # Email the worker with their own, role-correct dashboard/roster link
        # This notification is sent for both auto-published and manually approved requests.
        ctx = {
            "worker_name": req.requested_by.get_full_name() or req.requested_by.email,
            "pharmacy_name": req.pharmacy.name,
            "shift_date": req.slot_date,
            "shift_link": build_roster_email_link(req.requested_by, req.pharmacy),
        }
        if req.requested_by.email:
            notification_payload = {
                "title": f"Shift cover approved: {ctx['pharmacy_name']}",
                "body": f"Your cover request for {ctx['shift_date']} was {approval_status_message}.",
                "action_url": ctx["shift_link"],
                "payload": {"worker_shift_request_id": req.id},
            }
            if getattr(req.requested_by, "id", None):
                notification_payload["user_ids"] = [req.requested_by.id]
            async_task(
                'users.tasks.send_async_email',
                subject=f"Your shift cover request for {ctx['pharmacy_name']} was approved",
                recipient_list=[req.requested_by.email],
                template_name="emails/swap_approved.html",
                context=ctx,
                text_template="emails/swap_approved.txt",
                notification=notification_payload,
            )
        return Response({'status': req.status.lower()})

    # ---------------------------
    # REJECT (Admin action)
    # ---------------------------
    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        req = self.get_object()

        # Permission: same people who got the request may decide
        self._assert_decider_permissions(req)

        if req.status != "PENDING":
            return Response({"detail": f"Already {req.status.lower()}."}, status=status.HTTP_400_BAD_REQUEST)

        req.status = "REJECTED"
        req.resolved_at = timezone.now()
        req.resolved_by = request.user
        req.save(update_fields=["status", "resolved_at", "resolved_by"])

        # NEW: If the request was linked to an assignment, it is now implicitly restored.
        # The frontend will no longer show it as a pending request.

        # Email the worker with their own, role-correct link
        ctx = {
            "worker_name": req.requested_by.get_full_name() or req.requested_by.email,
            "pharmacy_name": req.pharmacy.name,
            "shift_date": req.slot_date,
            "shift_link": build_roster_email_link(req.requested_by, req.pharmacy),
        }
        if req.requested_by.email:
            notification_payload = {
                "title": f"Shift cover rejected: {ctx['pharmacy_name']}",
                "body": f"Your cover request for {ctx['shift_date']} was rejected.",
                "action_url": ctx["shift_link"],
                "payload": {"worker_shift_request_id": req.id},
            }
            if getattr(req.requested_by, "id", None):
                notification_payload["user_ids"] = [req.requested_by.id]
            async_task(
                'users.tasks.send_async_email',
                subject=f"Your shift cover request for {ctx['pharmacy_name']} was rejected",
                recipient_list=[req.requested_by.email],
                template_name="emails/swap_rejected.html",
                context=ctx,
                text_template="emails/swap_rejected.txt",
                notification=notification_payload,
            )
        return Response({'status': 'rejected'})

    # ---------------------------
    # PERMISSIONS (shared)
    # ---------------------------
    def _assert_decider_permissions(self, req):
        """
        Only: Owner of pharmacy, Org Admin of that org, or Pharmacy Admin of this pharmacy.
        Matches your leave request approval permissions.
        """
        user = self.request.user
        pharmacy = req.pharmacy

        is_owner = hasattr(pharmacy, "owner") and pharmacy.owner and getattr(pharmacy.owner, "user", None) == user

        is_claimed_admin = (
            pharmacy.organization_id
            and OrganizationMembership.objects.filter(
                user=user,
                role='ORG_ADMIN',
                organization_id=pharmacy.organization_id
            ).exists()
        )

        can_manage_roster = has_admin_capability(user, pharmacy, CAPABILITY_MANAGE_ROSTER)

        if not (is_owner or is_claimed_admin or can_manage_roster):
            raise PermissionDenied("Not authorized to approve/reject this shift cover request.")


# --- “My Confirmed” Viewset ---
class MyConfirmedShiftsViewSet(BaseShiftViewSet):
    """
    Shifts I’m assigned to that haven’t ended yet.
    """
    serializer_class   = MyShiftSerializer
    permission_classes = [IsPharmacistOrOtherStaff]

    def get_queryset(self):
        user  = self.request.user
        now   = timezone.now()
        today = date.today()

        qs = super().get_queryset().filter(
            slot_assignments__user=user
        )
        qs = qs.annotate(
            has_confirmed_slot=_matching_shift_slot_exists(
                now=now,
                today=today,
                assigned_user_id=user.id,
                state='confirmed',
            )
        ).filter(has_confirmed_slot=True)

        return qs.distinct()

# --- “My History” Viewset ---
class MyHistoryShiftsViewSet(BaseShiftViewSet):
    """
    Shifts I’m assigned to that have already ended.
    """
    serializer_class   = MyShiftSerializer
    permission_classes = [IsPharmacistOrOtherStaff]

    def get_queryset(self):
        user  = self.request.user
        now   = timezone.now()
        today = date.today()

        qs = super().get_queryset().filter(
            slot_assignments__user=user
        )
        payment_pref = self.request.query_params.get('payment_preference')
        if payment_pref:
            qs = qs.filter(payment_preference__iexact=payment_pref)
        qs = qs.annotate(
            has_history_slot=_matching_shift_slot_exists(
                now=now,
                today=today,
                assigned_user_id=user.id,
                state='history',
            )
        ).filter(has_history_slot=True)

        return qs.distinct()





















from django.http import HttpResponse, Http404


# --- Stage 2: code moved to client_profile/domains (re-exported so existing import paths keep working) ---
_MOVED_LAZY = {
    "ChainViewSet": "client_profile.domains.orgs.views",
    "ChatMessagePagination": "client_profile.domains.chat.views",
    "ChatParticipantView": "client_profile.domains.chat.views",
    "ConversationViewSet": "client_profile.domains.chat.views",
    "DeviceTokenViewSet": "client_profile.domains.notifications.views",
    "ExplorerOnboardingV2MeView": "client_profile.domains.onboarding.views",
    "ExplorerPostViewSet": "client_profile.domains.explorer.views",
    "GenerateInvoiceView": "client_profile.domains.invoices.views",
    "InvoiceDetailView": "client_profile.domains.invoices.views",
    "InvoiceListView": "client_profile.domains.invoices.views",
    "IsPostOwner": "client_profile.domains.explorer.views",
    "MAX_ACTIVE_PHARMACY_MEMBERSHIPS": "client_profile.domains.common.access",
    "MagicLinkInfoView": "client_profile.domains.memberships.views",
    "MembershipApplicationViewSet": "client_profile.domains.memberships.views",
    "MembershipInviteLinkViewSet": "client_profile.domains.memberships.views",
    "MembershipViewSet": "client_profile.domains.memberships.views",
    "MessageReactionView": "client_profile.domains.chat.views",
    "MessageViewSet": "client_profile.domains.chat.views",
    "MyMembershipsViewSet": "client_profile.domains.memberships.views",
    "NotificationPagination": "client_profile.domains.notifications.views",
    "NotificationViewSet": "client_profile.domains.notifications.views",
    "OrganizationViewSet": "client_profile.domains.orgs.views",
    "OtherStaffOnboardingV2MeView": "client_profile.domains.onboarding.views",
    "OwnerOnboardingClaim": "client_profile.domains.orgs.claims",
    "OwnerOnboardingV2MeView": "client_profile.domains.onboarding.views",
    "PharmacistOnboardingV2MeView": "client_profile.domains.onboarding.views",
    "PharmacyAdminViewSet": "client_profile.domains.orgs.views",
    "PharmacyClaimViewSet": "client_profile.domains.orgs.claims",
    "PharmacyViewSet": "client_profile.domains.orgs.views",
    "PillRewardsViewSet": "client_profile.domains.pills.views",
    "PublicOrganizationDetailView": "client_profile.domains.orgs.views",
    "RatingViewSet": "client_profile.domains.ratings.views",
    "RefereeRejectView": "client_profile.domains.onboarding.views",
    "RefereeSubmitResponseView": "client_profile.domains.onboarding.views",
    "SubmitMembershipApplication": "client_profile.domains.memberships.views",
    "TalentPostPagination": "client_profile.domains.explorer.views",
    "UserAvailabilityViewSet": "client_profile.domains.availability.views",
    "_build_org_claims_url": "client_profile.domains.orgs.claims",
    "_build_owner_claims_url": "client_profile.domains.orgs.claims",
    "_collect_org_access_scope": "client_profile.domains.common.access",
    "_count_active_memberships": "client_profile.domains.common.access",
    "_create_owner_claim_notification": "client_profile.domains.orgs.claims",
    "_format_membership_person": "client_profile.domains.memberships.views",
    "_frontend_base_url_for_notifications": "client_profile.domains.memberships.views",
    "_get_org_pharmacies_queryset": "client_profile.domains.common.access",
    "_invoice_queryset_for_user": "client_profile.domains.invoices.views",
    "_membership_controller_users": "client_profile.domains.memberships.views",
    "_notify_membership_invitation_sent": "client_profile.domains.memberships.views",
    "_notify_membership_response": "client_profile.domains.memberships.views",
    "_notify_org_of_claim_response": "client_profile.domains.orgs.claims",
    "_pharmacy_membership_manage_url": "client_profile.domains.memberships.views",
    "_send_owner_claim_email": "client_profile.domains.orgs.claims",
    "_send_pharmacy_created_email": "client_profile.domains.orgs.claims",
    "_user_can_invite_members_to_pharmacy": "client_profile.domains.memberships.views",
    "_worker_membership_url": "client_profile.domains.memberships.views",
    "invoice_pdf_view": "client_profile.domains.invoices.views",
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
    from client_profile.domains.explorer.views import ExplorerPostViewSet, IsPostOwner, TalentPostPagination  # noqa: F401
    from client_profile.domains.invoices.views import GenerateInvoiceView, InvoiceDetailView, InvoiceListView, _invoice_queryset_for_user, invoice_pdf_view, preview_invoice_lines, report_invoice_issue, send_invoice_email  # noqa: F401
    from client_profile.domains.memberships.views import MagicLinkInfoView, MembershipApplicationViewSet, MembershipInviteLinkViewSet, MembershipViewSet, MyMembershipsViewSet, SubmitMembershipApplication, _format_membership_person, _frontend_base_url_for_notifications, _membership_controller_users, _notify_membership_invitation_sent, _notify_membership_response, _pharmacy_membership_manage_url, _user_can_invite_members_to_pharmacy, _worker_membership_url  # noqa: F401
    from client_profile.domains.notifications.views import DeviceTokenViewSet, NotificationPagination, NotificationViewSet  # noqa: F401
    from client_profile.domains.onboarding.views import ExplorerOnboardingV2MeView, OtherStaffOnboardingV2MeView, OwnerOnboardingV2MeView, PharmacistOnboardingV2MeView, RefereeRejectView, RefereeSubmitResponseView  # noqa: F401
    from client_profile.domains.orgs.claims import OwnerOnboardingClaim, PharmacyClaimViewSet, _build_org_claims_url, _build_owner_claims_url, _create_owner_claim_notification, _notify_org_of_claim_response, _send_owner_claim_email, _send_pharmacy_created_email  # noqa: F401
    from client_profile.domains.orgs.views import ChainViewSet, OrganizationViewSet, PharmacyAdminViewSet, PharmacyViewSet, PublicOrganizationDetailView  # noqa: F401
    from client_profile.domains.pills.views import PillRewardsViewSet  # noqa: F401
    from client_profile.domains.ratings.views import RatingViewSet  # noqa: F401
