"""Serializers for the pill rewards API (balance, rules, ledger history, referrals)."""
from rest_framework import serializers
from rewards.models import PillLedgerEntry, PillReferralCode, PillReferralEvent, PillRewardRule
from rewards.services import get_pill_balance


# Pills and Refferals
class PillRewardRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = PillRewardRule
        fields = [
            "id",
            "code",
            "name",
            "description",
            "event_type",
            "audience",
            "pill_amount",
            "is_active",
            "starts_at",
            "ends_at",
            "metadata",
        ]
        read_only_fields = fields


class PillReferralCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PillReferralCode
        fields = ["code", "is_active", "created_at"]
        read_only_fields = fields


class PillLedgerEntrySerializer(serializers.ModelSerializer):
    rule_code = serializers.CharField(source="rule.code", read_only=True)
    referral_type = serializers.CharField(source="referral_event.referral_type", read_only=True)
    shift_id = serializers.IntegerField(source="shift.id", read_only=True)

    class Meta:
        model = PillLedgerEntry
        fields = [
            "id",
            "entry_type",
            "source",
            "delta",
            "balance_after",
            "description",
            "rule_code",
            "referral_type",
            "shift_id",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class PillReferralEventSerializer(serializers.ModelSerializer):
    referral_code = serializers.CharField(source="referral_code.code", read_only=True)
    referrer_email = serializers.EmailField(source="referrer.email", read_only=True)
    referred_user_email = serializers.EmailField(source="referred_user.email", read_only=True)
    shift_id = serializers.IntegerField(source="shift.id", read_only=True)

    class Meta:
        model = PillReferralEvent
        fields = [
            "id",
            "referral_code",
            "referral_type",
            "status",
            "referrer_email",
            "referred_user_email",
            "referred_email",
            "shift_id",
            "claimed_at",
            "awarded_at",
            "created_at",
        ]
        read_only_fields = fields


class PillBalanceSerializer(serializers.Serializer):
    balance = serializers.SerializerMethodField()
    shift_post_cost = serializers.IntegerField(read_only=True)

    def get_balance(self, obj):
        return get_pill_balance(self.context["request"].user)


class CreateFriendReferralSerializer(serializers.Serializer):
    referred_email = serializers.EmailField(required=False, allow_blank=True)


class CreateShiftReferralSerializer(serializers.Serializer):
    shift_id = serializers.IntegerField()
    referred_email = serializers.EmailField(required=False, allow_blank=True)


class ClaimReferralSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    shift_id = serializers.IntegerField(required=False)
    referral_event_id = serializers.IntegerField(required=False)
