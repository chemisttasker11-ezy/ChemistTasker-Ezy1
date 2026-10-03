"""Once-only onboarding notifications: OnboardingNotification rows record which notification a profile received."""
from django.contrib.contenttypes.models import ContentType

from onboarding.models import OnboardingNotification


def notification_already_sent(obj, notif_type):
    content_type = ContentType.objects.get_for_model(obj)
    return OnboardingNotification.objects.filter(
        content_type=content_type,
        object_id=obj.pk,
        notification_type=notif_type
    ).exists()


def mark_notification_sent(obj, notif_type):
    content_type = ContentType.objects.get_for_model(obj)
    OnboardingNotification.objects.get_or_create(
        content_type=content_type,
        object_id=obj.pk,
        notification_type=notif_type
    )
