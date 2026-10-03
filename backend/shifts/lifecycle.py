"""A manager's shift lists (active, confirmed, history), shift detail and the rate preview.

Rate-preview failures keep logging to the 'shifts.browse' channel, which operators and the public error-surface
tests read."""
from rest_framework import status
from organizations.models import (
    Chain,
    Pharmacy,
)
from memberships.models import (
    FAVORITE_STAFF_EMPLOYMENT_TYPES,
    PHARMACY_STAFF_EMPLOYMENT_TYPES,
)
from onboarding.models import OwnerOnboarding
from shifts.models import (
    Shift,
    ShiftOffer,
    ShiftSlot,
)
from rest_framework.response import Response
from rest_framework.exceptions import NotFound
from rest_framework.decorators import action
from django.shortcuts import get_object_or_404
from django.db.models import (
    Count,
    Q,
)
from django.utils import timezone
from shifts.pricing import expand_shift_slots
from datetime import date
from shifts.access import _shift_roles_visible_to_user
from decimal import Decimal
from users.models import (
    OrganizationMembership,
    User,
)
from organizations.access import managed_pharmacies as managed_pharmacies_for
from shifts.base import BaseShiftViewSet
from shifts.selectors import (
    _matching_shift_slot_exists,
    shifts_managed_by,
)
from shifts.candidates import assigned_profile
import logging

logger = logging.getLogger("shifts.browse")


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

        qs = shifts_managed_by(qs, user)

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
        return Shift.objects.filter(id__in=open_ids).prefetch_related('slots', 'slot_assignments', 'offers')

    @action(detail=True, methods=['get'])
    def member_status(self, request, pk=None):
        shift = self.get_object()
        return self._build_member_status_response(request, shift)


class AssignedProfileActions:
    """The view_assigned_profile action of the confirmed and history lists: a manager opens the profile of a worker
    assigned to the shift (audited, no reveal quota, no e-mail)."""

    @action(detail=True, methods=['post'], url_path='view_assigned_profile')
    def view_assigned_profile(self, request, pk=None):
        shift = self.get_object()
        user_id = request.data.get('user_id')
        if user_id is None:
            return Response({'detail': 'user_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        candidate = get_object_or_404(User, pk=user_id)
        slot_id = request.data.get('slot_id')
        slot = get_object_or_404(ShiftSlot, pk=slot_id, shift=shift) if slot_id is not None else None
        return Response(assigned_profile(request=request, shift=shift, candidate=candidate, slot_id=slot_id, slot=slot))


class ConfirmedShiftViewSet(AssignedProfileActions, BaseShiftViewSet):
    """Upcoming & in-progress shifts with at least one confirmed slot."""
    def get_queryset(self):
        user  = self.request.user
        now   = timezone.now()
        today = date.today()

        qs = super().get_queryset()

        qs = shifts_managed_by(qs, user)
        qs = qs.annotate(
            has_confirmed_slot=_matching_shift_slot_exists(
                now=now,
                today=today,
                state='confirmed',
            )
        ).filter(has_confirmed_slot=True)

        return qs


class HistoryShiftViewSet(AssignedProfileActions, BaseShiftViewSet):
    """History shifts for managed pharmacies."""
    def get_queryset(self):
        user = self.request.user
        now  = timezone.now()
        today = date.today()

        qs = super().get_queryset()

        qs = shifts_managed_by(qs, user)

        qs = qs.annotate(
            has_history_slot=_matching_shift_slot_exists(
                now=now,
                today=today,
                state='history',
            )
        ).filter(has_history_slot=True)

        return qs


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
        managed_pharmacies = managed_pharmacies_for(user)
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
