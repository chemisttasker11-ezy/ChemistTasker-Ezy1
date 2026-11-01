"""Referral orchestration used after identity has created a signup account."""
from rewards import services
from shifts.models import Shift


def claim_signup_referral(*, user, code, shift_id=None, event_id=None):
    shift = Shift.objects.filter(pk=shift_id).first() if shift_id else None
    try:
        return services.claim_referral_code(
            referred_user=user, code=code, shift=shift,
            referral_event_id=event_id, award=False,
        )
    except services.RewardError:
        pass
