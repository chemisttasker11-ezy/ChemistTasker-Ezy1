"""Shift discovery API: the community and public shift lists, claiming a community shift, the public job board and
shared shift links.

The manager lists and shift detail live in shifts.lifecycle, a worker's own shifts in shifts.my_shifts and
description templates in shifts.description_templates; their historical names are re-exported here."""
from rest_framework import generics, permissions, status
from organizations.models import Pharmacy
from memberships.models import (
    FAVORITE_STAFF_EMPLOYMENT_TYPES,
    Membership,
    PHARMACY_STAFF_EMPLOYMENT_TYPES,
)
from onboarding.models import OtherStaffOnboarding
from shifts.models import Shift, ShiftInterest, ShiftRejection, ShiftSlot, ShiftSlotAssignment
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import NotFound, PermissionDenied as DRFPermissionDenied, ValidationError
from rest_framework.decorators import action
from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.db.models import Count, F, Q
from django.utils import timezone
from shifts.pricing import get_locked_rate_for_slot
from shifts.emails import build_roster_email_link, build_shift_email_context
from django.conf import settings
from core.task_queue import async_task
from datetime import date
from zoneinfo import ZoneInfo
from shifts.access import (
    _normalized_role_code,
    _shift_roles_visible_to_user,
    _user_can_perform_shift_role,
)
from django.db import transaction
import uuid
from shifts.base import BaseShiftViewSet
from shifts.escalation import COMMUNITY_LEVELS, PUBLIC_LEVEL
from shifts.serializers import SharedShiftSerializer
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


        # Keep the direct membership snapshot stable through visibility revalidation and assignment.
        # The community queryset remains the single owner of tier eligibility; the row lock prevents a concurrent
        # membership update from making that queryset and the favorite-worker handling observe different tiers.
        with transaction.atomic():
            # --- 1. Membership verification (reachable through OWNER_CHAIN / ORG_CHAIN visibility) ---
            membership = Membership.objects.select_for_update().filter(
                user=user,
                pharmacy=shift.pharmacy,
                is_active=True,
            ).first()

            if not membership:
                return _claim_refused(
                    request, shift, "not_member",
                    "You must be an active member of this pharmacy to claim this shift.", "shift_claim_not_member",
                )

            # --- 2. Revalidate visibility using the locked membership state ---
            # get_object() already scoped the initial lookup through get_queryset(); this second check protects the
            # mutation path against membership changes between the initial lookup and the claim.
            is_eligible = self.get_queryset().filter(pk=shift.pk).exists()
            if not is_eligible:
                return _claim_refused(
                    request, shift, "not_eligible_visibility",
                    "You do not have permission to perform this action.", "shift_not_visible",
                )

            # --- 3. Tier handling ---
            # Locum and shift-hero members use the offer path. No duplicate visibility-tier matrix lives here.
            if membership.employment_type in FAVORITE_STAFF_EMPLOYMENT_TYPES:
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
                return Response(
                    {"detail": "No valid slots found to claim for this shift."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # --- 7. Create assignments ---
            assignment_ids = []
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


# Historical import path of the views that moved to their own modules.
from shifts.description_templates import ShiftDescriptionTemplateViewSet  # noqa: E402,F401
from shifts.lifecycle import (  # noqa: E402,F401
    ActiveShiftViewSet,
    AssignedProfileActions,
    ConfirmedShiftViewSet,
    HistoryShiftViewSet,
    ShiftDetailViewSet,
)
from shifts.my_shifts import MyConfirmedShiftsViewSet, MyHistoryShiftsViewSet  # noqa: E402,F401
