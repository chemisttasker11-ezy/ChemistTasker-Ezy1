"""Roster API (V1): owner and manager roster views, shift assignment and the worker roster."""
from rest_framework import permissions, status, viewsets
from memberships.models import Membership
from organizations.models import Pharmacy
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment
from workforce.models import RosterPeriod
from memberships.serializers import MembershipSerializer
from workforce.roster.serializers import RosterAssignmentSerializer
from shifts.serializers import OpenShiftSerializer, ShiftSerializer
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError as DRFValidationError
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.decorators import action
from organizations.access import (
    CAPABILITY_MANAGE_ROSTER,
    has_admin_capability,
    is_any_admin,
    pharmacies_user_admins,
)
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q
from shifts.pricing import get_locked_rate_for_slot
from shifts.limits import enforce_public_shift_daily_limit
from shifts.notifications import notify_shift_users
from shifts.engagement import staff_assignment_defaults
from datetime import date, datetime
from django.db import transaction
from datetime import timedelta
from users.models import OrganizationMembership, User
from organizations.access import user_can_manage_pharmacy
from shifts.escalation import PUBLIC_LEVEL, apply_escalation, resolve_current_index


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
        The request is validated first: a refused escalation leaves the assignments in place.
        """
        shift = self.get_object()

        if not user_can_manage_pharmacy(request.user, shift.pharmacy):
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        allowed_tiers = self.serializer_class.build_allowed_tiers(shift.pharmacy)
        if not allowed_tiers:
            return Response({'detail': 'No escalation tiers available for this pharmacy.'}, status=status.HTTP_400_BAD_REQUEST)

        current_index = resolve_current_index(shift, allowed_tiers)

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

        try:
            with transaction.atomic():   # the assignments are cleared together with the escalation, or not at all
                shift.slot_assignments.all().delete()
                visibility = apply_escalation(shift, allowed_tiers, target_index)
        except DjangoValidationError as exc:   # e.g. the shift belongs to a published roster
            raise DRFValidationError(getattr(exc, "message_dict", {"detail": exc.messages})) from exc
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
