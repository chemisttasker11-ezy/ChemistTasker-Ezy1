"""Historical email-aware queue adapter, owned with the users email service.

The adapter also retains its existing pass-through contract for other tasks.
Generic registry loading/options live below domains; no task or delivery policy
is added by this ownership move.
"""
from __future__ import annotations

from django.db import transaction

from infrastructure.task_queue import _celery_options, current_app, resolve_registered_task_name


CELERY_TASK_ALIASES = {
    "users.tasks.send_async_email": "users.tasks.send_email_task",
}



def registered_task_name(name: str) -> str:
    """Resolve historical aliases before consulting the shared Celery registry."""
    return resolve_registered_task_name(CELERY_TASK_ALIASES.get(name, name))


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
        task_name = registered_task_name(task_name)
        if current_app.conf.task_always_eager:
            return current_app.tasks[task_name].apply_async(args=args, kwargs=kwargs, **options)
        return current_app.send_task(task_name, args=args, kwargs=kwargs, **options)

    if hasattr(func, "apply_async"):
        return func.apply_async(args=args, kwargs=kwargs, **options)

    raise TypeError(f"Expected a registered Celery task or task name, got {func!r}")

