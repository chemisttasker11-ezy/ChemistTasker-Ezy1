"""Onboarding e-mails and notifications: referee requests, the superuser notice and name matching."""
import difflib
import re
from users.normalization import sanitize_email_text as clean_email
from users.role_labels import other_staff_role_label
from core.task_queue import async_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.signing import TimestampSigner
from django.utils import timezone
from urllib.parse import urlencode


def get_candidate_role(obj) -> str:
    """
    Pharmacist => 'Pharmacist'
    OtherStaff/Explorer => use whatever role field you already store.
    Falls back gracefully if your field names differ.
    """
    model = obj._meta.model_name
    if model == 'pharmacistonboarding':
        return 'Pharmacist'
    if model == 'otherstaffonboarding':
        return other_staff_role_label(getattr(obj, 'role_type', None))

    for field in ('position_applied_for', 'desired_role', 'role_type', 'role', 'staff_role', 'explorer_role'):
        val = getattr(obj, field, None)
        if val:
            return other_staff_role_label(val) if model == 'otherstaffonboarding' else str(val)

    rp = getattr(obj, 'rate_preference', None)
    if isinstance(rp, dict):
        for k in ('role', 'position', 'title', 'position_applied_for'):
            if rp.get(k):
                return str(rp[k])

    return model.replace('onboarding', '').replace('_', ' ').title()


def send_referee_emails(obj, is_reminder=False):
    """
    Sends referee email(s). Generates a secure token for the questionnaire link.
    Also schedules a per-referee reminder for each email sent.
    """
    signer = TimestampSigner()

    update_fields = []
    for idx in [1, 2]:
        email_raw = getattr(obj, f'referee{idx}_email', None)
        confirmed = getattr(obj, f'referee{idx}_confirmed', None)
        rejected = getattr(obj, f'referee{idx}_rejected', None)
        name = getattr(obj, f'referee{idx}_name', '')
        workplace = getattr(obj, f'referee{idx}_workplace', '')
        relation = getattr(obj, f'referee{idx}_relation', '')
        email = clean_email(email_raw)

        if email and not confirmed and not rejected:
            if is_reminder:
                subject = f"Gentle Reminder: Reference Request for {obj.user.get_full_name()}"
                template_name = "emails/referee_reminder.html"
                text_template = "emails/referee_reminder.txt"
            else:
                subject = "Reference Request: Please Complete for ChemistTasker"
                template_name = "emails/referee_request.html"
                text_template = "emails/referee_request.txt"

            token = signer.sign(f"{obj._meta.model_name}:{obj.pk}:{idx}")

            # ✅ NEW: include role in the querystring
            query = urlencode({
                "candidate_name": obj.user.get_full_name(),
                "position_applied_for": get_candidate_role(obj),
            })
            confirm_url = f"{settings.FRONTEND_BASE_URL}/referee/questionnaire/{token}?{query}"

            reject_url = f"{settings.FRONTEND_BASE_URL}/onboarding/referee-reject/{token}"

            async_task(
                'users.tasks.send_async_email',
                subject=subject,
                recipient_list=[email],
                template_name=template_name,
                context={
                    "referee_name": name,
                    "referee_relation": relation,
                    "referee_workplace": workplace,
                    "candidate_name": obj.user.get_full_name(),
                    "candidate_first_name": obj.user.first_name,
                    "candidate_last_name": obj.user.last_name,
                    "confirm_url": confirm_url,
                    "reject_url": reject_url,
                    # (optional if your template wants to render it)
                    "position_applied_for": get_candidate_role(obj),
                },
                text_template=text_template
            )
            setattr(obj, f'referee{idx}_last_sent', timezone.now())
            update_fields.append(f'referee{idx}_last_sent')

            # Schedule THIS referee's reminder (initial)
            try:
                from onboarding.verification.reminders import schedule_referee_reminder
                schedule_referee_reminder(obj._meta.model_name, obj.pk, idx)
            except Exception:
                pass

    if update_fields:
        obj.save(update_fields=list(set(update_fields)))


def summarize_onboarding_fields(obj):
    summary = {}
    for field in obj._meta.fields:
        if field.name in ('id', 'user', 'created', 'modified', 'pk'):
            continue
        value = getattr(obj, field.name, None)
        if value not in [None, '', []]:
            # FieldFile or file: get url if possible, else name, else string
            if hasattr(value, "url"):
                val = value.url
            elif hasattr(value, "name"):
                val = value.name
            else:
                try:
                    val = str(value)
                except Exception:
                    val = "[Unserializable]"
            summary[field.verbose_name.title()] = val
    return summary


def notify_superuser_on_onboarding(obj):
    User = get_user_model()
    superusers = User.objects.filter(is_superuser=True, email__isnull=False).values_list('email', flat=True)
    if not superusers:
        return

    model = obj._meta
    admin_url = f"{settings.BACKEND_BASE_URL}/admin/{model.app_label}/{model.model_name}/{obj.pk}/change/"
    context = {
        "model_verbose_name": model.verbose_name,
        "pk": obj.pk,
        "user": str(getattr(obj, "user", "")),
        "user_full_name": getattr(obj.user, "get_full_name", lambda: str(obj.user))(),
        "user_email": getattr(obj.user, "email", ""),
        "admin_url": admin_url,
        "summary_fields": summarize_onboarding_fields(obj),  # Now always strings
        "created": str(getattr(obj, "created", "")),
    }
    async_task(
        'users.tasks.send_async_email',
        subject=f"New {model.verbose_name.title()} Submission (ID {obj.pk})",
        recipient_list=list(superusers),
        template_name="emails/admin_onboarding_notification.html",
        context=context,
        text_template="emails/admin_onboarding_notification.txt",
    )


def simple_name_match(extracted_text, first_name, last_name, cutoff=0.8):
    if not extracted_text or not first_name or not last_name:
        return False
    text = extracted_text.lower()
    text = re.sub(r'\b(mr|mrs|ms|dr|miss|prof|sir)\b[.]*', '', text)
    words = text.split()
    f_name = first_name.lower().strip()
    l_name = last_name.lower().strip()
    def phrase_match(target, words):
        n = len(words)
        t_len = len(target.split())
        for i in range(n):
            for j in range(i+1, min(i+1+t_len+2, n+1)):
                phrase = " ".join(words[i:j]).strip()
                if target == phrase or difflib.SequenceMatcher(None, phrase, target).ratio() >= cutoff:
                    return True
        for word in words:
            if word == target or difflib.SequenceMatcher(None, word, target).ratio() >= cutoff:
                return True
        return False
    return phrase_match(f_name, words) and phrase_match(l_name, words)
