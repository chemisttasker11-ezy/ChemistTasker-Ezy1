"""shifts: cohesive projections serializers."""
from rest_framework import serializers
from shifts.access import _user_can_perform_shift_role
from shifts.models import Shift
from organizations.serializers import PharmacySerializer
from .shifts import ShiftSerializer
from .slots import ShiftSlotSerializer
from shifts.rate_visibility import project_published_rates


class MyShiftSerializer(serializers.ModelSerializer):
    published_rates_visible = serializers.SerializerMethodField()
    get_published_rates_visible = ShiftSerializer.get_published_rates_visible
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
            'support_on_shift',
            'slots',
            'line_items',
            'owner_adjusted_rate',
            'published_rates_visible',
        ]
        read_only_fields = ['was_modified']  # ✅ this protects it

    def to_representation(self, instance):
        # Only the post's pay is redacted; the worker's own agreed line items stay intact.
        return project_published_rates(
            super().to_representation(instance),
            user=getattr(self.context.get('request'), 'user', None), pharmacy=instance.pharmacy,
        )

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
        user = getattr(self.context.get('request'), 'user', None)
        data['can_apply'] = _user_can_perform_shift_role(user, instance.role_needed) if user and user.is_authenticated else None

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


class OpenShiftSerializer(serializers.ModelSerializer):
    published_rates_visible = serializers.SerializerMethodField()
    get_published_rates_visible = ShiftSerializer.get_published_rates_visible
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
            "published_rates_visible",
        ]

    def get_allowed_escalation_levels(self, obj):
        return ShiftSerializer.build_allowed_tiers(obj.pharmacy)

    def to_representation(self, instance):
        return project_published_rates(
            super().to_representation(instance),
            user=getattr(self.context.get('request'), 'user', None), pharmacy=instance.pharmacy,
        )
