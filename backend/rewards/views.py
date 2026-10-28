"""Pill rewards API: balance, rules, referral codes/events, claiming and paying for shifts with pills."""
from rest_framework import status, viewsets
from shifts.models import Shift, ShiftOffer
from rewards.models import PillLedgerEntry, PillReferralEvent, PillRewardRule
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.decorators import action
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from shifts.finalize import expire_competing_offers, finalize_shift_offer, offer_occurrence_key
from shifts.emails import send_shift_payment_finalized_notifications
from rewards.services import (
    claim_referral_code,
    create_friend_referral,
    create_shift_referral,
    get_or_create_referral_code,
    get_pill_balance,
    get_shift_post_pill_cost,
    RewardError,
    seed_default_reward_rules,
    spend_pills_for_shift_post,
    user_is_referral_reward_eligible,
)
from django.db import transaction
from rewards.serializers import (
    ClaimReferralSerializer,
    CreateFriendReferralSerializer,
    CreateShiftReferralSerializer,
    PillBalanceSerializer,
    PillLedgerEntrySerializer,
    PillReferralCodeSerializer,
    PillReferralEventSerializer,
    PillRewardRuleSerializer,
)
from organizations.access import user_can_manage_pharmacy


class PillRewardsViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]

    def get_throttles(self):
        if self.action in {"refer_friend", "refer_shift"}:
            self.throttle_scope = "pill_referral_create"
        elif self.action == "claim":
            self.throttle_scope = "pill_referral_claim"
        elif self.action == "pay_shift":
            self.throttle_scope = "pill_payment"
        return super().get_throttles()

    def get_serializer_class(self):
        if self.action == "history":
            return PillLedgerEntrySerializer
        if self.action == "rules":
            return PillRewardRuleSerializer
        if self.action == "referrals":
            return PillReferralEventSerializer
        if self.action == "refer_friend":
            return CreateFriendReferralSerializer
        if self.action == "refer_shift":
            return CreateShiftReferralSerializer
        if self.action == "claim":
            return ClaimReferralSerializer
        return PillBalanceSerializer

    @action(detail=False, methods=["get"])
    def balance(self, request):
        seed_default_reward_rules()
        return Response({
            "balance": get_pill_balance(request.user),
            "shift_post_cost": get_shift_post_pill_cost(),
        })

    @action(detail=False, methods=["get"])
    def rules(self, request):
        seed_default_reward_rules()
        qs = PillRewardRule.objects.filter(is_active=True).order_by("code")
        return Response(PillRewardRuleSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"], url_path="referral-code")
    def referral_code(self, request):
        code = get_or_create_referral_code(request.user)
        return Response(PillReferralCodeSerializer(code).data)

    @action(detail=False, methods=["get"])
    def history(self, request):
        qs = PillLedgerEntry.objects.filter(user=request.user).select_related("rule", "referral_event", "shift")
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(PillLedgerEntrySerializer(page, many=True).data)
        return Response(PillLedgerEntrySerializer(qs, many=True).data)

    @action(detail=False, methods=["get"])
    def referrals(self, request):
        qs = (
            PillReferralEvent.objects.filter(Q(referrer=request.user) | Q(referred_user=request.user))
            .select_related("referral_code", "referrer", "referred_user", "shift")
            .order_by("-created_at")
        )
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(PillReferralEventSerializer(page, many=True).data)
        return Response(PillReferralEventSerializer(qs, many=True).data)

    @action(detail=False, methods=["post"], url_path="refer-friend")
    def refer_friend(self, request):
        serializer = CreateFriendReferralSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = create_friend_referral(
            referrer=request.user,
            referred_email=serializer.validated_data.get("referred_email", ""),
        )
        return Response(PillReferralEventSerializer(event).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="refer-shift")
    def refer_shift(self, request):
        serializer = CreateShiftReferralSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        shift = get_object_or_404(Shift.objects.select_related("pharmacy"), pk=serializer.validated_data["shift_id"])
        if not user_can_manage_pharmacy(request.user, shift.pharmacy):
            raise PermissionDenied("You do not have permission to create a referral link for this shift.")
        event = create_shift_referral(
            referrer=request.user,
            shift=shift,
            referred_email=serializer.validated_data.get("referred_email", ""),
        )
        return Response(PillReferralEventSerializer(event).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"])
    def claim(self, request):
        serializer = ClaimReferralSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        shift = None
        if serializer.validated_data.get("shift_id"):
            shift = get_object_or_404(Shift, pk=serializer.validated_data["shift_id"])
        try:
            event = claim_referral_code(
                referred_user=request.user,
                code=serializer.validated_data["code"],
                shift=shift,
                referral_event_id=serializer.validated_data.get("referral_event_id"),
                award=user_is_referral_reward_eligible(request.user),
            )
        except RewardError as exc:
            raise DRFValidationError({"detail": str(exc)})
        return Response(PillReferralEventSerializer(event).data)

    @action(detail=False, methods=["post"], url_path="pay-shift")
    def pay_shift(self, request):
        """Settle one pill charge per selected pending offer, atomically.

        Shift is the serialization key and the payer row prevents concurrent
        deductions from the same balance across different shifts.
        """
        shift_id = request.data.get("shift_id") or request.data.get("shiftId")
        if not shift_id:
            raise DRFValidationError({"shift_id": "This field is required."})

        def parse_ids(raw, key):
            if raw in (None, "", []):
                return []
            values = raw.split(",") if isinstance(raw, str) else raw if isinstance(raw, list) else [raw]
            try:
                result = [int(item) for item in values]
            except (TypeError, ValueError):
                raise DRFValidationError({key: "IDs must be integers."})
            if any(value < 1 for value in result):
                raise DRFValidationError({key: "IDs must be positive."})
            return sorted(set(result))

        slot_ids = parse_ids(
            request.data.get("slot_ids") or request.data.get("slotIds")
            or request.data.get("slot_id") or request.data.get("slotId"),
            "slot_ids",
        )
        offer_ids = parse_ids(
            request.data.get("offer_ids") or request.data.get("offerIds")
            or request.data.get("offer_id") or request.data.get("offerId"),
            "offer_ids",
        )
        ledger_entries = []
        finalized = []
        try:
            with transaction.atomic():
                shift = get_object_or_404(
                    Shift.objects.select_for_update(of=("self",)).select_related("pharmacy", "pharmacy__owner"),
                    pk=shift_id,
                )
                if not user_can_manage_pharmacy(request.user, shift.pharmacy):
                    raise PermissionDenied("You do not have permission to pay for this shift.")
                if shift.payment_status == "PAID":
                    return Response({
                        "detail": "Shift is already paid.",
                        "balance": get_pill_balance(request.user),
                        "payment_status": shift.payment_status,
                    })
                if shift.payment_status != "PENDING":
                    raise DRFValidationError({"detail": "This shift does not require payment."})
                pending = list(
                    ShiftOffer.objects.select_for_update().filter(
                        shift=shift, status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
                    ).order_by("pk")
                )
                if offer_ids:
                    selected = [offer for offer in pending if offer.id in offer_ids]
                    if len(selected) != len(offer_ids):
                        raise DRFValidationError({"detail": "One or more selected offers do not require payment."})
                elif slot_ids:
                    selected = [offer for offer in pending if offer.slot_id in slot_ids]
                    if len(selected) != len(slot_ids):
                        raise DRFValidationError({"detail": "Select exactly one pending offer per slot."})
                elif len(pending) == 1:
                    # Legacy single-offer clients may send only a shift ID.
                    selected = pending
                else:
                    raise DRFValidationError({
                        "detail": "Select the pending offer(s) to pay for this shift."
                    })

                if slot_ids and any(offer.slot_id not in slot_ids for offer in selected):
                    raise DRFValidationError({"detail": "Selected offers do not match the selected slots."})
                selected_occurrences = [offer_occurrence_key(offer) for offer in selected if offer.slot_id]
                if len(selected_occurrences) != len(set(selected_occurrences)):
                    raise DRFValidationError({"detail": "Select only one candidate per slot."})
                # _create_ledger_entry locks the payer row before reading the balance.
                for offer in selected:
                    ledger_entries.append(spend_pills_for_shift_post(user=request.user, shift=shift, offer=offer))
                    finalize_shift_offer(offer)
                    finalized.append(offer)
                expire_competing_offers(shift, selected)
                outstanding = ShiftOffer.objects.filter(
                    shift=shift, status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
                ).exists()
                shift.payment_status = "PENDING" if outstanding else "PAID"
                shift.save(update_fields=["payment_status"])
        except RewardError as exc:
            raise DRFValidationError({
                "detail": str(exc),
                "code": "insufficient_pills" if "Insufficient" in str(exc) else "pill_payment_failed",
                "balance": get_pill_balance(request.user),
                "required": get_shift_post_pill_cost() * max(1, len(offer_ids) or len(slot_ids)),
            })
        send_shift_payment_finalized_notifications(
            shift=shift, offers=finalized, paid_by=request.user, payment_method="pills",
        )
        return Response({
            "detail": "Shift paid with pills.",
            "balance": get_pill_balance(request.user),
            "payment_status": shift.payment_status,
            "finalized_offers": len(finalized),
            "ledger_entries": PillLedgerEntrySerializer(ledger_entries, many=True).data,
            "ledger_entry": PillLedgerEntrySerializer(ledger_entries[-1]).data if ledger_entries else None,
        })
