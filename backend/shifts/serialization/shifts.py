"""shifts: cohesive shifts serializers."""
from django.contrib.auth import get_user_model
from rest_framework import serializers
from onboarding.services.skill_identity import normalize_skills
from drf_spectacular.utils import extend_schema_field
from onboarding.models import OtherStaffOnboarding, PharmacistOnboarding
from shifts.models import Shift, ShiftDescriptionTemplate, ShiftOffer
from shifts.escalation import allowed_tiers
from shifts.pricing import expand_shift_slots
from datetime import date
from django.utils import timezone
from organizations.serializers import anonymize_pharmacy_detail, PharmacySerializer, user_can_view_full_pharmacy
from shifts.posting import ensure_escalation_stamps, normalize_money_value, normalize_slots_payload, post_shift, revise_shift
from shifts.travel import haversine_km
from .slots import ShiftSlotSerializer

User = get_user_model()


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
        role = attrs.get('role_needed') or getattr(self.instance, 'role_needed', None)
        for field in ('must_have', 'nice_to_have'):
            if field in attrs:
                if role == 'EXPLORER' and attrs[field]:
                    raise serializers.ValidationError({field: 'Explorer shifts cannot require professional pharmacy skills.'})
                attrs[field] = normalize_skills(attrs[field], strict=True, allowed_role=role if role != 'EXPLORER' else None)
        if 'must_have' in attrs or 'nice_to_have' in attrs:
            required = attrs.get('must_have', getattr(self.instance, 'must_have', []) or [])
            preferred = attrs.get('nice_to_have', getattr(self.instance, 'nice_to_have', []) or [])
            if set(required).intersection(preferred):
                raise serializers.ValidationError({'nice_to_have': 'A skill cannot be both required and preferred.'})
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
