"""Discard expired receipt content while retaining consumed keys until account deletion."""
from django.utils import timezone
from talent.models import PitchCreateRequest


def cleanup_pitch_receipts():
    return PitchCreateRequest.objects.filter(replay_expires_at__lte=timezone.now()).exclude(
        response_body__isnull=True,
    ).update(response_body=None, response_headers={})
