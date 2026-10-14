from django.core.management.base import BaseCommand

from onboarding.models import ExplorerOnboarding, OtherStaffOnboarding, PharmacistOnboarding
from onboarding.verification.policy import refresh_verified


class Command(BaseCommand):
    help = "Re-apply the verification policy to every worker profile (run after tightening and after the grace date)."

    def handle(self, *args, **options):
        changed = 0
        for model in (PharmacistOnboarding, OtherStaffOnboarding, ExplorerOnboarding):
            for profile in model.objects.select_related("user").iterator():
                before = profile.verified
                changed += before != refresh_verified(profile)
        self.stdout.write(self.style.SUCCESS(f"Verification re-evaluated; {changed} profile(s) changed."))
