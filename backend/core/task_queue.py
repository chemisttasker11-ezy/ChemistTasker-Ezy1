"""Historical queue import surface; implementations live with their owners.

Email-aware dispatch belongs to users. Neutral options and registry locking
belong to infrastructure. This module keeps existing callers and task payloads
compatible and owns no second dispatch implementation.
"""
from infrastructure.task_queue import (
    Any,
    Lock,
    _TASK_REGISTRY_LOAD_LOCK,
    _celery_options,
    current_app,
    timezone,
)
from users.task_dispatch import (
    CELERY_TASK_ALIASES,
    async_task,
    registered_task_name,
    transaction,
)
