import logging
import traceback
from email.mime.image import MIMEImage

from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction


logger = logging.getLogger(__name__)


def _redact_sensitive_values(data):
    if isinstance(data, dict):
        redacted = {}
        for key, value in data.items():
            if isinstance(key, str) and any(token in key.lower() for token in ["otp", "code", "token", "password"]):
                redacted[key] = "[REDACTED]"
            else:
                redacted[key] = _redact_sensitive_values(value)
        return redacted
    if isinstance(data, list):
        return [_redact_sensitive_values(item) for item in data]
    return data


def _dispatch_notification(notification_payload, recipients, subject):
    if not notification_payload:
        return
    if not isinstance(notification_payload, dict):
        logger.warning("notification payload must be a dict, got %s", type(notification_payload))
        return
    try:
        from client_profile.notifications import notify_users

        User = get_user_model()
        user_ids = notification_payload.get("user_ids") or []
        user_emails = notification_payload.get("user_emails")
        if not user_ids:
            lookup_emails = user_emails or recipients
            if lookup_emails:
                qs = User.objects.filter(email__in=lookup_emails).values_list("id", flat=True)
                user_ids = list(qs)
        user_ids = [uid for uid in {uid for uid in user_ids if uid}]
        if not user_ids:
            logger.info("No platform user ids resolved for notification payload; skipping in-app notification.")
            return
        notify_users(
            user_ids,
            title=notification_payload.get("title") or subject,
            body=notification_payload.get("body") or "",
            notification_type=notification_payload.get("type") or "task",
            action_url=notification_payload.get("action_url"),
            payload=notification_payload.get("payload") or {},
        )
        logger.info(
            "Dispatched in-app notification for %s user(s): %s",
            len(user_ids),
            notification_payload.get("title") or subject,
        )
    except Exception:
        logger.exception("Failed to dispatch in-app notification for email.")


def _dispatch_notification_before_queue(kwargs):
    notification = kwargs.pop("notification", None)
    suppress_auto_notification = kwargs.pop("suppress_auto_notification", False)
    recipients = list(kwargs.get("recipient_list") or [])
    subject = kwargs.get("subject") or ""
    if not notification and not suppress_auto_notification:
        context = kwargs.get("context") or {}
        if isinstance(context, dict):
            action_url = (
                context.get("action_url")
                or context.get("shift_link")
                or context.get("manage_url")
                or context.get("dashboard_url")
                or context.get("login_url")
                or context.get("accept_url")
                or context.get("reset_url")
                or context.get("invite_url")
                or context.get("invitation_url")
                or context.get("verification_url")
                or context.get("profile_url")
                or context.get("roster_url")
                or context.get("url")
                or context.get("link")
            )
        else:
            action_url = None
        action_url = action_url or "/dashboard"
        notification = {
            "title": subject,
            "body": "",
            "action_url": action_url,
            "payload": {
                "notification_kind": "email_notification",
                "template_name": kwargs.get("template_name") or "",
            },
        }
    if notification:
        transaction.on_commit(lambda: _dispatch_notification(notification, recipients, subject))


def send_email_now(
    subject,
    recipient_list,
    template_name,
    context,
    from_email=None,
    text_template=None,
    cc=None,
    attachments=None,
    notification=None,
):
    from django.core.mail import EmailMultiAlternatives
    from django.template.loader import render_to_string

    logger.info("=== EMAIL SEND ENTRY ===")
    logger.info("Subject: %s", subject)
    logger.info("Recipient List: %s", recipient_list)
    logger.info("Template Name: %s", template_name)
    logger.info("Text Template: %s", text_template)
    logger.debug("Context: %s", _redact_sensitive_values(context))

    from_email = from_email or settings.DEFAULT_FROM_EMAIL
    safe_recipient_list = [e.strip().replace("\u200f", "").replace("\u200e", "") for e in recipient_list]
    logger.info("Safe Recipient List: %s", safe_recipient_list)

    try:
        html_content = render_to_string(template_name, context)
        text_content = render_to_string(text_template, context) if text_template else html_content

        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=from_email,
            to=safe_recipient_list,
            cc=[e.strip() for e in (cc or []) if e and e.strip()],
        )
        msg.mixed_subtype = "related"

        logo_filename = "clipsnap-edit-6-1-2026.png"
        logo_path = settings.BASE_DIR / "templates" / "emails" / logo_filename
        if not logo_path.exists():
            logo_filename = "logo.png"
            logo_path = settings.BASE_DIR / "templates" / "emails" / logo_filename
        if logo_path.exists():
            with logo_path.open("rb") as logo_file:
                logo = MIMEImage(logo_file.read())
            logo.add_header("Content-ID", "<chemisttasker-logo-banner>")
            logo.add_header("Content-Disposition", "inline", filename=logo_filename)
            msg.attach(logo)
        else:
            logger.warning("Email logo file not found: %s", logo_path)

        if attachments:
            for fname, content, mimetype in attachments:
                if content:
                    msg.attach(fname, content, mimetype)

        msg.attach_alternative(html_content, "text/html")
        msg.send(fail_silently=False)

        if notification:
            _dispatch_notification(notification, safe_recipient_list, subject)

        logger.info("Email sent successfully.")
    except Exception:
        logger.exception("Failed to send email.")
        traceback.print_exc()
        raise


@shared_task(
    bind=True,
    name="users.tasks.send_email_task",
    queue="email",
    rate_limit=getattr(settings, "EMAIL_TASK_RATE_LIMIT", "30/m"),
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
)
def send_email_task(self, *args, **kwargs):
    return send_email_now(*args, **kwargs)


def queue_email(*args, **kwargs):
    _dispatch_notification_before_queue(kwargs)
    return send_email_task.apply_async(args=args, kwargs=kwargs, queue="email")


def send_async_email(*args, **kwargs):
    return queue_email(*args, **kwargs)
