"""Billing's checkout handlers for shift lifecycle events."""
from django.dispatch import receiver
from shifts.events import before_fulfillment, unpaid_offer_cancelled
from .checkout_reservations import expire_payment_reservation, guard_fulfillment


@receiver(before_fulfillment)
def protect_reserved_fulfillment(sender, offer, checkout_id=None, **kwargs):
    guard_fulfillment(offer=offer, checkout_id=checkout_id)


@receiver(unpaid_offer_cancelled)
def release_cancelled_checkout(sender, shift_id, offer_id, **kwargs):
    expire_payment_reservation(shift_id, offer_id)
