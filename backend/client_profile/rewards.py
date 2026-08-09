from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.crypto import get_random_string

from client_profile.models import (
    PillLedgerEntry,
    PillReferralCode,
    PillReferralEvent,
    PillRewardRule,
    Shift,
)

User = get_user_model()

FRIEND_REFERRAL_RULE = "friend-referral-login"
SHIFT_REFERRAL_RULE = "shift-referral-login"
SHIFT_POST_COST_RULE = "shift-post-cost"

DEFAULT_REWARD_RULES = (
    {
        "code": FRIEND_REFERRAL_RULE,
        "name": "Friend referral login",
        "description": "Pills awarded when a referred friend creates an account or logs in.",
        "event_type": PillRewardRule.EventType.EARN,
        "audience": PillRewardRule.Audience.ANY,
        "pill_amount": 100,
    },
    {
        "code": SHIFT_REFERRAL_RULE,
        "name": "Shift referral login",
        "description": "Pills awarded when someone joins through a shared shift referral.",
        "event_type": PillRewardRule.EventType.EARN,
        "audience": PillRewardRule.Audience.ANY,
        "pill_amount": 50,
    },
    {
        "code": SHIFT_POST_COST_RULE,
        "name": "Shift post cost",
        "description": "Pill cost for posting a paid marketplace shift instead of paying by Stripe.",
        "event_type": PillRewardRule.EventType.SPEND,
        "audience": PillRewardRule.Audience.SHIFT_POSTER,
        "pill_amount": 200,
    },
)


class RewardError(ValueError):
    pass


def seed_default_reward_rules() -> None:
    for payload in DEFAULT_REWARD_RULES:
        PillRewardRule.objects.get_or_create(code=payload["code"], defaults=payload)


def get_pill_balance(user) -> int:
    if not user or not getattr(user, "is_authenticated", False):
        return 0
    total = PillLedgerEntry.objects.filter(user=user).aggregate(total=Sum("delta"))["total"]
    return int(total or 0)


def get_current_rule(code: str) -> PillRewardRule:
    rule = PillRewardRule.objects.filter(code=code).first()
    if rule and rule.is_current():
        return rule

    default_payload = next((item for item in DEFAULT_REWARD_RULES if item["code"] == code), None)
    if not default_payload:
        raise RewardError(f"Reward rule '{code}' is not configured.")

    rule, _ = PillRewardRule.objects.get_or_create(code=code, defaults=default_payload)
    if not rule.is_current():
        raise RewardError(f"Reward rule '{code}' is not active.")
    return rule


def get_or_create_referral_code(user) -> PillReferralCode:
    if not user or not getattr(user, "is_authenticated", False):
        raise RewardError("Authentication is required.")

    existing = PillReferralCode.objects.filter(user=user).first()
    if existing:
        return existing

    prefix = "PILL"
    for _ in range(10):
        code = f"{prefix}{get_random_string(8).upper()}"
        try:
            return PillReferralCode.objects.create(user=user, code=code)
        except IntegrityError:
            continue
    raise RewardError("Could not generate a unique referral code.")


def users_share_billing_identity(referrer, referred_user) -> bool:
    try:
        from billing.models import OwnerSubscription
        referrer_customer_ids = set(
            OwnerSubscription.objects.filter(owner=referrer)
            .exclude(stripe_customer_id__isnull=True)
            .exclude(stripe_customer_id="")
            .values_list("stripe_customer_id", flat=True)
        )
        if not referrer_customer_ids:
            return False
        referred_customer_ids = set(
            OwnerSubscription.objects.filter(owner=referred_user)
            .exclude(stripe_customer_id__isnull=True)
            .exclude(stripe_customer_id="")
            .values_list("stripe_customer_id", flat=True)
        )
        return bool(referrer_customer_ids.intersection(referred_customer_ids))
    except Exception:
        return False


def user_can_post_paid_shift(user) -> bool:
    role = getattr(user, "role", "")
    return role in {"OWNER", "ORG_STAFF"}


def _create_ledger_entry(
    *,
    user,
    rule: PillRewardRule | None,
    entry_type: str,
    source: str,
    amount: int,
    idempotency_key: str,
    description: str = "",
    referral_event: PillReferralEvent | None = None,
    shift: Shift | None = None,
    metadata: dict | None = None,
) -> PillLedgerEntry:
    if amount == 0:
        raise RewardError("Pill ledger amount cannot be zero.")

    existing = PillLedgerEntry.objects.filter(idempotency_key=idempotency_key).first()
    if existing:
        return existing

    with transaction.atomic():
        current_balance = get_pill_balance(user)
        next_balance = current_balance + amount
        if next_balance < 0:
            raise RewardError("Insufficient pill balance.")
        return PillLedgerEntry.objects.create(
            user=user,
            rule=rule,
            referral_event=referral_event,
            shift=shift,
            entry_type=entry_type,
            source=source,
            delta=amount,
            balance_after=next_balance,
            description=description,
            idempotency_key=idempotency_key,
            metadata=metadata or {},
        )


def award_referral_event(event: PillReferralEvent) -> PillLedgerEntry:
    if event.status == PillReferralEvent.Status.AWARDED:
        existing = event.ledger_entries.first()
        if existing:
            return existing

    if event.referred_user_id and event.referred_user_id == event.referrer_id:
        raise RewardError("Self-referrals cannot earn pills.")

    rule_code = FRIEND_REFERRAL_RULE
    source = PillLedgerEntry.Source.FRIEND_REFERRAL
    if event.referral_type == PillReferralEvent.ReferralType.SHIFT:
        rule_code = SHIFT_REFERRAL_RULE
        source = PillLedgerEntry.Source.SHIFT_REFERRAL

    rule = get_current_rule(rule_code)
    ledger = _create_ledger_entry(
        user=event.referrer,
        rule=rule,
        entry_type=PillLedgerEntry.EntryType.EARN,
        source=source,
        amount=rule.pill_amount,
        referral_event=event,
        shift=event.shift,
        description=rule.name,
        idempotency_key=f"referral:{event.id}:award",
    )
    event.status = PillReferralEvent.Status.AWARDED
    event.awarded_at = event.awarded_at or timezone.now()
    event.save(update_fields=["status", "awarded_at", "updated_at"])
    _send_pill_award_message(event=event, ledger=ledger, rule=rule)
    return ledger


def _send_pill_award_message(*, event: PillReferralEvent, ledger: PillLedgerEntry, rule: PillRewardRule) -> None:
    user = event.referrer
    email = (getattr(user, "email", "") or "").strip()
    reward_label = "friend referral"
    if event.referral_type == PillReferralEvent.ReferralType.SHIFT:
        reward_label = "shift referral"

    title = f"Congrats, you earned {ledger.delta} pills"
    body = (
        f"You earned {ledger.delta} pills from a {reward_label}. "
    )
    payload = {
        "ledger_entry_id": ledger.id,
        "referral_event_id": event.id,
        "pill_amount": ledger.delta,
        "balance_after": ledger.balance_after,
        "referral_type": event.referral_type,
        "rule_code": rule.code,
    }

    try:
        from client_profile.notifications import notify_users
        notify_users(
            [user.id],
            title=title,
            body=body,
            notification_type="alert",
            action_url="/dashboard/owner/pills",
            payload=payload,
        )
    except Exception:
        pass

    if not email:
        return

    try:
        from django.conf import settings
        from users.tasks import send_async_email
        pills_url = f"{settings.FRONTEND_BASE_URL}/dashboard/owner/pills"
        send_async_email(
            subject=title,
            recipient_list=[email],
            template_name="emails/pill_reward_awarded.html",
            text_template="emails/pill_reward_awarded.txt",
            context={
                "user_first_name": getattr(user, "first_name", "") or "",
                "pill_amount": ledger.delta,
                "balance_after": ledger.balance_after,
                "reward_label": reward_label,
                "rule_name": rule.name,
                "shift_id": event.shift_id,
                "pills_url": pills_url,
            },
        )
    except Exception:
        pass


def create_friend_referral(*, referrer, referred_email: str = "") -> PillReferralEvent:
    code = get_or_create_referral_code(referrer)
    return PillReferralEvent.objects.create(
        referrer=referrer,
        referral_code=code,
        referral_type=PillReferralEvent.ReferralType.FRIEND,
        referred_email=(referred_email or "").strip().lower(),
    )


def create_shift_referral(*, referrer, shift: Shift, referred_email: str = "") -> PillReferralEvent:
    code = get_or_create_referral_code(referrer)
    return PillReferralEvent.objects.create(
        referrer=referrer,
        referral_code=code,
        referral_type=PillReferralEvent.ReferralType.SHIFT,
        shift=shift,
        referred_email=(referred_email or "").strip().lower(),
    )


def claim_referral_code(
    *,
    referred_user,
    code: str,
    shift: Shift | None = None,
    referral_event_id: int | None = None,
    award: bool = False,
) -> PillReferralEvent:
    referral_code = PillReferralCode.objects.select_related("user").filter(
        code=(code or "").strip().upper(),
        is_active=True,
    ).first()
    if not referral_code:
        raise RewardError("Referral code is invalid or inactive.")
    if referral_code.user_id == referred_user.id:
        raise RewardError("You cannot claim your own referral code.")
    if users_share_billing_identity(referral_code.user, referred_user):
        raise RewardError("Referral cannot be claimed between accounts that share the same billing identity.")

    referral_type = PillReferralEvent.ReferralType.SHIFT if shift else PillReferralEvent.ReferralType.FRIEND
    event = PillReferralEvent.objects.filter(
        referral_code=referral_code,
        referred_user=referred_user,
        referral_type=referral_type,
        shift=shift,
    ).first()
    if not event:
        if referral_type == PillReferralEvent.ReferralType.SHIFT:
            if not referral_event_id:
                raise RewardError("Shift referral links must include a referral event.")
            campaign_event = (
                PillReferralEvent.objects.filter(
                    id=referral_event_id,
                    referral_code=referral_code,
                    referral_type=referral_type,
                    shift=shift,
                    status=PillReferralEvent.Status.PENDING,
                    referred_user__isnull=True,
                )
                .select_related("referrer")
                .order_by("-created_at")
                .first()
            )
            if not campaign_event:
                raise RewardError("This shift referral link is invalid or inactive.")
            event = PillReferralEvent.objects.create(
                referrer=campaign_event.referrer,
                referred_user=referred_user,
                referral_code=referral_code,
                referral_type=referral_type,
                shift=shift,
                status=PillReferralEvent.Status.CLAIMED,
                claimed_at=timezone.now(),
                metadata={"campaign_event_id": campaign_event.id},
            )
        else:
            event = PillReferralEvent.objects.create(
                referrer=referral_code.user,
                referred_user=referred_user,
                referral_code=referral_code,
                referral_type=referral_type,
                shift=shift,
                status=PillReferralEvent.Status.CLAIMED,
                claimed_at=timezone.now(),
            )
    elif event.status == PillReferralEvent.Status.PENDING:
        event.status = PillReferralEvent.Status.CLAIMED
        event.claimed_at = event.claimed_at or timezone.now()
        event.save(update_fields=["status", "claimed_at", "updated_at"])

    if award:
        award_referral_event(event)
    return event


def get_shift_post_pill_cost() -> int:
    return get_current_rule(SHIFT_POST_COST_RULE).pill_amount


def spend_pills_for_shift_post(*, user, shift: Shift) -> PillLedgerEntry:
    rule = get_current_rule(SHIFT_POST_COST_RULE)
    return _create_ledger_entry(
        user=user,
        rule=rule,
        entry_type=PillLedgerEntry.EntryType.SPEND,
        source=PillLedgerEntry.Source.SHIFT_POST,
        amount=-rule.pill_amount,
        shift=shift,
        description=f"Paid shift #{shift.id} with pills",
        idempotency_key=f"shift:{shift.id}:pill-payment",
        metadata={"shift_id": shift.id},
    )


def user_is_referral_reward_eligible(user) -> bool:
    if not user or not getattr(user, "is_active", False):
        return False
    if not getattr(user, "is_otp_verified", False):
        return False

    role = (getattr(user, "role", "") or "").upper()
    if role == "OWNER":
        return bool(getattr(getattr(user, "owneronboarding", None), "verified", False))
    if role == "PHARMACIST":
        return bool(getattr(getattr(user, "pharmacistonboarding", None), "verified", False))
    if role == "OTHER_STAFF":
        return bool(getattr(getattr(user, "otherstaffonboarding", None), "verified", False))
    if role == "EXPLORER":
        return bool(getattr(getattr(user, "exploreronboarding", None), "verified", False))

    return False


def award_verified_referrals_for_user(user) -> int:
    if not user_is_referral_reward_eligible(user):
        return 0

    events = (
        PillReferralEvent.objects.filter(
            referred_user=user,
            status=PillReferralEvent.Status.CLAIMED,
        )
        .select_related("referrer", "referral_code", "shift")
        .order_by("created_at")
    )
    awarded = 0
    for event in events:
        award_referral_event(event)
        awarded += 1
    return awarded
