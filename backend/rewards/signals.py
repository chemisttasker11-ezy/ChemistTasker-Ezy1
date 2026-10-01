"""Signal receivers of the rewards app: pill referrals are awarded when a referred user's onboarding becomes verified."""
import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from client_profile.models import (
    ExplorerOnboarding,
    OtherStaffOnboarding,
    OwnerOnboarding,
    PharmacistOnboarding,
)

log = logging.getLogger(__name__)


def _award_verified_referrals_after_commit(instance):
    if not getattr(instance, "verified", False):
        return
    user_id = getattr(instance, "user_id", None)
    if not user_id:
        return

    def _award():
        try:
            from django.contrib.auth import get_user_model
            from rewards.services import award_verified_referrals_for_user
            user = get_user_model().objects.get(id=user_id)
            award_verified_referrals_for_user(user)
        except Exception:
            log.exception("Failed to award verified referral pills for user %s", user_id)

    transaction.on_commit(_award)


@receiver(post_save, sender=OwnerOnboarding)
@receiver(post_save, sender=PharmacistOnboarding)
@receiver(post_save, sender=OtherStaffOnboarding)
@receiver(post_save, sender=ExplorerOnboarding)
def award_pill_referrals_when_onboarding_verified(sender, instance, **kwargs):
    _award_verified_referrals_after_commit(instance)
