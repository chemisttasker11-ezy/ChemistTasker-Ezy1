"""Read-only preview for the same new internal source supported by Save."""
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from .models import Customer
from .services import internal_invoice_prefill, snapshot_lines, calculate


def preview_draft(owner, data):
    source_ids = data.get('source_assignment_ids') or []
    if source_ids and not data['customer_id']:
        # A new internal draft deliberately has customer_id=0. Only Save may
        # create its pharmacy customer; preview validates the existing source.
        internal_invoice_prefill(owner, source_ids)
        submitted = [int(row['source_assignment_id']) for row in data['lines'] if row.get('source_assignment_id')]
        if set(submitted) != set(source_ids) or len(submitted) != len(source_ids):
            raise ValidationError({'lines': 'Keep one editable source row for every selected shift assignment.'})
    else:
        get_object_or_404(Customer, pk=data['customer_id'], owner=owner, active=True)
    return calculate(data, snapshot_lines(owner, data))
