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
from organizations.access import (
    CAPABILITY_MANAGE_ROSTER,
    has_admin_capability,
    managed_pharmacies,
    pharmacies_user_admins,
    user_can_manage_pharmacy,
)
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
    resolve_current_index,
)
from shifts.assignment import (  # noqa: F401  (OFFER_EXPIRY_HOURS, _slot_locked_for_shift_offer: historical import path)
    OFFER_EXPIRY_HOURS,
    offer_shift,
    roster_direct_staff,
    slot_locked_for_shift_offer as _slot_locked_for_shift_offer,
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
from users.models import OrganizationMembership, User
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
            enforce_public_shift_daily_limit(shift.pharmacy)

        visibility = self._apply_escalation(shift, allowed_tiers, target_index)
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

        offer_slot_ids = list(offer.slots.values_list('slot_id', flat=True))

        if slot_id is None:
            if offer_slot_ids:
                unassigned_offer_slots = [
                    sid for sid in offer_slot_ids
                    if not ShiftSlotAssignment.objects.filter(slot_id=sid).exists()
                ]
                slot_id = unassigned_offer_slots[0] if unassigned_offer_slots else offer_slot_ids[0]

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
        if not user_can_manage_pharmacy(request.user, shift.pharmacy):
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
        return Response(roster_direct_staff(shift=shift, candidate=candidate, assignments=assignments), status=200)



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
