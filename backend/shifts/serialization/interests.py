"""shifts: cohesive interests serializers."""
from rest_framework import serializers
from shifts.models import ShiftInterest, ShiftOffer, ShiftRejection, ShiftSaved
from users.presentation import _get_user_short_bio


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
        if is_public:
            # Revealed platform candidates: the same work profile as reveal_profile, without contact details.
            from shifts.candidates import revealed_profile
            request = self.context.get('request')
            return revealed_profile(user, build_absolute_uri=request.build_absolute_uri if request else (lambda url: url))
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


class ShiftSavedSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShiftSaved
        fields = ["id", "shift", "created_at"]
        read_only_fields = ["id", "created_at"]
