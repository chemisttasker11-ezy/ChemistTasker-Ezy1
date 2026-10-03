"""Shift browsing API: community, public, active, confirmed and history shift lists, details and description templates."""
from rest_framework import generics, permissions, status, viewsets
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
    OwnerOnboarding,
    PharmacistOnboarding,
)
from shifts.models import (
    Shift,
    ShiftDescriptionTemplate,
    ShiftInterest,
    ShiftOffer,
    ShiftProfileAccessAudit,
    ShiftRejection,
    ShiftSlot,
    ShiftSlotAssignment,
)
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import NotFound, PermissionDenied as DRFPermissionDenied, ValidationError
from rest_framework.decorators import action
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.db.models import Count, F, Q
from django.utils import timezone
from shifts.pricing import expand_shift_slots, get_locked_rate_for_slot
from shifts.emails import build_roster_email_link, build_shift_email_context
from django.conf import settings
from core.task_queue import async_task
from datetime import date
from zoneinfo import ZoneInfo
from shifts.access import _normalized_role_code, IsPharmacistOrOtherStaff
from django.db import transaction
from decimal import Decimal
import uuid
from users.models import OrganizationMembership, User
from shifts.base import (
    _log_shift_profile_access,
    _matching_shift_slot_exists,
    _shift_roles_visible_to_user,
    _user_can_perform_shift_role,
    BaseShiftViewSet,
    COMMUNITY_LEVELS,
    PUBLIC_LEVEL,
)
from shifts.serializers import (
    MyShiftSerializer,
    SharedShiftSerializer,
    ShiftDescriptionTemplateSerializer,
)
import logging

logger = logging.getLogger(__name__)


def _claim_refused(request, shift, reason, detail, code, status_code=status.HTTP_403_FORBIDDEN, **context):
    """Public response of a refused shift claim: a stable message and code. The internal reason goes to the log."""
    logger.info(
        "Shift claim refused: reason=%s user_id=%s shift_id=%s context=%s",
        reason,
        getattr(request.user, "id", None),
        getattr(shift, "id", None),
        context,
    )
    return Response({"detail": detail, "code": code}, status=status_code)


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
        A refusal returns a stable `detail` and `code`; the internal reason is logged.
        """

        try:
            shift = self.get_object()
        except (Http404, DRFPermissionDenied, DjangoPermissionDenied):
            return _claim_refused(
                request, None, "shift_lookup_refused",
                "You do not have permission to access this shift.", "shift_not_accessible",
                shift_pk=pk,
            )
        except Exception:
            logger.exception(
                "Shift claim lookup failed: user_id=%s shift_pk=%s", getattr(request.user, "id", None), pk
            )
            return Response(
                {"detail": "You do not have permission to access this shift.", "code": "shift_not_accessible"},
                status=status.HTTP_403_FORBIDDEN,
            )


        user = request.user
        slot_id = request.data.get('slot_id')


        # --- 1. Visibility check ---
        is_eligible = self.get_queryset().filter(pk=shift.pk).exists()
        if not is_eligible:
            return _claim_refused(
                request, shift, "not_eligible_visibility",
                "You do not have permission to perform this action.", "shift_not_visible",
            )

        # --- 2. Membership verification (reachable through OWNER_CHAIN / ORG_CHAIN visibility) ---
        membership = Membership.objects.filter(
            user=user,
            pharmacy=shift.pharmacy,
            is_active=True,
        ).first()

        if not membership:
            return _claim_refused(
                request, shift, "not_member",
                "You must be an active member of this pharmacy to claim this shift.", "shift_claim_not_member",
            )
        # --- 3. Tier eligibility ---
        # The community queryset already admits only the eligible tiers for FULL_PART_TIME and LOCUM_CASUAL shifts
        # (shifts/test_claim_eligibility.py). Locum and shift-hero members must take the offer path instead.
        if membership and membership.employment_type in FAVORITE_STAFF_EMPLOYMENT_TYPES:
            return Response(
                {
                    "detail": (
                        "Locum and Shift Hero workers must express interest and accept the final shift offer "
                        "so ABN/TFN engagement terms are recorded before assignment."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # --- 4. Role match check ---
        user_role = getattr(user, 'role', None)
        onboarding_role = None

        if user_role == 'OTHER_STAFF':
            try:
                onboarding = OtherStaffOnboarding.objects.get(user=user)
                onboarding_role = onboarding.role_type
            except OtherStaffOnboarding.DoesNotExist:
                return _claim_refused(
                    request, shift, "no_otherstaff_onboarding",
                    "Cannot determine your specific role. Please complete your onboarding.",
                    "shift_claim_onboarding_incomplete",
                )

        effective_user_role = _normalized_role_code(onboarding_role or user_role)
        if not _user_can_perform_shift_role(user, shift.role_needed):
            return _claim_refused(
                request, shift, "role_mismatch",
                f"This shift requires a {shift.role_needed}, but your role is {effective_user_role}.",
                "shift_claim_role_mismatch",
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
            except Exception:
                logger.exception("Shift claim notification failed: shift_id=%s", shift.id)


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


class ShiftDetailViewSet(BaseShiftViewSet):
    @action(detail=False, methods=['post'], url_path='calculate-rates')
    def calculate_rates(self, request):
        from shifts.pricing import calculate_shift_rates
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
            if not isinstance(slot, dict):
                results.append({"error": "Invalid slot payload", "rate": "0.00"})
                continue
            try:
                slot_date_raw = slot.get('date')
                start_raw = slot.get('startTime') or slot.get('start_time')
                end_raw = slot.get('endTime') or slot.get('end_time')
                s_start = parse_time(start_raw)
                s_end = parse_time(end_raw)
                if not (slot_date_raw and s_start and s_end):
                    results.append({"error": "Invalid slot payload", "rate": "0.00"})
                    continue

                try:
                    s_date = dt_cls.strptime(slot_date_raw, '%Y-%m-%d').date()
                except ValueError as exc:
                    # This is the caller's input error, so the parser message is safe and useful.
                    results.append({"error": str(exc), "rate": "0.00"})
                    continue

                try:
                    rate, meta = calculate_shift_rates(mock_shift, s_date, s_start, s_end)
                    results.append({"rate": str(rate), "meta": meta})
                except Exception:
                    # Pricing internals (including ValueError details) are never part of the public contract.
                    logger.exception("Shift rate preview failed for a slot")
                    results.append({"error": "Unable to calculate the rate for this slot.", "rate": "0.00"})
            except Exception:
                logger.exception("Shift rate preview failed while preparing a slot")
                results.append({"error": "Unable to calculate the rate for this slot.", "rate": "0.00"})

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
