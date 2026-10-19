"""Explicit current-number rechecks share the desktop queue and its active-check dedupe."""
import math
from datetime import timedelta

from django.core.cache import caches
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from onboarding.verification.ahpra_numbers import full_registration_number
from onboarding.verification.desktop import enqueue_check
from onboarding.verification.state import ahpra_profile, recheck_key


class AhpraRecheckView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile = ahpra_profile(request.user)
        number = full_registration_number(getattr(profile, 'ahpra_number', None))
        if not number:
            return Response({'detail': 'Enter a valid AHPRA registration number.'}, status=400)
        cache = caches['ahpra']
        key, now = recheck_key(request.user.pk), timezone.now()
        if not cache.add(key, now, timeout=3600):
            requested = cache.get(key) or now
            retry = max(1, math.ceil((requested + timedelta(hours=1) - now).total_seconds()))
            return Response({'code': 'ahpra_recheck_cooldown', 'retry_after': retry}, status=429,
                            headers={'Retry-After': str(retry)})
        try:
            enqueue_check(profile, number, 'recheck')
        except Exception:
            cache.delete(key)
            raise
        return Response({'queued': True}, status=202)
