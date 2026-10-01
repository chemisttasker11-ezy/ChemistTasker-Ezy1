"""Pill rewards API: balance, rules, referral codes/events, claiming and paying for shifts with pills."""
from rest_framework import status, viewsets
from client_profile.models import Shift, ShiftOffer
from rewards.models import PillLedgerEntry, PillReferralEvent, PillRewardRule
from django.core.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.decorators import action
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from client_profile.utils import finalize_shift_offer, send_shift_payment_finalized_notifications
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
# Shared helpers that still live in the legacy module until their own domain is extracted:
from client_profile.domains.shifts.base import BaseShiftViewSet


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
        if not BaseShiftViewSet._user_can_manage_pharmacy(request.user, shift.pharmacy):
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
            raise ValidationError({"detail": str(exc)})
        return Response(PillReferralEventSerializer(event).data)

    @action(detail=False, methods=["post"], url_path="pay-shift")
    def pay_shift(self, request):
        shift_id = request.data.get("shift_id") or request.data.get("shiftId")
        if not shift_id:
            raise DRFValidationError({"shift_id": "This field is required."})
        shift = get_object_or_404(Shift.objects.select_related("pharmacy", "pharmacy__owner"), pk=shift_id)
        if not BaseShiftViewSet._user_can_manage_pharmacy(request.user, shift.pharmacy):
            raise PermissionDenied("You do not have permission to pay for this shift.")
        if shift.payment_status == "PAID":
            return Response({
                "detail": "Shift is already paid.",
                "balance": get_pill_balance(request.user),
                "payment_status": shift.payment_status,
            })
        if shift.payment_status != "PENDING":
            raise DRFValidationError({"detail": "This shift does not require payment."})
        slot_id = request.data.get("slot_id") or request.data.get("slotId")
        raw_slot_ids = request.data.get("slot_ids") or request.data.get("slotIds")
        raw_offer_ids = request.data.get("offer_ids") or request.data.get("offerIds") or request.data.get("offer_id") or request.data.get("offerId")
        if raw_offer_ids is None:
            raw_offer_ids = []
        if isinstance(raw_offer_ids, str):
            raw_offer_ids = [part.strip() for part in raw_offer_ids.split(",") if part.strip()]
        elif not isinstance(raw_offer_ids, list):
            raw_offer_ids = [raw_offer_ids]
        offer_ids = []
        for value in raw_offer_ids:
            try:
                offer_ids.append(int(value))
            except (TypeError, ValueError):
                raise DRFValidationError({"offer_ids": f"Invalid offer id: {value}"})
        offer_ids = sorted(set(offer_ids))

        if raw_slot_ids is None:
            raw_slot_ids = [slot_id] if slot_id else []
        if isinstance(raw_slot_ids, str):
            raw_slot_ids = [part.strip() for part in raw_slot_ids.split(",") if part.strip()]
        elif not isinstance(raw_slot_ids, list):
            raw_slot_ids = [raw_slot_ids]
        slot_ids = []
        for value in raw_slot_ids:
            try:
                slot_ids.append(int(value))
            except (TypeError, ValueError):
                raise DRFValidationError({"slot_ids": f"Invalid slot id: {value}"})
        slot_ids = sorted(set(slot_ids))
        if offer_ids:
            selected_offers = list(ShiftOffer.objects.filter(
                shift=shift,
                status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
                id__in=offer_ids,
            ))
            if len(selected_offers) != len(offer_ids):
                raise DRFValidationError({"detail": "One or more selected offers do not require payment."})
            selected_slot_ids = [offer.slot_id for offer in selected_offers if offer.slot_id]
            if len(selected_slot_ids) != len(set(selected_slot_ids)):
                raise DRFValidationError({"detail": "Select only one candidate per slot."})
        elif slot_ids:
            matching_count = ShiftOffer.objects.filter(
                shift=shift,
                status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
                slot_id__in=slot_ids,
            ).values("slot_id").distinct().count()
            if matching_count != len(slot_ids):
                raise DRFValidationError({"detail": "One or more selected slots do not require payment."})
        payment_units = max(1, len(offer_ids) or len(slot_ids))
        ledgers = []
        try:
            for _ in range(payment_units):
                ledgers.append(spend_pills_for_shift_post(user=request.user, shift=shift))
        except RewardError as exc:
            raise DRFValidationError({
                "detail": str(exc),
                "code": "insufficient_pills" if "Insufficient" in str(exc) else "pill_payment_failed",
                "balance": get_pill_balance(request.user),
                "required": get_shift_post_pill_cost() * payment_units,
            })
        finalized_count = 0
        finalized_offers = []
        with transaction.atomic():
            pending_offers = ShiftOffer.objects.filter(
                shift=shift,
                status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            ).order_by("created_at")
            if offer_ids:
                pending_offers = pending_offers.filter(id__in=offer_ids)
            elif slot_ids:
                pending_offers = pending_offers.filter(slot_id__in=slot_ids)
            selected_slot_ids = set()
            for offer in pending_offers:
                finalize_shift_offer(offer)
                finalized_offers.append(offer)
                if offer.slot_id:
                    selected_slot_ids.add(offer.slot_id)
                finalized_count += 1
            if selected_slot_ids:
                ShiftOffer.objects.filter(
                    shift=shift,
                    slot_id__in=selected_slot_ids,
                    status__in=[ShiftOffer.Status.PENDING, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT],
                ).exclude(id__in=offer_ids).update(status=ShiftOffer.Status.EXPIRED, updated_at=timezone.now())
            has_pending_payment = ShiftOffer.objects.filter(
                shift=shift,
                status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            ).exists()
            shift.payment_status = "PENDING" if has_pending_payment else "PAID"
            shift.save(update_fields=["payment_status"])
        send_shift_payment_finalized_notifications(
            shift=shift,
            offers=finalized_offers,
            paid_by=request.user,
            payment_method="pills",
        )
        return Response({
            "detail": "Shift paid with pills.",
            "balance": get_pill_balance(request.user),
            "payment_status": shift.payment_status,
            "finalized_offers": finalized_count,
            "ledger_entries": PillLedgerEntrySerializer(ledgers, many=True).data,
            "ledger_entry": PillLedgerEntrySerializer(ledgers[-1]).data if ledgers else None,
        })
