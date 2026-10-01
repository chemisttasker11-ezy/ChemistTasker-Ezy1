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





















































































































































































from django.http import HttpResponse, Http404


# --- Stage 2: code moved to client_profile/domains (re-exported so existing import paths keep working) ---
_MOVED_LAZY = {
    "ALL_OTHER_STAFF_SHIFT_ROLES": "client_profile.domains.shifts.base",
    "ActiveShiftViewSet": "client_profile.domains.shifts.browse",
    "BaseShiftViewSet": "client_profile.domains.shifts.base",
    "COMMUNITY_LEVELS": "client_profile.domains.shifts.base",
    "ChainViewSet": "client_profile.domains.orgs.views",
    "ChatMessagePagination": "client_profile.domains.chat.views",
    "ChatParticipantView": "client_profile.domains.chat.views",
    "CommunityShiftViewSet": "client_profile.domains.shifts.browse",
    "ConfirmedShiftViewSet": "client_profile.domains.shifts.browse",
    "ConversationViewSet": "client_profile.domains.chat.views",
    "CreateShiftAndAssignView": "client_profile.domains.roster.views",
    "DeviceTokenViewSet": "client_profile.domains.notifications.views",
    "ESCALATION_FIELD_MAP": "client_profile.domains.shifts.base",
    "ExplorerDashboard": "client_profile.domains.dashboards.views",
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
    "OrganizationDashboardView": "client_profile.domains.dashboards.views",
    "OrganizationViewSet": "client_profile.domains.orgs.views",
    "OtherStaffDashboard": "client_profile.domains.dashboards.views",
    "OtherStaffOnboardingV2MeView": "client_profile.domains.onboarding.views",
    "OwnerDashboard": "client_profile.domains.dashboards.views",
    "OwnerOnboardingClaim": "client_profile.domains.orgs.claims",
    "OwnerOnboardingV2MeView": "client_profile.domains.onboarding.views",
    "PUBLIC_LEVEL": "client_profile.domains.shifts.base",
    "PharmacistDashboard": "client_profile.domains.dashboards.views",
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
    "RosterOwnerViewSet": "client_profile.domains.roster.views",
    "RosterShiftManageViewSet": "client_profile.domains.roster.views",
    "RosterWorkerViewSet": "client_profile.domains.roster.views",
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
    "_active_shift_filter": "client_profile.domains.dashboards.views",
    "_all_active_shifts": "client_profile.domains.dashboards.views",
    "_build_org_claims_url": "client_profile.domains.orgs.claims",
    "_build_owner_claims_url": "client_profile.domains.orgs.claims",
    "_collect_org_access_scope": "client_profile.domains.common.access",
    "_count_active_memberships": "client_profile.domains.common.access",
    "_create_owner_claim_notification": "client_profile.domains.orgs.claims",
    "_dashboard_activity": "client_profile.domains.dashboards.views",
    "_dashboard_activity_time": "client_profile.domains.dashboards.views",
    "_dashboard_hub_action_url": "client_profile.domains.dashboards.views",
    "_dashboard_invoice_action_url": "client_profile.domains.dashboards.views",
    "_dashboard_invoice_summary": "client_profile.domains.dashboards.views",
    "_dashboard_payload_extras": "client_profile.domains.dashboards.views",
    "_dashboard_shift_action_url": "client_profile.domains.dashboards.views",
    "_dashboard_shift_box": "client_profile.domains.dashboards.views",
    "_dashboard_upcoming_stats": "client_profile.domains.dashboards.views",
    "_format_membership_person": "client_profile.domains.memberships.views",
    "_format_money": "client_profile.domains.dashboards.views",
    "_frontend_base_url_for_notifications": "client_profile.domains.memberships.views",
    "_future_or_current_slot_q": "client_profile.domains.shifts.base",
    "_future_shift_filter": "client_profile.domains.dashboards.views",
    "_get_org_pharmacies_queryset": "client_profile.domains.common.access",
    "_get_request_ip": "client_profile.domains.common.access",
    "_invoice_queryset_for_user": "client_profile.domains.invoices.views",
    "_log_shift_profile_access": "client_profile.domains.shifts.base",
    "_matching_shift_slot_exists": "client_profile.domains.shifts.base",
    "_membership_controller_users": "client_profile.domains.memberships.views",
    "_membership_shift_employment_types": "client_profile.domains.dashboards.views",
    "_membership_visibility_levels": "client_profile.domains.dashboards.views",
    "_normalized_role_code": "client_profile.domains.common.access",
    "_notify_membership_invitation_sent": "client_profile.domains.memberships.views",
    "_notify_membership_response": "client_profile.domains.memberships.views",
    "_notify_org_of_claim_response": "client_profile.domains.orgs.claims",
    "_open_active_shifts": "client_profile.domains.dashboards.views",
    "_otherstaff_onboarding_role": "client_profile.domains.common.access",
    "_parse_dashboard_pharmacy_id": "client_profile.domains.dashboards.views",
    "_parse_dashboard_workspace": "client_profile.domains.dashboards.views",
    "_past_slot_q": "client_profile.domains.shifts.base",
    "_pharmacy_confirmed_shifts": "client_profile.domains.dashboards.views",
    "_pharmacy_membership_manage_url": "client_profile.domains.memberships.views",
    "_public_platform_shifts": "client_profile.domains.dashboards.views",
    "_scope_pharmacies": "client_profile.domains.dashboards.views",
    "_send_owner_claim_email": "client_profile.domains.orgs.claims",
    "_send_pharmacy_created_email": "client_profile.domains.orgs.claims",
    "_shift_has_past_slot_exists": "client_profile.domains.shifts.base",
    "_shift_roles_visible_to_user": "client_profile.domains.shifts.base",
    "_slot_locked_for_shift_offer": "client_profile.domains.shifts.base",
    "_user_can_invite_members_to_pharmacy": "client_profile.domains.memberships.views",
    "_user_can_perform_shift_role": "client_profile.domains.shifts.base",
    "_user_confirmed_platform_shifts": "client_profile.domains.dashboards.views",
    "_worker_membership_url": "client_profile.domains.memberships.views",
    "_worker_visible_pharmacy_shifts": "client_profile.domains.dashboards.views",
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
    from client_profile.domains.dashboards.views import ExplorerDashboard, OrganizationDashboardView, OtherStaffDashboard, OwnerDashboard, PharmacistDashboard, _active_shift_filter, _all_active_shifts, _dashboard_activity, _dashboard_activity_time, _dashboard_hub_action_url, _dashboard_invoice_action_url, _dashboard_invoice_summary, _dashboard_payload_extras, _dashboard_shift_action_url, _dashboard_shift_box, _dashboard_upcoming_stats, _format_money, _future_shift_filter, _membership_shift_employment_types, _membership_visibility_levels, _open_active_shifts, _parse_dashboard_pharmacy_id, _parse_dashboard_workspace, _pharmacy_confirmed_shifts, _public_platform_shifts, _scope_pharmacies, _user_confirmed_platform_shifts, _worker_visible_pharmacy_shifts  # noqa: F401
    from client_profile.domains.explorer.views import ExplorerPostViewSet, IsPostOwner, TalentPostPagination  # noqa: F401
    from client_profile.domains.invoices.views import GenerateInvoiceView, InvoiceDetailView, InvoiceListView, _invoice_queryset_for_user, invoice_pdf_view, preview_invoice_lines, report_invoice_issue, send_invoice_email  # noqa: F401
    from client_profile.domains.memberships.views import MagicLinkInfoView, MembershipApplicationViewSet, MembershipInviteLinkViewSet, MembershipViewSet, MyMembershipsViewSet, SubmitMembershipApplication, _format_membership_person, _frontend_base_url_for_notifications, _membership_controller_users, _notify_membership_invitation_sent, _notify_membership_response, _pharmacy_membership_manage_url, _user_can_invite_members_to_pharmacy, _worker_membership_url  # noqa: F401
    from client_profile.domains.notifications.views import DeviceTokenViewSet, NotificationPagination, NotificationViewSet  # noqa: F401
    from client_profile.domains.onboarding.views import ExplorerOnboardingV2MeView, OtherStaffOnboardingV2MeView, OwnerOnboardingV2MeView, PharmacistOnboardingV2MeView, RefereeRejectView, RefereeSubmitResponseView  # noqa: F401
    from client_profile.domains.orgs.claims import OwnerOnboardingClaim, PharmacyClaimViewSet, _build_org_claims_url, _build_owner_claims_url, _create_owner_claim_notification, _notify_org_of_claim_response, _send_owner_claim_email, _send_pharmacy_created_email  # noqa: F401
    from client_profile.domains.orgs.views import ChainViewSet, OrganizationViewSet, PharmacyAdminViewSet, PharmacyViewSet, PublicOrganizationDetailView  # noqa: F401
    from client_profile.domains.pills.views import PillRewardsViewSet  # noqa: F401
    from client_profile.domains.ratings.views import RatingViewSet  # noqa: F401
    from client_profile.domains.roster.views import CreateShiftAndAssignView, RosterOwnerViewSet, RosterShiftManageViewSet, RosterWorkerViewSet  # noqa: F401
    from client_profile.domains.shifts.base import ALL_OTHER_STAFF_SHIFT_ROLES, BaseShiftViewSet, COMMUNITY_LEVELS, ESCALATION_FIELD_MAP, NON_INTERN_OTHER_STAFF_SHIFT_ROLES, OFFER_EXPIRY_HOURS, PUBLIC_LEVEL, SHIFT_OFFER_BUZZ_COOLDOWN, _future_or_current_slot_q, _log_shift_profile_access, _matching_shift_slot_exists, _past_slot_q, _shift_has_past_slot_exists, _shift_roles_visible_to_user, _slot_locked_for_shift_offer, _user_can_perform_shift_role  # noqa: F401
    from client_profile.domains.shifts.browse import ActiveShiftViewSet, CommunityShiftViewSet, ConfirmedShiftViewSet, HistoryShiftViewSet, MyConfirmedShiftsViewSet, MyHistoryShiftsViewSet, PublicJobBoardView, PublicShiftViewSet, SharedShiftDetailView, ShiftDescriptionTemplateViewSet, ShiftDetailViewSet  # noqa: F401
    from client_profile.domains.shifts.leave import LeaveRequestViewSet  # noqa: F401
    from client_profile.domains.shifts.offers import ShiftInterestViewSet, ShiftOfferViewSet, ShiftRejectionViewSet, ShiftSavedViewSet  # noqa: F401
    from client_profile.domains.shifts.worker_requests import WorkerShiftRequestViewSet  # noqa: F401
