"""Billing owns collectible-checkout protection at the shift fulfillment boundary."""
from django.dispatch import receiver
from shifts.events import before_fulfillment
from .checkout_reservations import guard_fulfillment


@receiver(before_fulfillment)
def protect_reserved_fulfillment(sender, offer, checkout_id=None, **kwargs):
    guard_fulfillment(offer=offer, checkout_id=checkout_id)
