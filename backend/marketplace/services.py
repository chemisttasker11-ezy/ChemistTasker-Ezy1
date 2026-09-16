import hashlib
import json

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import MarketplaceAuditEvent, MarketplaceExchange, MarketplaceExchangeParticipant, MarketplaceListing, MarketplaceRequestReceipt, MarketplaceReservation
from .policy import evaluate_marketplace_access, owns_pharmacy, resolved_role


def assert_listing_manager(user, listing):
    if listing.creator_id != user.id:
        raise PermissionDenied("This listing is not available in your marketplace workspace.")
    decision = evaluate_marketplace_access(user)
    if decision.blockers:
        raise PermissionDenied({"code": decision.blockers[0]["code"], "detail": decision.blockers[0]["message"]})
    if listing.pharmacy_id and not owns_pharmacy(user, listing.pharmacy):
        raise PermissionDenied("Current pharmacy ownership is required.")


def buyer_can_contact(user, listing, buying_pharmacy=None):
    decision = evaluate_marketplace_access(user)
    if decision.blockers:
        return False, decision.blockers[0]
    if user.id == listing.creator_id:
        return False, {"code": "SELF_CONTACT", "message": "You cannot enquire on your own listing."}
    allowed = listing.audience.allowed_buyer_roles
    if decision.role_code not in allowed:
        return False, {"code": "ROLE_NOT_ELIGIBLE", "message": "Your verified role is not in this listing's buyer audience."}
    if listing.seller_context == MarketplaceListing.SellerContext.PHARMACY:
        if not buying_pharmacy or not owns_pharmacy(user, buying_pharmacy):
            return False, {"code": "OWNER_CONTEXT_REQUIRED", "message": "Use an eligible pharmacy you own."}
        circle = listing.audience.current_circle
        source = listing.pharmacy
        if circle == "OWNED_CHAIN" and source.owner_id != buying_pharmacy.owner_id:
            return False, {"code": "OUTSIDE_CURRENT_CIRCLE", "message": "This pharmacy is outside the current owner network."}
        if circle == "ORGANISATION" and (not source.organization_id or source.organization_id != buying_pharmacy.organization_id):
            return False, {"code": "OUTSIDE_CURRENT_CIRCLE", "message": "This pharmacy is outside the current organisation."}
    return True, None


def request_receipt(user, action, request_id, payload):
    payload_hash = hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()
    existing = MarketplaceRequestReceipt.objects.filter(actor=user, action=action, client_request_id=request_id).first()
    if existing and existing.payload_hash != payload_hash:
        raise ValidationError({"client_request_id": "REQUEST_ID_REUSED_WITH_DIFFERENT_PAYLOAD"})
    return existing, payload_hash


@transaction.atomic
def accept_exchange(exchange_id, user, expected_version, request_id, payload):
    existing, payload_hash = request_receipt(user, "EXCHANGE_ACCEPT", request_id, payload)
    if existing:
        return existing.outcome
    exchange = MarketplaceExchange.objects.select_for_update().select_related("listing").get(pk=exchange_id)
    listing = MarketplaceListing.objects.select_for_update().get(pk=exchange.listing_id)
    assert_listing_manager(user, listing)
    if exchange.version != expected_version:
        raise ValidationError({"expected_version": "STALE_VERSION"})
    if exchange.state not in (MarketplaceExchange.State.ENQUIRY, MarketplaceExchange.State.TERMS_PROPOSED):
        raise ValidationError({"state": "Exchange cannot be accepted from its current state."})
    if MarketplaceReservation.objects.filter(listing=listing, active=True).exists():
        raise ValidationError({"listing": "ALREADY_RESERVED"})
    MarketplaceReservation.objects.create(listing=listing, exchange=exchange)
    listing.availability_status = MarketplaceListing.Availability.RESERVED
    listing.save(update_fields=("availability_status", "updated_at"))
    exchange.state = MarketplaceExchange.State.ACCEPTED
    exchange.agreed_terms = exchange.proposed_terms
    exchange.version += 1
    exchange.save(update_fields=("state", "agreed_terms", "version", "updated_at"))
    outcome = {"id": str(exchange.id), "state": exchange.state, "version": exchange.version}
    MarketplaceRequestReceipt.objects.create(actor=user, action="EXCHANGE_ACCEPT", client_request_id=request_id, payload_hash=payload_hash, outcome=outcome)
    MarketplaceAuditEvent.objects.create(actor=user, action="EXCHANGE_ACCEPTED", target_type="exchange", target_id=str(exchange.id), safe_changes={"state": exchange.state})
    return outcome
