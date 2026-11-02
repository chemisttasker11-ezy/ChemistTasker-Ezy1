"""One invoice/version reservation and ordered, durable email transitions.

Callers authorize the invoice and hold its row lock before reserving. Completion
also locks invoice before delivery, matching Save, payment and legacy editing.
Only definite pre-send failure is retryable; a new row fences stale tasks.
"""
import logging

from django.apps import apps
from django.db import transaction
from django.utils import timezone

from .delivery_states import (
    LEGACY_READY_STATUSES, PUBLISHED_DELIVERY_STATUSES, RETRYABLE_DELIVERY_STATUSES,
)
from .models import Delivery, InvoiceRevision


logger = logging.getLogger(__name__)
Invoice = apps.get_model("invoicing", "Invoice")


def reserve_delivery(invoice, recipient):
    """Called with the authorized canonical invoice locked in an atomic block."""
    previous = Delivery.objects.filter(invoice=invoice, version=invoice.version).first()
    if previous and previous.status not in RETRYABLE_DELIVERY_STATUSES:
        return previous, False
    published = bool(previous and previous.status == "legacy_failed")
    previous_id = previous.pk if previous else None
    if previous:
        previous.delete()
    delivery = Delivery.objects.create(
        invoice=invoice, version=invoice.version, recipient=recipient,
        status="legacy_queued" if published else "preparing",
    )
    if previous_id:
        logger.info("Invoice delivery retry replaced attempt %s with %s", previous_id, delivery.pk)
    return delivery, True


def _locked_attempt(delivery_id):
    invoice_id = Delivery.objects.filter(pk=delivery_id).values_list("invoice_id", flat=True).first()
    if invoice_id is None:
        return None, None
    invoice = Invoice.objects.select_for_update().filter(pk=invoice_id).first()
    delivery = Delivery.objects.select_for_update().filter(pk=delivery_id, invoice_id=invoice_id).first()
    return invoice, delivery


def _publish_version(invoice, version):
    # Sending must never downgrade a concurrent payment or publish a newer Save.
    Invoice.objects.filter(pk=invoice.pk, version=version, status="draft").update(status="sent")
    revisions = InvoiceRevision.objects.filter(invoice_id=invoice.pk, version=version)
    if invoice.version == version and invoice.status == "paid":
        revisions.exclude(invoice_status="paid").update(invoice_status="paid")
    else:
        revisions.filter(invoice_status="draft").update(invoice_status="sent")


@transaction.atomic
def legacy_queue_result(delivery_id, *, accepted):
    invoice, delivery = _locked_attempt(delivery_id)
    if delivery is None:
        return None, False
    published_now = accepted and delivery.status in ("preparing", "queue_uncertain")
    if delivery.status in ("preparing", "queue_uncertain"):
        delivery.status = "legacy_queued" if accepted else "queue_uncertain"
        delivery.save(update_fields=["status"])
    # A fast worker, or a retry of an already published preparation failure,
    # may have established publication before the publisher gets its reply.
    if delivery.status in PUBLISHED_DELIVERY_STATUSES:
        _publish_version(invoice, delivery.version)
    return delivery.status, published_now


@transaction.atomic
def preparation_failed(delivery_id, *, legacy_worker=False):
    invoice, delivery = _locked_attempt(delivery_id)
    if delivery is None or delivery.status not in LEGACY_READY_STATUSES:
        return False
    published_now = legacy_worker and delivery.status in ("preparing", "queue_uncertain")
    published = legacy_worker or delivery.status == "legacy_queued"
    delivery.status = "legacy_failed" if published else "failed"
    delivery.save(update_fields=["status"])
    if published:
        _publish_version(invoice, delivery.version)
    return published_now


def begin_delivery(delivery_id, *, legacy=False):
    # durable=True rejects a surrounding atomic block. Explicitly disabled
    # autocommit also needs rejecting: a durable savepoint alone cannot commit it.
    if not transaction.get_autocommit() and not transaction.get_connection().in_atomic_block:
        raise RuntimeError("Invoice delivery requires autocommit before its durable claim")
    with transaction.atomic(durable=True):
        invoice, delivery = _locked_attempt(delivery_id)
        if delivery is None or delivery.status not in LEGACY_READY_STATUSES or invoice.voided_at:
            return False, False
        published_now = legacy and delivery.status in ("preparing", "queue_uncertain")
        published = legacy or delivery.status == "legacy_queued"
        delivery.status = "legacy_sending" if published else "sending"
        delivery.save(update_fields=["status"])
        if published:
            _publish_version(invoice, delivery.version)
    return True, published_now


@transaction.atomic
def delivery_uncertain(delivery_id):
    _invoice, delivery = _locked_attempt(delivery_id)
    if delivery is None or delivery.status not in ("sending", "legacy_sending"):
        return
    delivery.status = "legacy_uncertain" if delivery.status == "legacy_sending" else "uncertain"
    delivery.save(update_fields=["status"])


@transaction.atomic
def finish_delivery(delivery_id):
    invoice, delivery = _locked_attempt(delivery_id)
    if delivery is None or delivery.status not in ("sending", "legacy_sending"):
        return False
    delivery.status = "sent"
    delivery.sent_at = timezone.now()
    delivery.save(update_fields=["status", "sent_at"])
    _publish_version(invoice, delivery.version)
    return True
