from celery import shared_task
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from shifts.models import ShiftOffer
from .checkout_reservations import expire_payment_reservation
from .models import FulfillmentCheckout


@shared_task
def expire_payment_reservations():
    now = timezone.now()
    open_checkouts = FulfillmentCheckout.objects.filter(original_shift_id=OuterRef('shift_id')).exclude(
        state__in=(FulfillmentCheckout.State.EXPIRED, FulfillmentCheckout.State.COMPLETE),
    )
    due = Q(status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT) & (Q(pay_by_at__lte=now) | Q(pay_by_at__isnull=True))
    cancelled = Q(status=ShiftOffer.Status.DECLINED, pay_by_at__isnull=False) & Q(Exists(open_checkouts))
    for shift_id, offer_id in list(ShiftOffer.objects.filter(due | cancelled).values_list('shift_id', 'pk')):
        expire_payment_reservation(shift_id, offer_id, now=now)
