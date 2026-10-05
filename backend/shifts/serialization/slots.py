"""shifts: cohesive slots serializers."""
from rest_framework import serializers
from shifts.models import ShiftOffer, ShiftSlot, ShiftSlotAssignment


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
