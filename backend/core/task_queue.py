from __future__ import annotations

from typing import Any

from celery import current_app
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
        if task_name in current_app.tasks:
            return current_app.send_task(task_name, args=args, kwargs=kwargs, **options)

        raise LookupError(f"Celery task is not registered: {task_name}")

    if hasattr(func, "apply_async"):
        return func.apply_async(args=args, kwargs=kwargs, **options)

    raise TypeError(f"Expected a registered Celery task or task name, got {func!r}")
