from __future__ import annotations

from typing import Any

from celery import current_app
from django.db import transaction
from django.utils import timezone


CELERY_TASK_ALIASES = {
    "users.tasks.send_async_email": "users.tasks.send_email_task",
}

def _celery_options(q_options: dict[str, Any] | None) -> dict[str, Any]:
    if not q_options:
        return {}
    options: dict[str, Any] = {}
    eta = q_options.get("eta")
    if eta is not None:
        options["eta"] = eta if timezone.is_aware(eta) else timezone.make_aware(eta)
    if "timeout" in q_options:
        options["time_limit"] = q_options["timeout"]
    return options


def async_task(func, *args, **kwargs):
    q_options = kwargs.pop("q_options", None)
    options = _celery_options(q_options)

    if isinstance(func, str):
        task_name = CELERY_TASK_ALIASES.get(func, func)
        if task_name == "users.tasks.send_email_task":
            notification = kwargs.pop("notification", None)
            suppress_auto_notification = kwargs.pop("suppress_auto_notification", False)
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
                    "title": kwargs.get("subject") or "",
                    "body": "",
                    "action_url": action_url,
                    "payload": {
                        "notification_kind": "email_notification",
                        "template_name": kwargs.get("template_name") or "",
                    },
                }
            if notification:
                from users.tasks import _dispatch_notification

                recipients = list(kwargs.get("recipient_list") or [])
                subject = kwargs.get("subject") or ""
                transaction.on_commit(
                    lambda: _dispatch_notification(notification, recipients, subject)
                )
        if task_name in current_app.tasks:
            return current_app.send_task(task_name, args=args, kwargs=kwargs, **options)

        raise LookupError(f"Celery task is not registered: {task_name}")

    if hasattr(func, "apply_async"):
        return func.apply_async(args=args, kwargs=kwargs, **options)

    raise TypeError(f"Expected a registered Celery task or task name, got {func!r}")
