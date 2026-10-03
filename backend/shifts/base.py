"""Base viewset shared by the shift viewsets."""
import logging

log = logging.getLogger(__name__)


from rest_framework import permissions, status, viewsets
from organizations.models import (
    Chain,
    Pharmacy,
)
from memberships.models import (
    FAVORITE_STAFF_EMPLOYMENT_TYPES,
    Membership,
    PHARMACY_STAFF_EMPLOYMENT_TYPES,
)
from onboarding.models import (
    OtherStaffOnboarding,
    PharmacistOnboarding,
)
from shifts.models import (
    Shift,
    ShiftCounterOffer,
    ShiftInterest,
    ShiftOffer,
    ShiftProfileAccessAudit,
    ShiftRejection,
    ShiftSlot,
    ShiftSlotAssignment,
)
from rest_framework.response import Response
from rest_framework.permissions import SAFE_METHODS
from rest_framework.exceptions import NotFound, ValidationError
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.decorators import action
from organizations.access import managed_pharmacies, user_can_manage_pharmacy
from users.serializers import UserProfileSerializer
from django.shortcuts import get_object_or_404
from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone
from shifts.emails import (
    build_counter_offer_shift_details,
    build_offer_shift_details,
    build_shift_counter_offer_context,
    build_shift_email_context,
    build_shift_interest_context,
    build_shift_offer_context,
    worker_offer_url,
)
from shifts.escalation import (  # noqa: F401  (COMMUNITY_LEVELS, PUBLIC_LEVEL, ESCALATION_FIELD_MAP: historical import path)
    COMMUNITY_LEVELS,
    ESCALATION_FIELD_MAP,
    PUBLIC_LEVEL,
    apply_escalation,
    auto_escalate_due_shifts,
    escalate_shift,
    issue_share_token,
    resolve_current_index,
)
from shifts.assignment import (  # noqa: F401  (OFFER_EXPIRY_HOURS, _slot_locked_for_shift_offer: historical import path)
    OFFER_EXPIRY_HOURS,
    offer_shift,
    roster_direct_staff,
    slot_locked_for_shift_offer as _slot_locked_for_shift_offer,
)
from shifts.counter_offers import (
    accept_counter_offer,
    announce_counter_offer,
    ensure_interest_for_counter_offer,
    reject_counter_offer,
)
from shifts.selectors import (  # noqa: F401  (historical import path)
    _future_or_current_slot_q,
    _matching_shift_slot_exists,
    _past_slot_q,
    _shift_has_past_slot_exists,
)
from shifts.candidates import _log_shift_profile_access, member_status, reveal_candidate  # noqa: F401  (_log_shift_profile_access: historical import path)
from shifts.interest import express_interest, is_public_shift_member_access, reject_shift
from shifts.limits import enforce_public_shift_daily_limit
from shifts.notifications import notify_shift_managers, notify_shift_users
from shifts.engagement import staff_assignment_defaults
from core.task_queue import async_task
from datetime import datetime
from shifts.access import (  # noqa: F401  (role rules re-exported at their historical path)
    ALL_OTHER_STAFF_SHIFT_ROLES,
    NON_INTERN_OTHER_STAFF_SHIFT_ROLES,
    _get_request_ip,
    _normalized_role_code,
    _otherstaff_onboarding_role,
    _shift_roles_visible_to_user,
    _user_can_perform_shift_role,
)
from datetime import timedelta
from decimal import Decimal
import uuid
from users.models import User
from shifts.serializers import (
    ShiftCounterOfferSerializer,
    ShiftInterestSerializer,
    ShiftRejectionSerializer,
    ShiftSerializer,
    ShiftSlotSerializer,
)


SHIFT_OFFER_BUZZ_COOLDOWN = timedelta(hours=1)


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

        if user_can_manage_pharmacy(user, pharmacy):
            return

        self.permission_denied(request)

    # Historical entry points: the rules are owned by organizations.access.
    _user_can_manage_pharmacy = staticmethod(user_can_manage_pharmacy)
    _managed_pharmacies = staticmethod(managed_pharmacies)

    @staticmethod
    def _worker_role_for_shift(user):
        role = getattr(user, 'role', None)
        if role == 'OTHER_STAFF':
            return _otherstaff_onboarding_role(user)
        return _normalized_role_code(role)

    # Historical entry point: owned by shifts.interest.
    _is_public_shift_member_access = staticmethod(is_public_shift_member_access)

    def get_queryset(self):
        now = timezone.now()
        self._auto_escalate_shifts(now)
        qs = Shift.objects.all().annotate(interested_users_count=Count('interests'))
        user = self.request.user
        if getattr(user, "role", None) in ["PHARMACIST", "OTHER_STAFF", "EXPLORER"]:
            qs = qs.filter(Q(dedicated_user__isnull=True) | Q(dedicated_user=user))
        return qs

    def _auto_escalate_shifts(self, now):
        auto_escalate_due_shifts(now, tiers_for=self.serializer_class.build_allowed_tiers)

    # Historical entry points: escalation is owned by shifts.escalation.
    _resolve_current_index = staticmethod(resolve_current_index)
    _apply_escalation = staticmethod(apply_escalation)

    def _build_member_status_response(self, request, shift):
        return Response(member_status(
            shift=shift,
            requested_visibility=request.query_params.get('visibility'),
            slot_id=request.query_params.get('slot_id'),
            slot_date=request.query_params.get('slot_date'),
            request=request,
        ))

    @action(detail=True, methods=['post'])
    def escalate(self, request, pk=None):
        shift = self.get_object()
        user = request.user

        if not user_can_manage_pharmacy(user, shift.pharmacy):
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        allowed_tiers = self.serializer_class.build_allowed_tiers(shift.pharmacy)
        if not allowed_tiers:
            return Response({'detail': 'No escalation tiers available for this pharmacy.'}, status=status.HTTP_400_BAD_REQUEST)

        visibility = escalate_shift(
            shift, allowed_tiers=allowed_tiers, target_visibility=request.data.get('target_visibility'),
        )
        return Response({'detail': f'Shift escalated to {visibility}.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def express_interest(self, request, pk=None):
        shift = self.get_queryset().filter(pk=pk).distinct().first()
        if not shift:
            raise NotFound("Shift not found.")
        slot_ids = request.data.get('slot_ids')
        if slot_ids is None:
            slot_ids = request.data.get('slotIds')
        slot_id = request.data.get('slot_id')
        if slot_id is None:
            slot_id = request.data.get('slotId')
        interests, created_interests = express_interest(
            shift=shift, user=request.user, slot_ids=slot_ids, slot_id=slot_id,
        )
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
        return Response(reveal_candidate(request=request, shift=shift, candidate=candidate, slot_id=slot_id, slot=slot))

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

        return Response(offer_shift(shift=shift, candidate=candidate, slot_id=slot_id), status=status.HTTP_200_OK)

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
            from shifts.counter_offers import visible_counter_offers_for_shift
            offers = visible_counter_offers_for_shift(
                shift=shift,
                user=request.user,
                can_manage_pharmacy=user_can_manage_pharmacy(request.user, shift.pharmacy),
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
            from shifts.counter_offers import visible_counter_offers_for_shift
            offers = visible_counter_offers_for_shift(
                shift=shift,
                user=request.user,
                can_manage_pharmacy=user_can_manage_pharmacy(request.user, shift.pharmacy),
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
        offer = serializer.save()

        announce_counter_offer(shift=shift, user=request.user, offer=offer)
        output = ShiftCounterOfferSerializer(offer, context={'request': request, 'shift': shift})
        return Response(output.data, status=status.HTTP_201_CREATED)

    # Historical entry point: owned by shifts.counter_offers.
    _ensure_interest_for_counter_offer = staticmethod(ensure_interest_for_counter_offer)

    @action(detail=True, methods=['post'], url_path='counter-offers/(?P<offer_id>[^/.]+)/accept')
    def accept_counter_offer(self, request, pk=None, offer_id=None):
        shift = self.get_object()
        if not user_can_manage_pharmacy(request.user, shift.pharmacy):
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        offer = get_object_or_404(ShiftCounterOffer, pk=offer_id, shift=shift)

        slot_id = request.data.get('slot_id')
        if slot_id in (None, ''):
            slot_id = request.data.get('slotId')
        if slot_id in ('', 'null'):
            slot_id = None
        if isinstance(slot_id, str) and slot_id.isdigit():
            slot_id = int(slot_id)

        return Response(
            accept_counter_offer(shift=shift, offer=offer, slot_id=slot_id, decided_by=request.user),
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['post'], url_path='counter-offers/(?P<offer_id>[^/.]+)/reject')
    def reject_counter_offer(self, request, pk=None, offer_id=None):
        shift = self.get_object()
        if not user_can_manage_pharmacy(request.user, shift.pharmacy):
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        offer = get_object_or_404(ShiftCounterOffer, pk=offer_id, shift=shift)
        reject_counter_offer(shift=shift, offer=offer, decided_by=request.user)
        return Response({'detail': 'Counter offer rejected.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        shift = self.get_object()
        slot_ids = request.data.get('slot_ids')
        if slot_ids is None:
            slot_ids = request.data.get('slotIds')
        slot_id = request.data.get('slot_id')
        if slot_id is None:
            slot_id = request.data.get('slotId')
        rejections, created_rejections = reject_shift(
            shift=shift,
            user=request.user,
            slot_ids=slot_ids,
            slot_id=slot_id,
            slot_date=request.data.get('slot_date'),  # required if recurring
        )
        serializer = ShiftRejectionSerializer(rejections, many=True) if len(rejections) > 1 else ShiftRejectionSerializer(rejections[0])
        return Response(serializer.data, status=status.HTTP_201_CREATED if created_rejections else status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='generate-share-link')
    def generate_share_link(self, request, pk=None):
        shift = self.get_object()
        return Response({'share_token': str(issue_share_token(shift))})

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
        return Response(roster_direct_staff(shift=shift, candidate=candidate, assignments=assignments), status=200)
