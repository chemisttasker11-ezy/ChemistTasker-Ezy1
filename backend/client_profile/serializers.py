# client_profile/serializers.py

# This is smsm update
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field, OpenApiTypes
from .models import (
    Chain,
    Conversation,
    ExplorerOnboarding,
    ExplorerPost,
    ExplorerPostReaction,
    Invoice,
    InvoiceLineItem,
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
    PharmacyCommunityGroup,
    PharmacyCommunityGroupMembership,
    PharmacyHubAttachment,
    PharmacyHubComment,
    PharmacyHubPoll,
    PharmacyHubPollComment,
    PharmacyHubPollOption,
    PharmacyHubPollVote,
    PharmacyHubPost,
    PharmacyHubPostMention,
    PharmacyHubReaction,
    PillLedgerEntry,
    PillReferralCode,
    PillReferralEvent,
    PillRewardRule,
    Rating,
    RefereeResponse,
    Shift,
    ShiftCounterOffer,
    ShiftCounterOfferSlot,
    ShiftDescriptionTemplate,
    ShiftInterest,
    ShiftOffer,
    ShiftRejection,
    ShiftSaved,
    ShiftSlot,
    ShiftSlotAssignment,
    UserAvailability,
    WorkerShiftRequest,
)
from users.models import OrganizationMembership, DeviceToken
from users.serializers import UserProfileSerializer
from django.contrib.auth import get_user_model
from django.db import transaction
from decimal import Decimal
from client_profile.utils import send_referee_emails, enforce_public_shift_daily_limit, build_shift_email_context, build_shift_offer_context, build_offer_shift_details, send_shift_updated_notifications
from client_profile.services import expand_shift_slots
from client_profile.admin_helpers import has_admin_capability, CAPABILITY_MANAGE_ROSTER
from client_profile.shift_notifications import notify_shift_users
from datetime import date, timedelta, datetime, time
from django.utils import timezone
from core.task_queue import async_task
import logging
import math
import uuid



logger = logging.getLogger(__name__)
User = get_user_model()
from client_profile.tasks import schedule_referee_reminder
import os
import json
from pathlib import Path
from django.utils.text import slugify
from django.core.files.storage import default_storage
from client_profile.file_validation import (
    ATTACHMENT_UPLOAD_POLICY,
    DOCUMENT_UPLOAD_POLICY,
    IMAGE_UPLOAD_POLICY,
    validate_upload_mapping,
    validate_uploaded_file,
)
from client_profile.rewards import get_pill_balance




# --- Skills catalog (shared-core/skills_catalog.json) ---
_SKILLS_CATALOG_CACHE = None


def _load_skills_catalog():
    global _SKILLS_CATALOG_CACHE
    if _SKILLS_CATALOG_CACHE is not None:
        return _SKILLS_CATALOG_CACHE
    base_dir = Path(__file__).resolve().parents[2]
    catalog_path = base_dir / "shared-core" / "skills_catalog.json"
    try:
        with open(catalog_path, "r", encoding="utf-8") as f:
            _SKILLS_CATALOG_CACHE = json.load(f)
    except Exception:
        _SKILLS_CATALOG_CACHE = {}
    return _SKILLS_CATALOG_CACHE





































# class SyncUserMixin:
#     USER_FIELDS = ['username', 'first_name', 'last_name']
#     @staticmethod
#     def sync_user_fields(user_data_from_pop, user_instance):
#         updated_fields = []
#         for attr in SyncUserMixin.USER_FIELDS:
#             if attr in user_data_from_pop and getattr(user_instance, attr) != user_data_from_pop[attr]:
#                 setattr(user_instance, attr, user_data_from_pop[attr])
#                 updated_fields.append(attr)
#         if updated_fields:
#             user_instance.save(update_fields=updated_fields)


# === OnboardingVerificationMixin ===
# class OnboardingVerificationMixin:
#     """
#     Triggers individual verification tasks and one initial evaluation task.
#     """
#     def _trigger_verification_tasks(self, instance, is_create=False):
#         # Reset automated verification fields
#         verification_fields_to_reset = [f for f in instance._meta.fields if f.name.endswith('_verified')]
#         for field in verification_fields_to_reset:
#             setattr(instance, field.name, False)
        
#         note_fields_to_reset = [f for f in instance._meta.fields if f.name.endswith('_verification_note')]
#         for field in note_fields_to_reset:
#             setattr(instance, field.name, "")
            
#         instance.verified = False
        
#         update_fields = [f.name for f in verification_fields_to_reset] + [f.name for f in note_fields_to_reset] + ['verified']

#         # FIX: ADD THIS BLOCK TO RESET REFEREE STATUSES
#         # This ensures that when a referee is changed, the old rejection/confirmation is cleared.
#         referee_fields_to_reset = [
#             'referee1_confirmed', 'referee1_rejected',
#             'referee2_confirmed', 'referee2_rejected'
#         ]
#         for field_name in referee_fields_to_reset:
#             if hasattr(instance, field_name):
#                 setattr(instance, field_name, False)
#                 update_fields.append(field_name)

#         if update_fields:
#             instance.save(update_fields=list(set(update_fields)))




















































from client_profile.utils import TRAVEL_ORIGIN_PREFIX, extract_travel_origin_from_message, extract_suburb_from_travel_origin











































# --- Pharmacy Hub Serializers --------------------------------------------------------


# --- Stage 2: code moved to client_profile/domains (re-exported so existing import paths keep working) ---
_MOVED_LAZY = {
    "APPLICATION_IDENTIFIER_FIELDS": "client_profile.domains.memberships.serializers",
    "APPLICATION_REVIEW_FIELDS": "client_profile.domains.memberships.serializers",
    "ChainSerializer": "client_profile.domains.orgs.serializers",
    "ChatMemberSerializer": "client_profile.domains.chat.serializers",
    "ChatMembershipSerializer": "client_profile.domains.chat.serializers",
    "ChatParticipantSerializer": "client_profile.domains.chat.serializers",
    "ClaimReferralSerializer": "client_profile.domains.pills.serializers",
    "ConversationCreateSerializer": "client_profile.domains.chat.serializers",
    "ConversationDetailSerializer": "client_profile.domains.chat.serializers",
    "ConversationListSerializer": "client_profile.domains.chat.serializers",
    "CreateFriendReferralSerializer": "client_profile.domains.pills.serializers",
    "CreateShiftReferralSerializer": "client_profile.domains.pills.serializers",
    "DeviceTokenSerializer": "client_profile.domains.notifications.serializers",
    "ExplorerDashboardResponseSerializer": "client_profile.domains.dashboards.serializers",
    "ExplorerOnboardingV2Serializer": "client_profile.domains.onboarding.serializers",
    "ExplorerPostReadSerializer": "client_profile.domains.explorer.serializers",
    "ExplorerPostWriteSerializer": "client_profile.domains.explorer.serializers",
    "HubAttachmentSerializer": "client_profile.hub.serializers",
    "HubCommentSerializer": "client_profile.hub.serializers",
    "HubCommunityGroupSerializer": "client_profile.hub.serializers",
    "HubMembershipSerializer": "client_profile.hub.serializers",
    "HubOrganizationProfileSerializer": "client_profile.hub.serializers",
    "HubOrganizationSerializer": "client_profile.hub.serializers",
    "HubPharmacyProfileSerializer": "client_profile.hub.serializers",
    "HubPharmacySerializer": "client_profile.hub.serializers",
    "HubPollCommentSerializer": "client_profile.hub.serializers",
    "HubPollOptionSerializer": "client_profile.hub.serializers",
    "HubPollSerializer": "client_profile.hub.serializers",
    "HubPostSerializer": "client_profile.hub.serializers",
    "HubReactionSerializer": "client_profile.hub.serializers",
    "InvoiceLineItemSerializer": "client_profile.domains.invoices.serializers",
    "InvoiceSerializer": "client_profile.domains.invoices.serializers",
    "MAX_ACTIVE_PHARMACY_MEMBERSHIPS": "client_profile.domains.memberships.serializers",
    "MembershipApplicationReviewSerializer": "client_profile.domains.memberships.serializers",
    "MembershipApplicationSerializer": "client_profile.domains.memberships.serializers",
    "MembershipInviteLinkSerializer": "client_profile.domains.memberships.serializers",
    "MembershipSerializer": "client_profile.domains.memberships.serializers",
    "MessageSerializer": "client_profile.domains.chat.serializers",
    "MyRatingSerializer": "client_profile.domains.ratings.serializers",
    "MyShiftSerializer": "client_profile.domains.shifts.serializers",
    "NotificationSerializer": "client_profile.domains.notifications.serializers",
    "OFFER_EXPIRY_HOURS": "client_profile.domains.shifts.serializers",
    "OpenShiftSerializer": "client_profile.domains.shifts.serializers",
    "OrganizationSerializer": "client_profile.domains.orgs.serializers",
    "OtherStaffDashboardResponseSerializer": "client_profile.domains.dashboards.serializers",
    "OtherStaffOnboardingV2Serializer": "client_profile.domains.onboarding.serializers",
    "OwnerDashboardResponseSerializer": "client_profile.domains.dashboards.serializers",
    "OwnerOnboardingV2Serializer": "client_profile.domains.onboarding.serializers",
    "PendingRatingsSerializer": "client_profile.domains.ratings.serializers",
    "PharmacistDashboardResponseSerializer": "client_profile.domains.dashboards.serializers",
    "PharmacistOnboardingV2Serializer": "client_profile.domains.onboarding.serializers",
    "PharmacyAdminSerializer": "client_profile.domains.orgs.serializers",
    "PharmacyClaimCreateSerializer": "client_profile.domains.orgs.serializers",
    "PharmacyClaimSerializer": "client_profile.domains.orgs.serializers",
    "PharmacyCommunityGroupMemberSerializer": "client_profile.hub.serializers",
    "PharmacySerializer": "client_profile.domains.orgs.serializers",
    "PillBalanceSerializer": "client_profile.domains.pills.serializers",
    "PillLedgerEntrySerializer": "client_profile.domains.pills.serializers",
    "PillReferralCodeSerializer": "client_profile.domains.pills.serializers",
    "PillReferralEventSerializer": "client_profile.domains.pills.serializers",
    "PillRewardRuleSerializer": "client_profile.domains.pills.serializers",
    "PublicExplorerPostReadSerializer": "client_profile.domains.explorer.serializers",
    "PublicOrganizationSerializer": "client_profile.domains.orgs.serializers",
    "ROLE_REQUIRED_USER_ROLE": "client_profile.domains.memberships.serializers",
    "RatingReadSerializer": "client_profile.domains.ratings.serializers",
    "RatingSummarySerializer": "client_profile.domains.ratings.serializers",
    "RatingWriteSerializer": "client_profile.domains.ratings.serializers",
    "ReactionSerializer": "client_profile.domains.chat.serializers",
    "RefereeResponseSerializer": "client_profile.domains.onboarding.serializers",
    "RemoveOldFilesMixin": "client_profile.domains.common.serializers",
    "RosterAssignmentSerializer": "client_profile.domains.roster.serializers",
    "RosterShiftDetailSerializer": "client_profile.domains.roster.serializers",
    "RosterUserDetailSerializer": "client_profile.domains.roster.serializers",
    "SHIFT_EMAIL_RECIPIENT_CAP": "client_profile.domains.shifts.serializers",
    "SharedShiftSerializer": "client_profile.domains.shifts.serializers",
    "ShiftContactSerializer": "client_profile.domains.chat.serializers",
    "ShiftCounterOfferSerializer": "client_profile.domains.shifts.serializers",
    "ShiftCounterOfferSlotSerializer": "client_profile.domains.shifts.serializers",
    "ShiftDescriptionTemplateSerializer": "client_profile.domains.shifts.serializers",
    "ShiftInterestSerializer": "client_profile.domains.shifts.serializers",
    "ShiftOfferSerializer": "client_profile.domains.shifts.serializers",
    "ShiftRejectionSerializer": "client_profile.domains.shifts.serializers",
    "ShiftSavedSerializer": "client_profile.domains.shifts.serializers",
    "ShiftSerializer": "client_profile.domains.shifts.serializers",
    "ShiftSlotSerializer": "client_profile.domains.shifts.serializers",
    "ShiftSummarySerializer": "client_profile.domains.dashboards.serializers",
    "UploadValidationMixin": "client_profile.domains.common.serializers",
    "UserAvailabilitySerializer": "client_profile.domains.availability.serializers",
    "WorkerShiftRequestSerializer": "client_profile.domains.shifts.serializers",
    "_application_payment_profile_status": "client_profile.domains.memberships.serializers",
    "_application_snapshot": "client_profile.domains.memberships.serializers",
    "_application_snapshot_value": "client_profile.domains.memberships.serializers",
    "_build_absolute_media_url": "client_profile.domains.common.serializers",
    "_chat_member_identity": "client_profile.domains.common.serializers",
    "_count_active_memberships": "client_profile.domains.memberships.serializers",
    "_delete_file_if_unreferenced": "client_profile.domains.common.serializers",
    "_file_has_changed": "client_profile.domains.common.serializers",
    "_get_user_short_bio": "client_profile.domains.common.serializers",
    "_known_file_references": "client_profile.domains.common.serializers",
    "_normalise_application_role_fields": "client_profile.domains.memberships.serializers",
    "_normalize_identity_value": "client_profile.domains.common.serializers",
    "_required_cert_skill_codes": "client_profile.domains.onboarding.serializers",
    "_resolve_user_profile_photo": "client_profile.domains.common.serializers",
    "_serialize_hub_author": "client_profile.hub.serializers",
    "_serialize_user_summary": "client_profile.hub.serializers",
    "_should_clear_flag": "client_profile.domains.common.serializers",
    "_split_chat_display_name": "client_profile.domains.common.serializers",
    "_update_locked_user_fields": "client_profile.domains.common.serializers",
    "anonymize_pharmacy_detail": "client_profile.domains.orgs.serializers",
    "clean_email": "client_profile.domains.common.serializers",
    "q6": "client_profile.domains.common.serializers",
    "required_user_role_for_membership": "client_profile.domains.memberships.serializers",
    "user_can_view_full_pharmacy": "client_profile.domains.orgs.serializers",
    "verification_fields_changed": "client_profile.domains.common.serializers",
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
    from client_profile.domains.availability.serializers import UserAvailabilitySerializer  # noqa: F401
    from client_profile.domains.chat.serializers import ChatMemberSerializer, ChatMembershipSerializer, ChatParticipantSerializer, ConversationCreateSerializer, ConversationDetailSerializer, ConversationListSerializer, MessageSerializer, ReactionSerializer, ShiftContactSerializer  # noqa: F401
    from client_profile.domains.common.serializers import RemoveOldFilesMixin, UploadValidationMixin, _build_absolute_media_url, _chat_member_identity, _delete_file_if_unreferenced, _file_has_changed, _get_user_short_bio, _known_file_references, _normalize_identity_value, _resolve_user_profile_photo, _should_clear_flag, _split_chat_display_name, _update_locked_user_fields, clean_email, q6, verification_fields_changed  # noqa: F401
    from client_profile.domains.dashboards.serializers import ExplorerDashboardResponseSerializer, OtherStaffDashboardResponseSerializer, OwnerDashboardResponseSerializer, PharmacistDashboardResponseSerializer, ShiftSummarySerializer  # noqa: F401
    from client_profile.domains.explorer.serializers import ExplorerPostReadSerializer, ExplorerPostWriteSerializer, PublicExplorerPostReadSerializer  # noqa: F401
    from client_profile.domains.invoices.serializers import InvoiceLineItemSerializer, InvoiceSerializer  # noqa: F401
    from client_profile.domains.memberships.serializers import APPLICATION_IDENTIFIER_FIELDS, APPLICATION_REVIEW_FIELDS, MAX_ACTIVE_PHARMACY_MEMBERSHIPS, MembershipApplicationReviewSerializer, MembershipApplicationSerializer, MembershipInviteLinkSerializer, MembershipSerializer, ROLE_REQUIRED_USER_ROLE, _application_payment_profile_status, _application_snapshot, _application_snapshot_value, _count_active_memberships, _normalise_application_role_fields, required_user_role_for_membership  # noqa: F401
    from client_profile.domains.notifications.serializers import DeviceTokenSerializer, NotificationSerializer  # noqa: F401
    from client_profile.domains.onboarding.serializers import ExplorerOnboardingV2Serializer, OtherStaffOnboardingV2Serializer, OwnerOnboardingV2Serializer, PharmacistOnboardingV2Serializer, RefereeResponseSerializer, _required_cert_skill_codes  # noqa: F401
    from client_profile.domains.orgs.serializers import ChainSerializer, OrganizationSerializer, PharmacyAdminSerializer, PharmacyClaimCreateSerializer, PharmacyClaimSerializer, PharmacySerializer, PublicOrganizationSerializer, anonymize_pharmacy_detail, user_can_view_full_pharmacy  # noqa: F401
    from client_profile.domains.pills.serializers import ClaimReferralSerializer, CreateFriendReferralSerializer, CreateShiftReferralSerializer, PillBalanceSerializer, PillLedgerEntrySerializer, PillReferralCodeSerializer, PillReferralEventSerializer, PillRewardRuleSerializer  # noqa: F401
    from client_profile.domains.ratings.serializers import MyRatingSerializer, PendingRatingsSerializer, RatingReadSerializer, RatingSummarySerializer, RatingWriteSerializer  # noqa: F401
    from client_profile.domains.roster.serializers import RosterAssignmentSerializer, RosterShiftDetailSerializer, RosterUserDetailSerializer  # noqa: F401
    from client_profile.domains.shifts.serializers import MyShiftSerializer, OFFER_EXPIRY_HOURS, OpenShiftSerializer, SHIFT_EMAIL_RECIPIENT_CAP, SharedShiftSerializer, ShiftCounterOfferSerializer, ShiftCounterOfferSlotSerializer, ShiftDescriptionTemplateSerializer, ShiftInterestSerializer, ShiftOfferSerializer, ShiftRejectionSerializer, ShiftSavedSerializer, ShiftSerializer, ShiftSlotSerializer, WorkerShiftRequestSerializer  # noqa: F401
    from client_profile.hub.serializers import HubAttachmentSerializer, HubCommentSerializer, HubCommunityGroupSerializer, HubMembershipSerializer, HubOrganizationProfileSerializer, HubOrganizationSerializer, HubPharmacyProfileSerializer, HubPharmacySerializer, HubPollCommentSerializer, HubPollOptionSerializer, HubPollSerializer, HubPostSerializer, HubReactionSerializer, PharmacyCommunityGroupMemberSerializer, _serialize_hub_author, _serialize_user_summary  # noqa: F401
