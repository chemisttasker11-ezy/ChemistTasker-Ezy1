import logging

log = logging.getLogger(__name__)


"""Moved verbatim from client_profile/views.py (Stage 2 domain split). Behaviour is unchanged; client_profile/views.py re-exports these names."""
from rest_framework import permissions, status, viewsets
from client_profile.models import (
    Chain,
    FAVORITE_STAFF_EMPLOYMENT_TYPES,
    Membership,
    OtherStaffOnboarding,
    PharmacistOnboarding,
    Pharmacy,
    PHARMACY_STAFF_EMPLOYMENT_TYPES,
    Shift,
    ShiftCounterOffer,
    ShiftInterest,
    ShiftOffer,
    ShiftProfileAccessAudit,
    ShiftRejection,
    ShiftSlot,
    ShiftSlotAssignment,
)
from django.core.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.permissions import SAFE_METHODS
from rest_framework.exceptions import NotFound
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.decorators import action
from client_profile.admin_helpers import (
    CAPABILITY_MANAGE_ROSTER,
    has_admin_capability,
    pharmacies_user_admins,
)
from users.serializers import UserProfileSerializer
from django.shortcuts import get_object_or_404
from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone
from client_profile.utils import (
    build_counter_offer_shift_details,
    build_offer_shift_details,
    build_shift_counter_offer_context,
    build_shift_email_context,
    build_shift_interest_context,
    build_shift_offer_context,
    enforce_public_shift_daily_limit,
    worker_offer_url,
)
from client_profile.domains.shifts.notifications import notify_shift_managers, notify_shift_users
from client_profile.domains.shifts.engagement import staff_assignment_defaults
from core.task_queue import async_task
from datetime import datetime
from client_profile.domains.common.access import (
    _get_request_ip,
    _normalized_role_code,
    _otherstaff_onboarding_role,
)
from datetime import timedelta
from decimal import Decimal
import uuid
from users.models import OrganizationMembership, User
from client_profile.domains.shifts.serializers import (
    ShiftCounterOfferSerializer,
    ShiftInterestSerializer,
    ShiftRejectionSerializer,
    ShiftSerializer,
    ShiftSlotSerializer,
)


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


SHIFT_OFFER_BUZZ_COOLDOWN = timedelta(hours=1)


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
