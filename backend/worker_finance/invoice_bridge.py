"""Explicit integration seam between canonical invoicing and worker-finance.

The invoicing app owns the canonical Invoice. Worker-finance augments that
invoice with workspace revisions, reviews, payments and deliveries. Keep those
integration details behind this module so invoicing does not reach into
worker-finance models/services directly.
"""
from .assignment_terms import InvalidAssignmentTerms, resolve_invoice_assignment_facts


def adopt_generated_internal_invoice(owner, invoice):
    from worker_finance.services import adopt_internal_invoice

    return adopt_internal_invoice(owner, invoice)


def preview_generated_internal_invoice(invoice, lines):
    from worker_finance.services import calculate_generated_internal_invoice

    return calculate_generated_internal_invoice(invoice, lines)[1]


def reserve_delivery(invoice, recipient):
    from .delivery import reserve_delivery as reserve

    return reserve(invoice, recipient)


def preparation_failed(delivery_id, *, legacy_worker=False):
    from .delivery import preparation_failed as fail

    return fail(delivery_id, legacy_worker=legacy_worker)


def legacy_queue_result(delivery_id, *, accepted):
    from .delivery import legacy_queue_result as complete

    return complete(delivery_id, accepted=accepted)


def begin_delivery(delivery_id, *, legacy=False):
    from .delivery import begin_delivery as begin

    return begin(delivery_id, legacy=legacy)


def delivery_uncertain(delivery_id):
    from .delivery import delivery_uncertain as uncertain

    return uncertain(delivery_id)


def finish_delivery(delivery_id):
    from .delivery import finish_delivery as finish

    return finish(delivery_id)
