"""Persisted checkout preparation, recoverable provider calls and confirmed expiry."""
from datetime import datetime, timedelta, timezone as datetime_timezone
from hashlib import sha256
import json
import logging

from django.db import transaction
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from shifts.models import Shift, ShiftOffer
from shifts.pricing import expand_shift_slots
from .models import FulfillmentCheckout, FulfillmentReservation
from .stripe_support import stripe, _stripe_object_value
from .checkout_prices import FULFILLMENT_PRICES

log = logging.getLogger(__name__)


class CheckoutConflict(APIException):
    status_code = 409
    default_code = "checkout_in_progress"


class CheckoutUncertain(APIException):
    status_code = 503
    default_code = "checkout_uncertain"


def occurrence_keys(offer):
    """Use finalization's accepted selection; reservations never change fee quantity."""
    occurrences = ((offer.engagement_terms_snapshot or {}).get("occurrences") or []) if offer.slot_id else []
    accepted = {(str(row.get("slot_id")), str(row.get("date"))) for row in occurrences}
    result = set()
    for entry in expand_shift_slots(offer.shift):
        slot_id, work_date = entry["slot"].pk, entry["date"]
        if offer.slot_id and slot_id != offer.slot_id:
            continue
        if accepted and (str(slot_id), str(work_date)) not in accepted:
            continue
        if offer.slot_id and offer.offered_slot_date and work_date != offer.offered_slot_date:
            continue
        result.add(f"{offer.shift_id}:{slot_id}:{work_date}")
    # Keep historical no-slot fee records exclusive to their whole shift.
    return result or {f"{offer.shift_id}:whole"}


def selection_fingerprint(offers):
    selection = {str(offer.pk): {'worker': offer.user_id, 'shift': offer.shift_id,
                               'occurrences': sorted(occurrence_keys(offer))} for offer in offers}
    return sha256(json.dumps(selection, sort_keys=True).encode()).hexdigest()


def prepare_checkout(*, shift_id, actor, offer_ids, parameters):
    parameters = json.loads(json.dumps(parameters))
    fingerprint = sha256(json.dumps(parameters, sort_keys=True, default=str).encode()).hexdigest()
    with transaction.atomic(durable=True):
        shift = Shift.objects.select_for_update().get(pk=shift_id)
        offers = list(ShiftOffer.objects.select_for_update(of=("self",)).filter(
            shift=shift, pk__in=offer_ids, status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
        ).select_related("shift").order_by("pk"))
        if len(offers) != len(offer_ids):
            raise ValidationError("The selected offers changed. Refresh before checkout.")
        requested = set()
        for offer in offers:
            keys = occurrence_keys(offer)
            if requested & keys:
                raise ValidationError("Select only one payable offer for each occurrence.")
            requested |= keys
        active = list(FulfillmentCheckout.objects.filter(original_shift_id=shift.pk)
                      .exclude(state=FulfillmentCheckout.State.EXPIRED).order_by("created_at"))
        for attempt in active:
            keys = set(attempt.reservations.filter(active=True).values_list("occurrence_key", flat=True))
            whole = f"{shift.pk}:whole"
            overlaps = bool(requested & keys or whole in requested or whole in keys
                            or set(offer_ids) & set(attempt.offer_ids))
            if not overlaps:
                continue
            if attempt.offer_ids == sorted(offer_ids) and attempt.parameter_hash == fingerprint:
                return attempt
            raise CheckoutConflict({
                "detail": "An overlapping checkout already exists. Complete or explicitly expire it before changing the selection or platform.",
                "checkout_id": str(attempt.pk),
            })
        attempt = FulfillmentCheckout.objects.create(
            shift=shift, original_shift_id=shift.pk, actor=actor,
            offer_ids=sorted(offer_ids), parameters=parameters, parameter_hash=fingerprint,
            expected_amount_cents=sum(FULFILLMENT_PRICES[row['price']] * row['quantity']
                                      for row in parameters['line_items']),
        )
        attempt.parameters["metadata"]["fulfillment_checkout_id"] = str(attempt.pk)
        attempt.parameters["metadata"]["fulfillment_selection_hash"] = selection_fingerprint(offers)
        attempt.save(update_fields=["parameters", "updated_at"])
        FulfillmentReservation.objects.bulk_create([
            FulfillmentReservation(checkout=attempt, occurrence_key=key) for key in sorted(requested)
        ])
        return attempt


def open_checkout(attempt):
    """Called after preparation commits, so provider uncertainty cannot erase ownership."""
    attempt.refresh_from_db()
    if attempt.state == FulfillmentCheckout.State.COMPLETE:
        raise CheckoutConflict("This checkout has already been paid. Refresh the shift.")
    if attempt.state == FulfillmentCheckout.State.EXPIRED:
        raise CheckoutConflict("This checkout has expired. Refresh before creating another checkout.")
    if attempt.checkout_url:
        return attempt.checkout_url
    if timezone.now() - attempt.created_at >= timedelta(hours=23):
        raise CheckoutUncertain("The provider outcome requires reconciliation before another checkout can be created.")
    try:
        session = stripe.checkout.Session.create(
            **attempt.parameters, idempotency_key=f"shift-fulfillment:{attempt.pk}",
        )
        session_id = _stripe_object_value(session, "id")
        url = _stripe_object_value(session, "url")
        if not isinstance(session_id, str) or not session_id or not isinstance(url, str) or not url:
            raise ValueError("Checkout response is missing its identity or URL")
        with transaction.atomic():
            current = FulfillmentCheckout.objects.select_for_update().get(pk=attempt.pk)
            if current.state in (FulfillmentCheckout.State.COMPLETE, FulfillmentCheckout.State.EXPIRED):
                raise CheckoutConflict("Checkout state changed. Refresh the shift before continuing.")
            if current.stripe_session_id and current.stripe_session_id != session_id:
                raise ValueError("The provider returned a different session for the same attempt")
            current.stripe_session_id, current.checkout_url = session_id, url
            expires = _stripe_object_value(session, "expires_at")
            if isinstance(expires, (int, float)):
                current.provider_expires_at = datetime.fromtimestamp(expires, tz=datetime_timezone.utc)
            current.state = FulfillmentCheckout.State.OPEN
            current.save(update_fields=["stripe_session_id", "checkout_url", "provider_expires_at", "state", "updated_at"])
        return url
    except CheckoutConflict:
        raise
    except Exception:
        log.exception("Checkout provider acknowledgment uncertain for attempt %s", attempt.pk)
        FulfillmentCheckout.objects.filter(pk=attempt.pk, state=FulfillmentCheckout.State.PREPARED).update(
            state=FulfillmentCheckout.State.UNKNOWN,
        )
        raise CheckoutUncertain("Checkout acceptance is uncertain. Retry this unchanged request; do not create another payment.")


def expire_checkout(attempt):
    """Keep reservations until the provider confirms expiry and no payment."""
    if not attempt.stripe_session_id:
        raise CheckoutUncertain("Reconcile the original provider request before expiring this checkout.")
    session = stripe.checkout.Session.retrieve(attempt.stripe_session_id)
    if _stripe_object_value(session, "status") == "open":
        session = stripe.checkout.Session.expire(attempt.stripe_session_id)
    if (_stripe_object_value(session, "id") != attempt.stripe_session_id
            or _stripe_object_value(session, "status") != "expired"
            or _stripe_object_value(session, "payment_status") != "unpaid"):
        raise CheckoutConflict("The provider has not confirmed an expired, unpaid checkout. Reconcile its payment first.")
    with transaction.atomic():
        # Same order as preparation/webhook: shift, then attempt/reservations.
        Shift.objects.select_for_update().get(pk=attempt.original_shift_id)
        current = FulfillmentCheckout.objects.select_for_update().get(pk=attempt.pk)
        if current.state == FulfillmentCheckout.State.COMPLETE or current.payment_id:
            raise CheckoutConflict("This checkout has already been paid.")
        current.state = FulfillmentCheckout.State.EXPIRED
        current.save(update_fields=["state", "updated_at"])
        current.reservations.update(active=False)


def guard_fulfillment(*, offer, checkout_id=None):
    """Called under the booking owner's shift lock, including free/pill booking."""
    keys = occurrence_keys(offer)
    whole = f"{offer.shift_id}:whole"
    for attempt in FulfillmentCheckout.objects.filter(original_shift_id=offer.shift_id).exclude(
        state=FulfillmentCheckout.State.EXPIRED,
    ):
        if checkout_id is not None and str(attempt.pk) == str(checkout_id):
            expected = attempt.parameters.get('metadata', {}).get('fulfillment_selection_hash')
            selected = ShiftOffer.objects.filter(shift_id=offer.shift_id, pk__in=attempt.offer_ids).select_related('shift')
            if (offer.status not in (ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT, ShiftOffer.Status.ACCEPTED)
                    or offer.pk not in attempt.offer_ids or not keys <= set(attempt.reservations.filter(active=True)
                    .values_list('occurrence_key', flat=True)) or (expected and selection_fingerprint(selected) != expected)):
                raise ValidationError({'code': 'checkout_selection_changed',
                                       'detail': 'The accepted work changed after checkout. Reconcile the original payment.'})
            continue
        active = set(attempt.reservations.filter(active=True).values_list("occurrence_key", flat=True))
        if (attempt.state == FulfillmentCheckout.State.COMPLETE and offer.pk in attempt.offer_ids
                and keys <= active):
            continue  # Idempotent finalization of this same paid, frozen selection.
        if keys & active or whole in keys or whole in active or offer.pk in attempt.offer_ids:
            raise ValidationError({
                "code": "checkout_reserved",
                "detail": "This work has an active or paid card checkout. Expire an unpaid checkout or reconcile its payment before using another payment route.",
            })


def bind_paid_checkout(session, metadata, payment):
    """Return the server attempt and binding error; never drop an unmatched paid intent."""
    checkout_id = metadata.get("fulfillment_checkout_id")
    if not checkout_id:
        return None, None  # Historical sessions retain their receipt/booking compatibility.
    try:
        attempt = FulfillmentCheckout.objects.select_for_update().filter(pk=checkout_id).first()
    except (ValueError, TypeError, DjangoValidationError):
        return None, "invalid_checkout_identity"
    if attempt is None or str(attempt.original_shift_id) != str(metadata.get("shift_id")):
        return attempt, "unknown_checkout_binding"
    expected = attempt.parameters.get("metadata", {})
    for field in ("shift_id", "type", "offer_ids", "slot_ids", "slot_id", "candidate_id", "owner_user_id",
                  "organization_id", "billing_contact_user_id", "billing_scope", "actor_user_id", "fulfillment_selection_hash"):
        normalize = lambda value: "" if value is None else str(value)
        if normalize(expected.get(field)) != normalize(metadata.get(field)):
            return attempt, "checkout_metadata_mismatch"
    session_id = _stripe_object_value(session, "id")
    if not session_id or attempt.stripe_session_id not in (None, session_id):
        return attempt, "checkout_session_mismatch"
    if _stripe_object_value(session, "currency") != "aud":
        return attempt, "checkout_currency_mismatch"
    if _stripe_object_value(session, "amount_total") != attempt.expected_amount_cents:
        return attempt, "checkout_amount_mismatch"
    if attempt.payment_id not in (None, payment.pk):
        return attempt, "duplicate_paid_checkout_intent"
    attempt.stripe_session_id = session_id
    attempt.payment = payment
    attempt.state = FulfillmentCheckout.State.COMPLETE
    attempt.save(update_fields=["stripe_session_id", "payment", "state", "updated_at"])
    return attempt, None
