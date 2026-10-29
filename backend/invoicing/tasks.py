"""Invoice-only email delivery: persist the attempt before any external send.

The exact Delivery ID fences duplicate and stale tasks. An ambiguous broker or
SMTP outcome stays blocked for reconciliation; this task never auto-retries.
"""
import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import get_connection
from kombu.serialization import dumps

from core.task_queue import async_task, registered_task_name
from users.tasks import _dispatch_notification, prepare_email_message
from worker_finance.invoice_bridge import (
    begin_delivery, delivery_uncertain, finish_delivery,
    legacy_queue_result, preparation_failed,
)


logger = logging.getLogger(__name__)
TASK_NAME = "invoicing.tasks.deliver_invoice_email"


def validate_email_payload(delivery_id, email):
    """Definite preparation errors are caught before publishing to the broker."""
    registered_task_name(TASK_NAME)
    prepare_email_message(**email).message()
    dumps(
        {"args": (delivery_id, email), "kwargs": {}},
        serializer=getattr(settings, "CELERY_TASK_SERIALIZER", "json"),
    )


def _notify_publication(email):
    # Keep the established invoice notification, after committed publication.
    _dispatch_notification({
        "title": email["subject"], "body": "", "action_url": "/dashboard",
        "payload": {
            "notification_kind": "email_notification",
            "template_name": email["template_name"],
        },
    }, email["recipient_list"], email["subject"])


def queue_invoice_email(delivery_id, email):
    """Called only after the reservation transaction commits."""
    try:
        async_task("invoicing.tasks.deliver_invoice_email", delivery_id, email)
    except Exception:
        # A lost publish acknowledgement does not prove the broker rejected it.
        logger.exception("Invoice delivery %s queue acceptance is uncertain", delivery_id)
        try:
            _state, published_now = legacy_queue_result(delivery_id, accepted=False)
            if published_now:
                _notify_publication(email)
        except Exception:
            logger.exception("Could not record invoice delivery %s queue outcome", delivery_id)
        return False
    try:
        _state, published_now = legacy_queue_result(delivery_id, accepted=True)
        if published_now:
            _notify_publication(email)
    except Exception:
        # The reservation remains blocked even if recording the ACK fails.
        logger.exception("Could not record invoice delivery %s publication", delivery_id)
        return False
    return True


def _record_uncertain(delivery_id):
    try:
        delivery_uncertain(delivery_id)
    except Exception:
        # A committed sending claim still prevents a duplicate SMTP attempt.
        logger.exception("Could not record invoice delivery %s SMTP outcome", delivery_id)


@shared_task(
    name=TASK_NAME, queue="email",
    rate_limit=getattr(settings, "EMAIL_TASK_RATE_LIMIT", "30/m"),
    max_retries=0,
)
def deliver_invoice_email(delivery_id, email):
    try:
        message = prepare_email_message(**email)
        message.connection = get_connection(timeout=getattr(settings, "EMAIL_TIMEOUT", 30) or 30)
        message.message()
    except Exception:
        logger.exception("Invoice delivery %s preparation failed before SMTP", delivery_id)
        if preparation_failed(delivery_id, legacy_worker=True):
            _notify_publication(email)
        return

    claimed, published_now = begin_delivery(delivery_id, legacy=True)
    if not claimed:
        return
    if published_now:
        _notify_publication(email)
    try:
        if message.send(fail_silently=False) != 1:
            raise RuntimeError("Mail backend did not confirm acceptance")
        if not finish_delivery(delivery_id):
            raise RuntimeError("Invoice delivery completion was not recorded")
    except Exception:
        logger.exception("Invoice delivery %s SMTP acceptance is uncertain", delivery_id)
        _record_uncertain(delivery_id)
