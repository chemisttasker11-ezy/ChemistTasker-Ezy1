"""Best-effort outbound delivery boundaries for users-domain API flows.

Callers keep their existing transport (direct users.tasks.send_async_email or the
core async_task alias) while this module ensures a queue outage cannot turn an
already-persisted user action into a misleading HTTP 500.
"""
import logging


logger = logging.getLogger("users.views")


def deliver_email_best_effort(dispatch, *args, event, user_id=None, **kwargs):
    try:
        dispatch(*args, **kwargs)
        return True
    except Exception as exc:
        logger.warning(
            "User email delivery enqueue failed event=%s user_id=%s error_type=%s",
            event,
            user_id,
            type(exc).__name__,
        )
        return False
