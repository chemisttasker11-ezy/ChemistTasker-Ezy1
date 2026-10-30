"""Reconcile one recorded paid selection; retry only a known payroll-lock refusal."""
from shifts.models import ShiftOffer, ShiftSlotAssignment
from .fulfillment import _finalize_pending_offers_for_shift

PAYROLL_CORRECTION_PENDING = 'payroll_correction_pending'


def _selection_is_fulfilled(shift, attempt):
    offers = ShiftOffer.objects.filter(shift=shift, pk__in=attempt.offer_ids)
    if offers.count() != len(attempt.offer_ids) or offers.exclude(status=ShiftOffer.Status.ACCEPTED).exists():
        return False
    actual = {f'{row.shift_id}:{row.slot_id}:{row.slot_date or row.slot.date}' for row in
              ShiftSlotAssignment.objects.filter(shift=shift, source_offer_id__in=attempt.offer_ids).select_related('slot')}
    reserved = set(attempt.reservations.filter(active=True).values_list('occurrence_key', flat=True))
    return bool(reserved) and actual == reserved


def finalize_paid_selection(shift, payment, attempt, metadata, *, created, finalize=_finalize_pending_offers_for_shift, log=None):
    previous_reason = payment.reconciliation_reason
    correcting = not created
    unbookable = []
    offer_ids = metadata.get('offer_ids')
    if correcting:
        offer_ids = list(shift.offers.filter(pk__in=attempt.offer_ids,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT).values_list('pk', flat=True))
    count, finalized = (0, [])
    if not correcting or offer_ids:
        count, finalized = finalize(shift,
            candidate_id=metadata.get('candidate_id'), slot_id=metadata.get('slot_id'),
            slot_ids=metadata.get('slot_ids'), offer_ids=offer_ids,
            return_offers=True, unbookable=unbookable,
            **({'checkout_id': attempt.pk} if attempt is not None else {}))
    if correcting and _selection_is_fulfilled(shift, attempt):
        payment.reconciliation_required = False
        payment.save(update_fields=['reconciliation_required'])
    elif unbookable or not count:
        payment.reconciliation_required = True
        payment.reconciliation_reason = ('locked_payroll_period' if any(
            getattr(offer, '_fulfillment_refusal_code', '') == 'locked_payroll_period'
            for offer in unbookable) else 'paid_work_unavailable')
        payment.save(update_fields=['reconciliation_required', 'reconciliation_reason'])
        if created or previous_reason != payment.reconciliation_reason:
            if log is not None:
                log.error('Paid shift checkout %s could not book offers %s: refund or manual action required.',
                          payment.pk, [offer.pk for offer in unbookable])
            from shifts.notifications import notify_shift_managers
            locked = payment.reconciliation_reason == 'locked_payroll_period'
            notify_shift_managers(shift,
                title='Shift payment needs a correction' if locked else 'Shift payment needs a refund',
                body=('Correct the locked timesheet period with an audit reason, then replay the original paid event. '
                      'Do not pay again.' if locked else
                      'A paid shift offer could not be booked because it is no longer available. '
                      'The payment needs a refund or manual follow-up.'),
                kind='shift_payment_refund_required',
                payload={'payment_id': payment.pk, 'offer_ids': [offer.pk for offer in unbookable]},
                deliver_on_commit=True)
    pending = (attempt is not None and payment.reconciliation_required
               and payment.reconciliation_reason == 'locked_payroll_period')
    return count, finalized, pending
