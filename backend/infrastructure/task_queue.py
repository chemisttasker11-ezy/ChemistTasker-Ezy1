"""Domain-neutral Celery option conversion and cold/concurrent registry lookup.

Task-name aliases and email/notification orchestration belong to their caller.
"""
from __future__ import annotations

from threading import Lock
from typing import Any

from celery import current_app
from django.utils import timezone


_TASK_REGISTRY_LOAD_LOCK = Lock()

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


def resolve_registered_task_name(name: str) -> str:
    """The registered Celery task name for the already-normalised `name`, or LookupError when Celery does not know it.

    A web process only knows the tasks whose modules something has imported. Dispatching by name must not depend on
    that, so on a miss the autodiscovered task modules are loaded (what a worker does at start-up) and the name is
    looked up again.
    """
    task_name = name
    if task_name in current_app.tasks:
        return task_name

    # Celery 5.5 autodiscovery uses a process-global race-protection flag, not a
    # lock. Two concurrent first web requests can therefore make the second
    # caller skip autodiscovery and observe a partially populated registry.
    # Serialize the miss path and re-check after acquiring the lock so only one
    # request performs the initial import pass.
    with _TASK_REGISTRY_LOAD_LOCK:
        if task_name not in current_app.tasks:
            current_app.loader.import_default_modules()

    if task_name in current_app.tasks:
        return task_name
    raise LookupError(f"Celery task is not registered: {task_name}")

