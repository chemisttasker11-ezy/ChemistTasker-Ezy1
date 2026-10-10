"""shifts: cohesive offers serializers."""
import logging
from rest_framework import serializers
from shifts.models import ShiftCounterOffer, ShiftCounterOfferSlot, ShiftOffer
from decimal import Decimal
from organizations.access import CAPABILITY_MANAGE_ROSTER, has_admin_capability
from users.presentation import _get_user_short_bio
from shifts.travel import extract_suburb_from_travel_origin, extract_travel_origin_from_message, TRAVEL_ORIGIN_PREFIX
from .shifts import ShiftSerializer
from .slots import ShiftSlotSerializer

logger = logging.getLogger("shifts.serializers")


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
        if obj.shift.visibility == 'PLATFORM':
            from shifts.candidates import revealed_profile
            request = self.context.get('request')
            return revealed_profile(
                user, build_absolute_uri=request.build_absolute_uri if request else (lambda url: url)
            )
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
