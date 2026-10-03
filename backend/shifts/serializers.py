"""Serializers for shifts, slots, interests, offers, counter-offers and the worker's own shifts."""
import logging
from django.contrib.auth import get_user_model

logger = logging.getLogger(__name__)
User = get_user_model()


from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from organizations.models import (
    Chain,
)
from onboarding.models import (
    ExplorerOnboarding,
    OtherStaffOnboarding,
    PharmacistOnboarding,
)
from memberships.models import (
    Membership,
)
from shifts.models import (
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
    WorkerShiftRequest,
)
from talent.models import UserAvailability
from django.db import transaction
from decimal import Decimal
from shifts.emails import (
    build_offer_shift_details,
    build_shift_email_context,
    build_shift_offer_context,
    send_shift_updated_notifications,
)
from shifts.escalation import ESCALATION_FIELD_MAP, allowed_tiers
from shifts.limits import enforce_public_shift_daily_limit
from shifts.pricing import expand_shift_slots
from organizations.access import CAPABILITY_MANAGE_ROSTER, has_admin_capability
from shifts.notifications import notify_shift_users
from datetime import date, datetime, time, timedelta
from django.utils import timezone
from core.task_queue import async_task
import math
from users.presentation import _get_user_short_bio
from organizations.serializers import (
    anonymize_pharmacy_detail,
    PharmacySerializer,
    user_can_view_full_pharmacy,
)
from shifts.travel import (
    extract_suburb_from_travel_origin,
    extract_travel_origin_from_message,
    TRAVEL_ORIGIN_PREFIX,
)
from shifts.assignment import OFFER_EXPIRY_HOURS  # noqa: F401  (historical import path)
from shifts.announcements import SHIFT_EMAIL_RECIPIENT_CAP  # noqa: F401  (historical import path)
from shifts.posting import (
    ensure_escalation_stamps,
    normalize_money_value,
    normalize_slots_payload,
    post_shift,
    revise_shift,
)
from shifts.travel import haversine_km



class ShiftDescriptionTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShiftDescriptionTemplate
        fields = [
            "id",
            "pharmacy",
            "role_needed",
            "description",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "updated_by", "created_at", "updated_at"]

    def validate_description(self, value):
        return (value or "").strip()


# === Shifts ===
class ShiftSlotSerializer(serializers.ModelSerializer):
    recurring_days = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6),
        required=False,
        allow_empty=True
    )
    recurring_end_date = serializers.DateField(required=False, allow_null=True)
    start_hour = serializers.SerializerMethodField()
    awaiting_payment = serializers.SerializerMethodField()
    awaiting_payment_offer_id = serializers.SerializerMethodField()
    is_locked = serializers.SerializerMethodField()
    locked_by_offer_id = serializers.SerializerMethodField()
    confirmed_assignment_id = serializers.SerializerMethodField()

    class Meta:
        model = ShiftSlot
        fields = [
            'id', 'date', 'start_time', 'end_time', 'rate', 'start_hour',
            'is_recurring', 'recurring_days', 'recurring_end_date',
            'roster_period', 'planned_break_minutes',
            'awaiting_payment', 'awaiting_payment_offer_id',
            'is_locked', 'locked_by_offer_id', 'confirmed_assignment_id',
        ]

    def get_start_hour(self, obj):
        if not obj.start_time:
            return None
        return obj.start_time.hour

    def _pending_payment_offer(self, obj):
        return ShiftOffer.objects.filter(
            shift_id=obj.shift_id,
            slot_id=obj.id,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
        ).order_by('-updated_at').first()

    def _confirmed_assignment(self, obj):
        return ShiftSlotAssignment.objects.filter(
            shift_id=obj.shift_id,
            slot_id=obj.id,
        ).order_by('-assigned_at').first()

    def get_awaiting_payment(self, obj):
        return self._pending_payment_offer(obj) is not None

    def get_awaiting_payment_offer_id(self, obj):
        offer = self._pending_payment_offer(obj)
        return offer.id if offer else None

    def get_confirmed_assignment_id(self, obj):
        assignment = self._confirmed_assignment(obj)
        return assignment.id if assignment else None

    def get_locked_by_offer_id(self, obj):
        payment_offer = self._pending_payment_offer(obj)
        if payment_offer:
            return payment_offer.id
        return None

    def get_is_locked(self, obj):
        return (
            self.get_confirmed_assignment_id(obj) is not None
            or self.get_locked_by_offer_id(obj) is not None
        )


class ShiftSerializer(serializers.ModelSerializer):
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    dedicated_user = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        required=False,
        allow_null=True
    )
    slots = serializers.SerializerMethodField()
    interested_users_count = serializers.IntegerField(read_only=True)
    pharmacy = serializers.PrimaryKeyRelatedField(
        write_only=True,
        queryset=Shift._meta.get_field('pharmacy').related_model.objects.all()
    )
    # read‐only nested for listing
    pharmacy_detail = PharmacySerializer(source='pharmacy', read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

    # for multi-slot shifts
    slot_assignments = serializers.SerializerMethodField()
    pending_payment_slot_ids = serializers.SerializerMethodField()
    payment_options = serializers.SerializerMethodField()

    role_label = serializers.SerializerMethodField()
    ui_is_negotiable = serializers.SerializerMethodField()
    ui_is_flexible_time = serializers.SerializerMethodField()
    ui_allow_partial = serializers.SerializerMethodField()
    ui_location_city = serializers.SerializerMethodField()
    ui_location_state = serializers.SerializerMethodField()
    ui_address_line = serializers.SerializerMethodField()
    ui_distance_km = serializers.SerializerMethodField()
    ui_is_urgent = serializers.SerializerMethodField()

    # fixed_rate = serializers.DecimalField(max_digits=6, decimal_places=2)
    owner_adjusted_rate = serializers.DecimalField(max_digits=6,decimal_places=2,required=False,allow_null=True)

    allowed_escalation_levels = serializers.SerializerMethodField()
    is_single_user = serializers.BooleanField(source='single_user_only', read_only=True)
    notify_pharmacy_staff = serializers.BooleanField(write_only=True, required=False, default=False)
    notify_favorite_staff = serializers.BooleanField(write_only=True, required=False, default=False)
    notify_chain_members = serializers.BooleanField(write_only=True, required=False, default=False)
    apply_rates_to_pharmacy = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = Shift
        fields = [
            'id', 'created_by','created_at', 'pharmacy',  'pharmacy_detail', 'dedicated_user', 'role_needed', 'employment_type', 'visibility',
            'escalation_level', 'escalate_to_owner_chain', 'escalate_to_org_chain', 'escalate_to_platform',
            'must_have', 'nice_to_have', 'rate_type', 'fixed_rate', 'owner_adjusted_rate','slots','single_user_only',
            'post_anonymously',
            'escalate_to_locum_casual',
            'interested_users_count', 'reveal_quota', 'reveal_count', 'workload_tags','slot_assignments',
            'pending_payment_slot_ids', 'payment_options',
            'allowed_escalation_levels','is_single_user', 'description',
            'flexible_timing',
            'min_hourly_rate', 'max_hourly_rate', 'min_annual_salary', 'max_annual_salary', 'super_percent',
            'payment_preference',
            'has_travel', 'has_accommodation', 'is_urgent',
            'role_label', 'ui_is_negotiable', 'ui_is_flexible_time', 'ui_allow_partial',
            'ui_location_city', 'ui_location_state', 'ui_address_line', 'ui_distance_km', 'ui_is_urgent',
            'notify_pharmacy_staff', 'notify_favorite_staff', 'notify_chain_members',
            'apply_rates_to_pharmacy',
            'payment_status',
        ]
        read_only_fields = [
            'id', 'created_by', 'escalation_level',
            'interested_users_count', 'reveal_count',
            'allowed_escalation_levels']

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get('request')

        # Only restrict rate fields on write methods
        if request and request.method in ['POST', 'PUT', 'PATCH']:
            # ⬇️ replace this line:
            # role = request.data.get('role_needed') or self.initial_data.get('role_needed')

            # ⬇️ with this guarded version (so schema gen doesn't crash):
            idata = getattr(self, 'initial_data', {}) or {}
            req_role = getattr(request, 'data', {}).get('role_needed') if hasattr(request, 'data') else None
            role = req_role or idata.get('role_needed')

            if role != 'PHARMACIST':
                fields.pop('fixed_rate', None)
                fields.pop('rate_type', None)

        return fields

    def validate(self, attrs):
        attrs = super().validate(attrs)
        employment_type = attrs.get('employment_type') or getattr(self.instance, 'employment_type', None)
        min_hour = attrs.get('min_hourly_rate') if 'min_hourly_rate' in attrs else getattr(self.instance, 'min_hourly_rate', None)
        max_hour = attrs.get('max_hourly_rate') if 'max_hourly_rate' in attrs else getattr(self.instance, 'max_hourly_rate', None)
        min_annual = attrs.get('min_annual_salary') if 'min_annual_salary' in attrs else getattr(self.instance, 'min_annual_salary', None)
        max_annual = attrs.get('max_annual_salary') if 'max_annual_salary' in attrs else getattr(self.instance, 'max_annual_salary', None)
        super_percent = attrs.get('super_percent') if 'super_percent' in attrs else getattr(self.instance, 'super_percent', None)

        # Default flexible_timing to True for FT/PT if not explicitly provided
        if employment_type in ['FULL_TIME', 'PART_TIME'] and 'flexible_timing' not in attrs:
            attrs['flexible_timing'] = True

        if employment_type in ['FULL_TIME', 'PART_TIME']:
            has_hourly = min_hour is not None or max_hour is not None
            has_annual = min_annual is not None or max_annual is not None
            if not has_hourly and not has_annual:
                raise serializers.ValidationError('Provide hourly or annual pay for full/part-time shifts.')
            if has_hourly and (min_hour is None or max_hour is None):
                raise serializers.ValidationError('Both min and max hourly are required.')
            if has_hourly and min_hour is not None and max_hour is not None and min_hour > max_hour:
                raise serializers.ValidationError('Min hourly cannot exceed max hourly.')
            if has_annual and (min_annual is None or max_annual is None):
                raise serializers.ValidationError('Both min and max annual are required.')
            if has_annual and min_annual is not None and max_annual is not None and min_annual > max_annual:
                raise serializers.ValidationError('Min annual cannot exceed max annual.')
            if has_annual and super_percent is None:
                raise serializers.ValidationError('Super percent is required when annual package is provided.')
        else:
            # Strip FT/PT pay fields for locum/casual
            for key in ['min_hourly_rate', 'max_hourly_rate', 'min_annual_salary', 'max_annual_salary']:
                attrs.pop(key, None)

        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        if instance.post_anonymously and not user_can_view_full_pharmacy(user, instance.pharmacy):
            data['pharmacy_detail'] = anonymize_pharmacy_detail(data.get('pharmacy_detail'))
        return data

    def get_role_label(self, obj):
        return obj.get_role_needed_display()

    def get_ui_is_negotiable(self, obj):
        return obj.rate_type == 'FLEXIBLE'

    def get_ui_is_flexible_time(self, obj):
        if obj.employment_type in ['FULL_TIME', 'PART_TIME']:
            return True
        return bool(obj.flexible_timing)

    def get_ui_allow_partial(self, obj):
        return not obj.single_user_only

    def get_ui_location_city(self, obj):
        pharmacy = getattr(obj, 'pharmacy', None)
        return getattr(pharmacy, 'suburb', None) if pharmacy else None

    def get_ui_location_state(self, obj):
        pharmacy = getattr(obj, 'pharmacy', None)
        return getattr(pharmacy, 'state', None) if pharmacy else None

    def _get_address_parts(self, pharmacy, *, anonymize=False):
        if not pharmacy:
            return None
        suburb = getattr(pharmacy, 'suburb', None)
        state = getattr(pharmacy, 'state', None)
        postcode = getattr(pharmacy, 'postcode', None)
        street = getattr(pharmacy, 'street_address', None)

        if anonymize:
            parts = [p for p in [suburb, state, postcode] if p]
        else:
            parts = [p for p in [street, suburb, state, postcode] if p]
        return ", ".join(parts) if parts else None

    def get_ui_address_line(self, obj):
        pharmacy = getattr(obj, 'pharmacy', None)
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        anonymize = obj.post_anonymously and not user_can_view_full_pharmacy(user, pharmacy)
        return self._get_address_parts(pharmacy, anonymize=anonymize)

    def _get_user_location(self, user):
        if not user or not getattr(user, "is_authenticated", False):
            return None
        if getattr(user, "role", None) == "PHARMACIST":
            loc = PharmacistOnboarding.objects.filter(user=user).values("latitude", "longitude").first()
            return (loc or {}).get("latitude"), (loc or {}).get("longitude")
        if getattr(user, "role", None) == "OTHER_STAFF":
            loc = OtherStaffOnboarding.objects.filter(user=user).values("latitude", "longitude").first()
            return (loc or {}).get("latitude"), (loc or {}).get("longitude")
        return None

    def _haversine_km(self, lat1, lon1, lat2, lon2):
        return haversine_km(lat1, lon1, lat2, lon2)

    def get_ui_distance_km(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        user_loc = self._get_user_location(user)
        pharmacy = getattr(obj, 'pharmacy', None)
        if not pharmacy or not user_loc:
            return None
        user_lat, user_lon = user_loc
        pharm_lat = getattr(pharmacy, 'latitude', None)
        pharm_lon = getattr(pharmacy, 'longitude', None)
        if user_lat is None or user_lon is None or pharm_lat is None or pharm_lon is None:
            return None
        return round(self._haversine_km(float(user_lat), float(user_lon), float(pharm_lat), float(pharm_lon)), 1)

    def get_ui_is_urgent(self, obj):
        return bool(obj.is_urgent)

    # owned by shifts.escalation
    build_allowed_tiers = staticmethod(allowed_tiers)

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_allowed_escalation_levels(self, obj) -> list[str]:
        return self.build_allowed_tiers(obj.pharmacy)

    # Historical entry point: owned by shifts.posting.
    _ensure_escalation_stamps = staticmethod(ensure_escalation_stamps)

    # Historical entry points: owned by shifts.posting.
    _normalize_money_value = staticmethod(normalize_money_value)

    def _normalize_slots_payload(self, slots_data):
        return normalize_slots_payload(slots_data)

    def _initial_slots_payload(self):
        initial_data = getattr(self, 'initial_data', {}) or {}
        if 'slots' not in initial_data:
            return None
        return initial_data.get('slots') or []

    def create(self, validated_data):
        notify_pharmacy_staff = validated_data.pop('notify_pharmacy_staff', False)
        notify_favorite_staff = validated_data.pop('notify_favorite_staff', False)
        notify_chain_members = validated_data.pop('notify_chain_members', False)
        apply_rates_to_pharmacy = validated_data.pop('apply_rates_to_pharmacy', False)
        slots_payload = self._initial_slots_payload()
        if slots_payload is None:
            raise serializers.ValidationError({'slots': 'This field is required.'})
        slots_data = self._normalize_slots_payload(slots_payload)

        # Build the correct path
        allowed_tiers = self.build_allowed_tiers(validated_data['pharmacy'])

        # Ensure the front-end’s choice is valid
        chosen = validated_data.get('visibility')
        if chosen not in allowed_tiers:
            raise serializers.ValidationError({
                'visibility': f"Invalid choice; must be one of {allowed_tiers}"
            })

        request = self.context.get('request')
        return post_shift(
            validated_data=validated_data,
            slots_data=slots_data,
            created_by=self.context['request'].user,
            allowed_tiers=allowed_tiers,
            request_data=request.data if request and hasattr(request, 'data') else None,
            rate_request_data=getattr(request, 'data', {}),
            notify_pharmacy_staff=notify_pharmacy_staff,
            notify_favorite_staff=notify_favorite_staff,
            notify_chain_members=notify_chain_members,
            apply_rates_to_pharmacy=apply_rates_to_pharmacy,
        )

    def update(self, instance, validated_data):
        validated_data.pop('notify_pharmacy_staff', None)
        validated_data.pop('notify_favorite_staff', None)
        validated_data.pop('notify_chain_members', None)
        apply_rates_to_pharmacy = validated_data.pop('apply_rates_to_pharmacy', False)
        allowed_tiers = None
        if 'visibility' in validated_data:
            allowed_tiers = self.build_allowed_tiers(instance.pharmacy)
            new_vis = validated_data['visibility']
            if new_vis not in allowed_tiers:
                raise serializers.ValidationError({
                    'visibility': f"Invalid choice; must be one of {allowed_tiers}"
                })
        return revise_shift(
            instance,
            validated_data,
            allowed_tiers=allowed_tiers,
            slots_payload=self._initial_slots_payload(),
            rate_request_data=getattr(self.context.get('request'), 'data', {}),
            apply_rates_to_pharmacy=apply_rates_to_pharmacy,
        )

    def get_slots(self, obj): # NEW METHOD
        """
        Active shifts expose only future/unassigned slots. Other shift endpoints
        need the full slot list, especially confirmed/history views.
        """
        request = self.context.get('request')
        path = getattr(request, 'path', '') if request else ''
        resolver_match = getattr(request, 'resolver_match', None) if request else None
        basename = getattr(resolver_match, 'kwargs', {}).get('basename') if resolver_match else None
        is_active_endpoint = basename == 'active-shifts' or '/shifts/active/' in path
        if not is_active_endpoint:
            return ShiftSlotSerializer(obj.slots.all(), many=True).data

        now = timezone.now()
        today = date.today()

        # Get all slots for this shift
        assigned_pairs = {
            (assignment.slot_id, assignment.slot_date)
            for assignment in obj.slot_assignments.all()
        }
        assignment_by_pair = {
            (assignment.slot_id, assignment.slot_date): assignment.id
            for assignment in obj.slot_assignments.all()
        }
        pending_payment_offers = list(obj.offers.filter(
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            slot_id__isnull=False,
        ))
        pending_payment_by_pair = {}
        pending_payment_by_slot = {}
        for offer in pending_payment_offers:
            pending_payment_by_pair.setdefault((offer.slot_id, offer.offered_slot_date), offer.id)
            pending_payment_by_slot.setdefault(offer.slot_id, offer.id)

        filtered_slots = []
        for entry in expand_shift_slots(obj):
            slot = entry.get('slot')
            slot_date = entry.get('date')
            if not slot or not slot_date:
                continue
            slot_is_future = (
                slot_date > today
                or (slot_date == today and slot.end_time >= now.time())
            )
            if not slot_is_future:
                continue
            if (slot.id, slot_date) in assigned_pairs:
                continue
            pending_payment_offer_id = (
                pending_payment_by_pair.get((slot.id, slot_date))
                or pending_payment_by_slot.get(slot.id)
            )
            locked_by_offer_id = pending_payment_offer_id
            filtered_slots.append({
                'id': slot.id,
                'date': slot_date.isoformat(),
                'start_time': slot.start_time.isoformat() if slot.start_time else None,
                'end_time': slot.end_time.isoformat() if slot.end_time else None,
                'start_hour': slot.start_time.hour if slot.start_time else None,
                'rate': str(slot.rate) if slot.rate is not None else None,
                'is_recurring': False,
                'recurring_days': [],
                'recurring_end_date': None,
                'awaiting_payment': pending_payment_offer_id is not None,
                'awaiting_payment_offer_id': pending_payment_offer_id,
                'is_locked': locked_by_offer_id is not None,
                'locked_by_offer_id': locked_by_offer_id,
                'confirmed_assignment_id': assignment_by_pair.get((slot.id, slot_date)),
            })
        
        return filtered_slots

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_slot_assignments(self, shift) -> list[dict]:
        assignments = []
        for assignment in shift.slot_assignments.all():
            user = assignment.user
            user_name = user.get_full_name() or user.email or getattr(user, 'username', '') or 'Assigned candidate'
            assignments.append({
                'slot_id': assignment.slot.id,
                'user_id': user.id,
                'user': {
                    'id': user.id,
                    'first_name': user.first_name,
                    'last_name': user.last_name,
                    'name': user_name,
                    'email': user.email,
                },
            })
        return assignments

    def get_pending_payment_slot_ids(self, shift) -> list[int]:
        qs = ShiftOffer.objects.filter(
            shift=shift,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            slot_id__isnull=False,
        ).values_list('slot_id', flat=True)
        return sorted(set(qs))

    def get_payment_options(self, shift) -> list[dict]:
        offers = ShiftOffer.objects.filter(
            shift=shift,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
        ).select_related('slot', 'user').order_by('offered_slot_date', 'offered_start_time', 'created_at')

        options = []
        for offer in offers:
            user = offer.user
            name = user.get_full_name() or user.email or getattr(user, 'username', '') or 'Participant'
            options.append({
                'offer_id': offer.id,
                'slot_id': offer.slot_id,
                'slot_date': offer.offered_slot_date.isoformat() if offer.offered_slot_date else None,
                'start_time': offer.offered_start_time.isoformat() if offer.offered_start_time else None,
                'end_time': offer.offered_end_time.isoformat() if offer.offered_end_time else None,
                'candidate_user_id': user.id,
                'candidate_name': name,
                'candidate_email': user.email,
            })
        return options


class ShiftInterestSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    user_id  = serializers.IntegerField(source='user.id', read_only=True)
    slot_id  = serializers.IntegerField(source='slot.id', read_only=True)
    slot_time = serializers.SerializerMethodField()
    short_bio = serializers.SerializerMethodField()
    user_detail = serializers.SerializerMethodField()
    revealed = serializers.BooleanField(read_only=True)
    pending_confirmation = serializers.SerializerMethodField()
    pending_offer_id = serializers.SerializerMethodField()
    awaiting_payment = serializers.SerializerMethodField()
    awaiting_payment_offer_id = serializers.SerializerMethodField()

    class Meta:
        model  = ShiftInterest
        fields = [
            'id',
            'shift',
            'slot',
            'slot_id',
            'slot_time',
            'user',
            'user_id',
            'short_bio',
            'user_detail',
            'revealed',
            'expressed_at',
            'pending_confirmation',
            'pending_offer_id',
            'awaiting_payment',
            'awaiting_payment_offer_id',
        ]
        read_only_fields = [
            'id','user','user_id','slot_time','short_bio','user_detail','revealed','expressed_at',
            'pending_confirmation','pending_offer_id','awaiting_payment','awaiting_payment_offer_id'
        ]

    def _matching_offer(self, obj, status_value):
        qs = ShiftOffer.objects.filter(
            shift=obj.shift,
            user=obj.user,
            status=status_value,
        )
        if obj.shift.single_user_only:
            qs = qs.filter(slot__isnull=True)
        else:
            qs = qs.filter(slot=obj.slot)
        return qs.order_by('-updated_at').first()

    def get_pending_confirmation(self, obj):
        return self._matching_offer(obj, ShiftOffer.Status.PENDING) is not None

    def get_pending_offer_id(self, obj):
        offer = self._matching_offer(obj, ShiftOffer.Status.PENDING)
        return offer.id if offer else None

    def get_awaiting_payment(self, obj):
        return self._matching_offer(obj, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT) is not None

    def get_awaiting_payment_offer_id(self, obj):
        offer = self._matching_offer(obj, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
        return offer.id if offer else None

    def get_user(self, obj):
        request = self.context.get('request')
        if obj.shift.visibility == 'PLATFORM' and not obj.revealed:
            # For debugging, return a distinct anonymous string.
            return "Anonymous Interest User"
        # For debugging, return the full name if revealed or not public.
        return obj.user.get_full_name()

    def get_short_bio(self, obj):
        is_public = obj.shift.visibility == 'PLATFORM'
        if is_public and not obj.revealed:
            return None
        return _get_user_short_bio(obj.user)

    def get_user_detail(self, obj):
        is_public = obj.shift.visibility == 'PLATFORM'
        if is_public and not obj.revealed:
            return None
        user = getattr(obj, 'user', None)
        if not user:
            return None
        return {
            'id': user.id,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email,
            'short_bio': _get_user_short_bio(user),
        }

    def get_slot_time(self, obj):
        slot = obj.slot
        if not slot:
            # For debugging, return a default string if slot is None.
            return "N/A Slot Time"
        date_str  = slot.date.strftime('%Y-%m-%d')
        start_str = slot.start_time.strftime('%H:%M')
        end_str   = slot.end_time.strftime('%H:%M')
        return f"{date_str} {start_str}-{end_str}"


class ShiftRejectionSerializer(serializers.ModelSerializer):
    user = serializers.StringRelatedField(read_only=True)
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    slot_id = serializers.IntegerField(source='slot.id', read_only=True)
    class Meta:
        model = ShiftRejection
        fields = [
            'id', 'shift', 'slot', 'slot_id', 'slot_date', 'user', 'user_id', 'rejected_at'
        ]
        read_only_fields = ['id', 'user', 'user_id', 'slot_id', 'rejected_at']


class ShiftCounterOfferSlotSerializer(serializers.ModelSerializer):
    slot_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    slot_date = serializers.DateField(required=False, allow_null=True)
    slot = ShiftSlotSerializer(read_only=True)

    class Meta:
        model = ShiftCounterOfferSlot
        fields = [
            'id',
            'slot_id',
            'slot_date',
            'slot',
            'proposed_start_time',
            'proposed_end_time',
            'proposed_rate',
        ]


class ShiftCounterOfferSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    user_detail = serializers.SerializerMethodField()
    slots = ShiftCounterOfferSlotSerializer(many=True)
    travel_origin = serializers.SerializerMethodField()
    travel_origin_input = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = ShiftCounterOffer
        fields = [
            'id',
            'shift',
            'user',
            'user_detail',
            'travel_origin',
            'travel_origin_input',
            'request_travel',
            'status',
            'slots',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'shift', 'user', 'status', 'created_at', 'updated_at']

    def validate(self, attrs):
        shift = self.context.get('shift')
        slots_data = attrs.get('slots') or []
        if not shift:
            raise serializers.ValidationError('Shift context is required.')
        if not slots_data:
            raise serializers.ValidationError({'slots': 'At least one slot is required.'})
        try:
            # print("[ShiftCounterOfferSerializer.validate] incoming slots", slots_data)
            pass
        except Exception:
            pass

        shift_slots_qs = shift.slots.all()
        shift_slots = {slot.id: slot for slot in shift_slots_qs}
        # Deduplicate pairs up front instead of throwing an error so UI quirks don't block submissions.
        normalized_slots = []
        seen_pairs = {}
        for entry in slots_data:
            slot_id = entry.get('slot_id')
            slot_date = entry.get('slot_date')
            key = (slot_id, slot_date)
            if key in seen_pairs:
                # Keep the first occurrence; ignore later duplicates.
                continue
            seen_pairs[key] = entry
            normalized_slots.append(entry)
        slots_data = normalized_slots

        if shift_slots_qs.exists():
            invalid = [entry.get('slot_id') for entry in slots_data if entry.get('slot_id') is not None and entry.get('slot_id') not in shift_slots]
            if invalid:
                raise serializers.ValidationError({'slots': f'Invalid slot ids: {invalid}'})
            # For single-user shifts, accept a single slot_id to represent the whole shift,
            # or the full set of slot_ids. Do not require every occurrence to be sent.
            if shift.single_user_only:
                if not slots_data:
                    raise serializers.ValidationError({'slots': 'At least one slot is required for single-user shifts.'})
            else:
                provided_ids = {entry.get('slot_id') for entry in slots_data if entry.get('slot_id') is not None}
                if not provided_ids:
                    raise serializers.ValidationError({'slots': 'At least one slot is required for multi-slot counter offers.'})
                # Allow subsets: do not require every slot to be included.
        else:
            # Slotless shift (e.g., FT/PT without slots): allow a single pseudo slot
            if any(entry.get('slot_id') is not None for entry in slots_data):
                raise serializers.ValidationError({'slots': 'Do not send slot_id for slotless shifts.'})
            if len(slots_data) > 1:
                raise serializers.ValidationError({'slots': 'Only one entry is allowed for slotless shifts.'})
            entry = slots_data[0]
            if not entry.get('proposed_start_time') or not entry.get('proposed_end_time'):
                raise serializers.ValidationError({'slots': 'Start and end time are required for slotless shifts.'})

        is_flexible_time = bool(shift.flexible_timing)
        # Allow rate negotiation when shift explicitly flexible OR pharmacist-provided (worker supplies rate)
        is_negotiable = shift.rate_type in ('FLEXIBLE', 'PHARMACIST_PROVIDED')

        for entry in slots_data:
            slot_id = entry.get('slot_id')
            proposed_start = entry.get('proposed_start_time')
            proposed_end = entry.get('proposed_end_time')
            proposed_rate = entry.get('proposed_rate')
            if slot_id is None:
                # slotless case already validated above
                continue
            slot = shift_slots[slot_id]
            if not is_flexible_time:
                if proposed_start != slot.start_time or proposed_end != slot.end_time:
                    raise serializers.ValidationError({
                        'slots': f'Slot {slot.id} does not allow time changes.'
                    })

            if not is_negotiable and proposed_rate is not None:
                reference_rate = slot.rate if slot.rate is not None else shift.fixed_rate
                if reference_rate is None:
                    raise serializers.ValidationError({
                        'slots': f'Slot {slot.id} does not allow rate changes.'
                    })
                if Decimal(str(proposed_rate)) != Decimal(str(reference_rate)):
                    raise serializers.ValidationError({
                        'slots': f'Slot {slot.id} does not allow rate changes.'
                    })

        attrs['slots'] = slots_data
        return attrs

    def create(self, validated_data):
        shift = self.context['shift']
        user = self.context['request'].user
        slots_data = validated_data.pop('slots', [])
        travel_origin = (validated_data.pop('travel_origin_input', '') or '').strip()
        validated_data.setdefault('message', '')
        if travel_origin:
            message = (validated_data.get('message') or '').strip()
            validated_data['message'] = "\n".join(
                part for part in [message, f"{TRAVEL_ORIGIN_PREFIX} {travel_origin}"] if part
            )

        offer = ShiftCounterOffer.objects.create(
            shift=shift,
            user=user,
            **validated_data
        )
        for entry in slots_data:
            slot_id = entry.pop('slot_id', None)
            slot_date = entry.pop('slot_date', None)
            slot = shift.slots.get(id=slot_id) if slot_id else None
            ShiftCounterOfferSlot.objects.create(
                offer=offer,
                slot=slot,
                slot_date=slot_date,
                **entry
            )
        return offer

    def _can_view_user_detail(self, obj):
        shift = getattr(obj, "shift", None)
        user = getattr(obj, "user", None)
        request = self.context.get("request")
        viewer = getattr(request, "user", None)

        if not shift or not user:
            return False

        if shift.visibility != "PLATFORM":
            return True

        if viewer and getattr(viewer, "is_authenticated", False) and viewer.id == user.id:
            return True

        return shift.revealed_users.filter(pk=user.id).exists()

    def get_user_detail(self, obj):
        user = getattr(obj, 'user', None)
        if not user:
            return None
        if not self._can_view_user_detail(obj):
            return None
        return {
            'id': user.id,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email,
            'short_bio': _get_user_short_bio(user),
        }

    def get_travel_origin(self, obj):
        _, travel_origin = extract_travel_origin_from_message(getattr(obj, 'message', '') or '')
        return extract_suburb_from_travel_origin(travel_origin)


class ShiftOfferSerializer(serializers.ModelSerializer):
    shift_detail = ShiftSerializer(source='shift', read_only=True)
    slot_detail = ShiftSlotSerializer(source='slot', read_only=True)
    engagement_terms_preview = serializers.SerializerMethodField()

    def get_engagement_terms_preview(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        can_view = request.user.id == obj.user_id or has_admin_capability(
            request.user, obj.shift.pharmacy, CAPABILITY_MANAGE_ROSTER
        )
        if not can_view:
            return None
        from django.core.exceptions import ValidationError as DjangoValidationError
        from shifts.engagement import build_shift_engagement_terms
        try:
            return build_shift_engagement_terms(shift=obj.shift, user=obj.user, offer=obj)
        except (DjangoValidationError, serializers.ValidationError) as exc:
            # the terms are blocked by a rule the worker or the pharmacy can fix: show which one
            detail = getattr(exc, 'message_dict', None) or getattr(exc, 'detail', None) or str(exc)
            return {'blocked': True, 'error': detail}
        except Exception:
            logger.exception("Engagement terms preview failed: offer_id=%s", obj.pk)
            return {'blocked': True, 'error': 'Engagement terms are unavailable.'}

    class Meta:
        model = ShiftOffer
        fields = [
            'id',
            'shift',
            'shift_detail',
            'slot',
            'slot_detail',
            'user',
            'status',
            'offered_slot_date',
            'offered_start_time',
            'offered_end_time',
            'offered_rate',
            'engagement_terms_preview',
            'payment_preference_snapshot',
            'settlement_channel',
            'engagement_kind',
            'engagement_terms_snapshot',
            'engagement_terms_accepted_at',
            'payroll_activated_at',
            'expires_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'shift',
            'shift_detail',
            'slot',
            'slot_detail',
            'user',
            'status',
            'offered_slot_date',
            'offered_start_time',
            'offered_end_time',
            'offered_rate',
            'engagement_terms_preview',
            'payment_preference_snapshot',
            'settlement_channel',
            'engagement_kind',
            'engagement_terms_snapshot',
            'engagement_terms_accepted_at',
            'payroll_activated_at',
            'expires_at',
            'created_at',
            'updated_at',
        ]


class MyShiftSerializer(serializers.ModelSerializer):
    # reuse the full PharmacySerializer (with all the file‐fields)
    pharmacy_detail = PharmacySerializer(source='pharmacy', read_only=True)
    created_by_first_name = serializers.CharField(source='created_by.first_name', read_only=True)
    created_by_last_name  = serializers.CharField(source='created_by.last_name',  read_only=True)
    created_by_email      = serializers.EmailField(source='created_by.email',      read_only=True)

    # bring rate_type, fixed_rate, workload_tags straight through
    rate_type     = serializers.CharField(read_only=True)
    fixed_rate    = serializers.DecimalField(max_digits=6, decimal_places=2, read_only=True)
    workload_tags = serializers.ListField(child=serializers.CharField(), read_only=True)

    # only return the slots that this user is actually assigned to
    slots = serializers.SerializerMethodField()

    # Lineitems from service.py
    line_items = serializers.SerializerMethodField()
    owner_adjusted_rate = serializers.DecimalField(max_digits=6, decimal_places=2, read_only=True)

    class Meta:
        model = Shift
        fields = [
            'id',
            'pharmacy_detail',
            'created_by_first_name',
            'created_by_last_name',
            'created_by_email',
            'role_needed',
            'rate_type',
            'fixed_rate',
            'workload_tags',
            'slots',
            'line_items',
            'owner_adjusted_rate',
        ]
        read_only_fields = ['was_modified']  # ✅ this protects it

    @staticmethod
    def build_allowed_tiers(pharmacy):
        # Delegate to main ShiftSerializer logic so viewsets can reuse it
        return ShiftSerializer.build_allowed_tiers(pharmacy)

    def get_slots(self, obj):
        user = self.context['request'].user

        # Show only the slots where the user has assignments
        slot_ids = obj.slot_assignments.filter(user=user).values_list('slot_id', flat=True)
        qs = obj.slots.filter(id__in=slot_ids)

        return ShiftSlotSerializer(qs, many=True).data
    def get_line_items(self, obj):
        user = self.context['request'].user
        from invoicing.services import generate_preview_invoice_lines

        try:
            return generate_preview_invoice_lines(shift=obj, user=user)
        except Exception:
            return []


class SharedShiftSerializer(serializers.ModelSerializer):
    """
    Public/shared shift serializer that reuses the full ShiftSerializer output
    for UI compatibility, then removes private user/payment/internal fields.
    """

    SENSITIVE_TOP_LEVEL_FIELDS = {
        'created_by',
        'dedicated_user',
        'slot_assignments',
        'pending_payment_slot_ids',
        'payment_options',
        'reveal_quota',
        'reveal_count',
    }
    SENSITIVE_PHARMACY_FIELDS = {
        'email',
        'owner',
        'organization',
        'abn',
        'abn_entity_name',
        'abn_entity_type',
        'abn_status',
        'abn_gst_registered',
        'abn_gst_from',
        'abn_gst_to',
        'abn_last_checked',
        'abn_entity_confirmed',
        'abn_verification_note',
        'methadone_s8_protocols',
        'qld_sump_docs',
        'sops',
        'induction_guides',
        'claim_request_id',
    }
    SENSITIVE_SLOT_FIELDS = {
        'awaiting_payment',
        'awaiting_payment_offer_id',
        'is_locked',
        'locked_by_offer_id',
        'confirmed_assignment_id',
    }

    class Meta:
        model = Shift
        fields = ['id']

    def to_representation(self, instance):
        data = ShiftSerializer(instance, context=self.context).data

        for field in self.SENSITIVE_TOP_LEVEL_FIELDS:
            data.pop(field, None)

        pharmacy_detail = data.get('pharmacy_detail')
        if isinstance(pharmacy_detail, dict):
            for field in self.SENSITIVE_PHARMACY_FIELDS:
                pharmacy_detail.pop(field, None)

        for slot in data.get('slots') or []:
            if isinstance(slot, dict):
                for field in self.SENSITIVE_SLOT_FIELDS:
                    slot.pop(field, None)

        return data


class WorkerShiftRequestSerializer(serializers.ModelSerializer):
    requested_by = serializers.HiddenField(default=serializers.CurrentUserDefault())
    pharmacy_name = serializers.CharField(source="pharmacy.name", read_only=True)
    requester_name = serializers.CharField(source="requested_by.get_full_name", read_only=True)

    class Meta:
        model = WorkerShiftRequest
        fields = [
            "id",
            "pharmacy",
            "pharmacy_name",
            "requested_by",
            "requester_name",
            "shift",
            "role",
            "slot_date",
            "start_time",
            "end_time",
            "note",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["status", "created_at", "updated_at"]

    @staticmethod
    def _normalize_shift_role(value):
        raw = str(value or "").strip().upper().replace("-", "_").replace(" ", "_")
        if raw in {"PHARMACY_ASSISTANT", "ASSISTANT"}:
            return "ASSISTANT"
        if raw in {"DISPENSARY_TECHNICIAN", "PHARMACY_TECHNICIAN", "TECHNICIAN"}:
            return "TECHNICIAN"
        if raw in {"INTERN_PHARMACIST", "INTERN"}:
            return "INTERN"
        if raw in {"PHARMACY_STUDENT", "STUDENT"}:
            return "STUDENT"
        if raw in {"PHARMACIST", "EXPLORER", "OTHER_STAFF"}:
            return raw
        return raw

    @staticmethod
    def _otherstaff_onboarding_role(user):
        onboarding = OtherStaffOnboarding.objects.filter(user=user).first()
        return WorkerShiftRequestSerializer._normalize_shift_role(getattr(onboarding, "role_type", None))

    def _resolve_role(self, attrs):
        role = self._normalize_shift_role(attrs.get("role"))
        assignment = attrs.get("shift") or getattr(self.instance, "shift", None)
        requester = attrs.get("requested_by") or getattr(self.instance, "requested_by", None)
        request = self.context.get("request")
        if not requester and request:
            requester = request.user

        if role == "OTHER_STAFF":
            if assignment and getattr(assignment, "shift", None):
                assignment_role = self._normalize_shift_role(assignment.shift.role_needed)
                if assignment_role in dict(Shift.ROLE_CHOICES):
                    return assignment_role
            onboarding_role = self._otherstaff_onboarding_role(requester)
            if onboarding_role in dict(Shift.ROLE_CHOICES):
                return onboarding_role
            raise serializers.ValidationError({
                "role": "Other staff cover requests must use a specific shift role."
            })

        if role not in dict(Shift.ROLE_CHOICES):
            raise serializers.ValidationError({"role": "Invalid shift role."})

        return role

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if "role" in attrs:
            attrs["role"] = self._resolve_role(attrs)
        return attrs

    def create(self, validated_data):
        user = self.context["request"].user

        # Explicitly link requester
        validated_data["requested_by"] = user
        validated_data["status"] = "PENDING"

        return super().create(validated_data)


class OpenShiftSerializer(serializers.ModelSerializer):
    slots = ShiftSlotSerializer(many=True, read_only=True)
    pharmacy_name = serializers.CharField(source='pharmacy.name', read_only=True)
    visibility = serializers.CharField(read_only=True)
    allowed_escalation_levels = serializers.SerializerMethodField()

    class Meta:
        model = Shift
        fields = [
            "id",
            "pharmacy",
            "pharmacy_name",
            "role_needed",
            "visibility",
            "allowed_escalation_levels",
            "description",
            "slots",
        ]

    def get_allowed_escalation_levels(self, obj):
        return ShiftSerializer.build_allowed_tiers(obj.pharmacy)


class ShiftSavedSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShiftSaved
        fields = ["id", "shift", "created_at"]
        read_only_fields = ["id", "created_at"]
