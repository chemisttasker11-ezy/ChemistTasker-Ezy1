"""Explicit integration seam between canonical invoicing and worker-finance.

The invoicing app owns the canonical Invoice. Worker-finance augments that
invoice with workspace revisions, reviews, payments and deliveries. Keep those
integration details behind this module so invoicing does not reach into
worker-finance models/services directly.
"""


def adopt_generated_internal_invoice(owner, invoice):
    from worker_finance.services import adopt_internal_invoice

    return adopt_internal_invoice(owner, invoice)


def record_legacy_invoice_send(invoice, recipient):
    from worker_finance.models import Delivery
    from worker_finance.services import record_revision_state

    record = invoice.__class__.objects.select_for_update().get(pk=invoice.pk)
    if record.request_key is None:
        return record

    Delivery.objects.get_or_create(
        invoice=record,
        version=record.version,
        defaults={
            "recipient": recipient,
            "status": "legacy_queued",
        },
    )
    record.refresh_from_db()
    record_revision_state(record)
    return record
