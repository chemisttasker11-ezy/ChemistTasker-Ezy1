"""Remove future bookings after a registration suspension; retain worked assignments."""
import logging

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from core.task_queue import async_task
from shifts.interest import is_public_shift_member_access
from shifts.models import ShiftOffer, ShiftSlotAssignment
from shifts.notifications import notify_shift_managers
from shifts.history import _protect_assignment_history
from shifts.pricing import expand_shift_slots

logger = logging.getLogger(__name__)


@transaction.atomic
def cancel_upcoming_assignments(user):
    now = timezone.localtime()
    upcoming = Q(slot_date__gt=now.date()) | Q(slot_date=now.date(), slot__start_time__gt=now.time())
    upcoming |= Q(slot_date__isnull=True, slot__date__gt=now.date())
    upcoming |= Q(slot_date__isnull=True, slot__date=now.date(), slot__start_time__gt=now.time())
    assignments = list(ShiftSlotAssignment.objects.select_for_update().filter(upcoming, user=user, shift__visibility='PLATFORM')
                       .select_related('shift__pharmacy', 'slot'))
    cancelled, retained = {}, {}
    for assignment in assignments:
        if is_public_shift_member_access(user, assignment.shift):
            continue
        day = assignment.slot_date or assignment.slot.date
        key = (assignment.shift_id, day)
        try:
            _protect_assignment_history(assignment)
        except ValidationError:
            logger.warning('AHPRA suspension kept assignment %s: linked leave/attendance/invoice history', assignment.pk)
            retained[key] = (assignment.shift, day)
            continue
        cancelled[key] = (assignment.shift, day)
        # A safety suspension must also remove published roster bookings. QuerySet.delete keeps deletion signals.
        ShiftSlotAssignment.objects.filter(pk=assignment.pk).delete()
    offers = ShiftOffer.objects.select_for_update(of=('self',)).filter(
        user=user, shift__visibility='PLATFORM',
        status__in=[ShiftOffer.Status.ACCEPTED, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT],
    ).select_related('shift__pharmacy', 'slot')
    for offer in offers:
        if is_public_shift_member_access(user, offer.shift):
            continue
        future = [(entry['slot'], entry['date']) for entry in expand_shift_slots(offer.shift)
                  if (not offer.slot_id or entry['slot'].pk == offer.slot_id)
                  and (not offer.offered_slot_date or entry['date'] == offer.offered_slot_date)]
        future = [(slot, day) for slot, day in future
                  if day > now.date() or (day == now.date() and slot.start_time > now.time())]
        if not future:
            continue
        # Keep a partially worked recurring offer as historical evidence.
        if not offer.slot_assignments.exists() and not any((offer.shift_id, day) in retained for _, day in future):
            offer.status = ShiftOffer.Status.DECLINED
            offer.save(update_fields=['status', 'updated_at'])
        for _, day in future:
            if (offer.shift_id, day) not in retained:
                cancelled[(offer.shift_id, day)] = (offer.shift, day)
    rows = []
    for shift, day in cancelled.values():
        if (shift.pk, day) in retained:
            continue  # The booking still exists; managers must not be told it was cancelled.
        row = {'id': shift.pk, 'date': day.isoformat(), 'pharmacy': shift.pharmacy.name}
        rows.append(row)
        transaction.on_commit(lambda shift=shift, row=row: _announce_cancellation(shift, row), robust=True)
    return {'cancelled': rows, 'retained': [
        {'id': shift.pk, 'date': day.isoformat(), 'pharmacy': shift.pharmacy.name}
        for shift, day in retained.values()
    ]}


def _announce_cancellation(shift, row):
    message = f"A worker's booking for shift {shift.pk} on {row['date']} at {row['pharmacy']} was cancelled because their AHPRA registration is paused."
    recipients = notify_shift_managers(shift, title='Shift booking cancelled', body=message,
                                       kind='shift_cancelled', payload={'date': row['date']})
    emails = sorted({recipient.email for recipient in recipients if recipient.email})
    if emails:
        async_task('users.tasks.send_async_email', subject='Shift booking cancelled', recipient_list=emails,
                   template_name='emails/ahpra_status.html', text_template='emails/ahpra_status.txt',
                   context={'message': message}, suppress_auto_notification=True)
