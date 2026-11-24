"""Remove future public bookings after an AHPRA restriction; retain worked assignments."""
import logging

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from users.task_dispatch import async_task
from shifts.events import unpaid_offer_cancelled
from shifts.interest import is_public_shift_member_access
from shifts.models import ShiftOffer, ShiftSlotAssignment
from shifts.notifications import notify_shift_change, notify_shift_managers
from shifts.history import _protect_assignment_history
from shifts.pricing import expand_shift_slots

logger = logging.getLogger(__name__)


def _is_public_booking(user, shift, terms):
    source = (terms or {}).get("booking_source")
    if source:
        return source == "PUBLIC"
    return shift.visibility == "PLATFORM" and not is_public_shift_member_access(user, shift)


@transaction.atomic
def cancel_upcoming_assignments(user, *, reason='their AHPRA registration is paused', cancel=True):
    """With cancel=False nothing changes: every upcoming public booking is listed as retained."""
    if not settings.AHPRA_ENFORCEMENT_ENABLED:
        return {'cancelled': [], 'retained': []}
    now = timezone.localtime()

    def upcoming(day, start):
        return day > now.date() or (day == now.date() and start > now.time())

    # Today's start time is checked below: a negotiated offer can move it away from the slot template.
    from_today = Q(slot_date__gte=now.date()) | Q(slot_date__isnull=True, slot__date__gte=now.date())
    public = Q(shift__visibility='PLATFORM') | Q(engagement_terms_snapshot__booking_source='PUBLIC')
    assignments = list(ShiftSlotAssignment.objects.select_for_update(of=('self',))
                       .filter(from_today, public, user=user)
                       .select_related('shift__pharmacy', 'slot', 'source_offer'))
    cancelled, retained = {}, {}
    for assignment in assignments:
        if not _is_public_booking(user, assignment.shift, assignment.engagement_terms_snapshot):
            continue
        day = assignment.slot_date or assignment.slot.date
        offer = assignment.source_offer
        if not upcoming(day, (offer and offer.offered_start_time) or assignment.slot.start_time):
            continue
        key = (assignment.shift_id, day)
        if not cancel:
            retained[key] = (assignment.shift, day)
            continue
        try:
            _protect_assignment_history(assignment)
        except ValidationError:
            logger.warning('AHPRA suspension kept assignment %s: linked leave/attendance/invoice history', assignment.pk)
            retained[key] = (assignment.shift, day)
            continue
        cancelled[key] = (assignment.shift, day)
        # An AHPRA restriction must also remove published roster bookings. QuerySet.delete keeps deletion signals.
        ShiftSlotAssignment.objects.filter(pk=assignment.pk).delete()
    offers = ShiftOffer.objects.select_for_update(of=('self',)).filter(
        public, user=user,
        status__in=[ShiftOffer.Status.ACCEPTED, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT],
    ).select_related('shift__pharmacy', 'slot')
    for offer in offers:
        if not _is_public_booking(user, offer.shift, offer.engagement_terms_snapshot):
            continue
        future = [(entry['slot'], entry['date']) for entry in expand_shift_slots(offer.shift)
                  if (not offer.slot_id or entry['slot'].pk == offer.slot_id)
                  and (not offer.offered_slot_date or entry['date'] == offer.offered_slot_date)]
        future = [(slot, day) for slot, day in future if upcoming(day, offer.offered_start_time or slot.start_time)]
        if not future and (not cancel or offer.status != ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT
                           or offer.shift.slots.exists()):
            continue
        if not cancel:
            retained.update({(offer.shift_id, day): (offer.shift, day) for _, day in future})
            continue
        # Keep a partially worked recurring offer as historical evidence.
        if not offer.slot_assignments.exists() and not any((offer.shift_id, day) in retained for _, day in future):
            update_fields = ['status', 'updated_at']
            if offer.status == ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT:
                # Keep a durable retry marker on legacy offers and release after dropping the AHPRA/offer locks.
                offer.pay_by_at = offer.pay_by_at or timezone.now()
                update_fields.append('pay_by_at')
                transaction.on_commit(lambda shift_id=offer.shift_id, offer_id=offer.pk:
                                      unpaid_offer_cancelled.send(sender=ShiftOffer, shift_id=shift_id, offer_id=offer_id),
                                      robust=True)
            offer.status = ShiftOffer.Status.DECLINED
            offer.save(update_fields=update_fields)
        for _, day in future:
            if (offer.shift_id, day) not in retained:
                cancelled[(offer.shift_id, day)] = (offer.shift, day)
    rows = []
    for shift, day in cancelled.values():
        if (shift.pk, day) in retained:
            continue  # The booking still exists; managers must not be told it was cancelled.
        row = {'id': shift.pk, 'date': day.isoformat(), 'pharmacy': shift.pharmacy.name}
        rows.append(row)
        transaction.on_commit(lambda shift=shift, row=row: _announce_cancellation(shift, row, reason, user), robust=True)
    return {'cancelled': rows, 'retained': [
        {'id': shift.pk, 'date': day.isoformat(), 'pharmacy': shift.pharmacy.name}
        for shift, day in retained.values()
    ]}


def _announce_cancellation(shift, row, reason, worker):
    message = f"A worker's booking for shift {shift.pk} on {row['date']} at {row['pharmacy']} was cancelled because {reason}."
    recipients = _announce(shift, row, 'Shift booking cancelled', message, 'shift_cancelled', include_org_wide=False)
    notify_shift_change(
        shift, kind='shift_cancelled', title='Shift booking cancelled', workers=[worker],
        already_notified=[manager.pk for manager in recipients], include_managers=False,
    )


def announce_bookings(rows, *, title, message):
    """Tell each booking's pharmacy owner/admins (in-app and email) about it; message(row) builds the text."""
    from shifts.models import Shift
    shifts = Shift.objects.select_related('pharmacy').in_bulk({row['id'] for row in rows})
    for row in rows:
        _announce(shifts[row['id']], row, title, message(row), 'shift_booking_attention')


def _announce(shift, row, title, message, kind, *, include_org_wide=True):
    recipients = notify_shift_managers(
        shift, title=title, body=message, kind=kind, payload={'date': row['date']}, include_org_wide=include_org_wide,
    )
    emails = sorted({recipient.email for recipient in recipients if recipient.email})
    if emails:
        async_task('users.tasks.send_async_email', subject=title, recipient_list=emails,
                   template_name='emails/ahpra_status.html', text_template='emails/ahpra_status.txt',
                   context={'message': message}, suppress_auto_notification=True)
    return recipients
