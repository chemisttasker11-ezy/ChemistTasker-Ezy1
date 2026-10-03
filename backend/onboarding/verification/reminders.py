"""Referee and final-evaluation reminder scheduling: Redis markers plus one-off Celery ETA tasks.

The Redis key formats are a persistent contract: markers outlive deployments, so changing a format would duplicate or
lose reminders that are already scheduled.
"""
import logging
from datetime import timedelta

import redis
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


REFEREE_REMINDER_HOURS: float = float(getattr(settings, "REFEREE_REMINDER_HOURS", 48))


REMINDER_FUNC = 'client_profile.tasks.run_referee_reminder'


def _rem_args(model_name: str, pk: int, ref_idx: int) -> str:
    return f"'{model_name}',{pk},{ref_idx}"


def _referee_reminder_key(model_name: str, pk: int, ref_idx: int) -> str:
    return f"celery:referee-reminder:{model_name}:{pk}:{ref_idx}"


def _final_evaluation_reminder_key(model_name: str, pk: int) -> str:
    return f"celery:final-evaluation-reminder:{model_name}:{pk}"


def _reminder_redis():
    return redis.from_url(getattr(settings, "CELERY_BROKER_URL", getattr(settings, "REDIS_URL", "redis://127.0.0.1:6379/0")))


def _marker_get(key: str) -> bool:
    try:
        return bool(_reminder_redis().get(key))
    except Exception:
        logger.exception("[reminder-marker] Failed to read marker %s", key)
        return False


def _marker_set(key: str, timeout: int, *, nx: bool = False) -> bool:
    try:
        return bool(_reminder_redis().set(key, "1", ex=timeout, nx=nx))
    except Exception:
        logger.exception("[reminder-marker] Failed to set marker %s", key)
        raise


def _marker_delete(key: str) -> int:
    try:
        return int(_reminder_redis().delete(key) or 0)
    except Exception:
        logger.exception("[reminder-marker] Failed to delete marker %s", key)
        return 0


def schedule_referee_reminder(model_name: str, pk: int, ref_idx: int, hours: float | None = None) -> None:
    """
    Create a ONE-OFF Celery ETA task for a single referee.
    To test, pass hours=0.1 etc.
    """
    delay = REFEREE_REMINDER_HOURS if hours is None else float(hours)
    delay_seconds = max(1, int(delay * 3600))
    key = _referee_reminder_key(model_name, pk, ref_idx)
    if not _marker_set(key, timeout=delay_seconds + 3600, nx=True):
        return
    from onboarding.tasks import run_referee_reminder  # the task module imports this module

    try:
        run_referee_reminder.apply_async(
            args=(model_name, pk, ref_idx),
            eta=timezone.now() + timedelta(hours=delay),
            queue="notifications",
        )
    except Exception:
        # the marker means "a reminder is queued"; without the task it would block every later schedule
        _marker_delete(key)
        logger.exception(
            "[referee-reminder] Enqueue failed; marker removed model=%s pk=%s ref_idx=%s", model_name, pk, ref_idx
        )
        raise


def cancel_referee_reminder(model_name: str, pk: int, ref_idx: int) -> int:
    return _marker_delete(_referee_reminder_key(model_name, pk, ref_idx))


def cancel_all_referee_reminders(model_name: str, pk: int) -> int:
    deleted = 0
    for ref_idx in (1, 2):
        deleted += cancel_referee_reminder(model_name, pk, ref_idx)
    return deleted
