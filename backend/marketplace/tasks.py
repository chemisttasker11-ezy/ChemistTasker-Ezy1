from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from .models import ListingEscalationStep, MarketplaceAuditEvent, MarketplaceListing
from .services import assert_listing_manager


@shared_task
def process_goods_escalations(limit=100):
    if not settings.MARKETPLACE_ESCALATION_ENABLED:
        return 0
    processed = 0
    step_ids = list(ListingEscalationStep.objects.filter(status="PENDING", due_at__lte=timezone.now()).values_list("id", flat=True)[:limit])
    for step_id in step_ids:
        with transaction.atomic():
            reference = ListingEscalationStep.objects.filter(pk=step_id).values("listing_id", "listing__creator_id").first()
            if not reference:
                continue
            actor = get_user_model().objects.select_for_update().get(pk=reference["listing__creator_id"])
            listing = MarketplaceListing.objects.select_for_update(of=("self",)).select_related("pharmacy", "audience").filter(pk=reference["listing_id"]).first()
            if not listing:
                continue
            step = ListingEscalationStep.objects.select_for_update().filter(pk=step_id, status="PENDING", due_at__lte=timezone.now()).first()
            if not step:
                continue
            try:
                assert_listing_manager(actor, listing)
            except Exception:
                step.status, step.cancellation_reason = "PAUSED", "Authority or eligibility changed"
            else:
                order = {"OWNED_CHAIN": 1, "ORGANISATION": 2, "PLATFORM": 3}
                target_too_broad = order.get(step.target_circle, 99) > order.get(getattr(listing.audience, "maximum_circle", ""), 0)
                valid = listing.publication_status == "PUBLISHED" and listing.availability_status == "AVAILABLE" and listing.version == step.schedule_version and not target_too_broad
                if valid:
                    listing.audience.current_circle = step.target_circle
                    listing.audience.save(update_fields=("current_circle", "updated_at"))
                    step.status, step.processed_at = "PROCESSED", timezone.now()
                    MarketplaceAuditEvent.objects.create(actor=actor, acting_pharmacy=listing.pharmacy, action="ESCALATION_PROCESSED", target_type="listing", target_id=str(listing.id), safe_changes={"circle": step.target_circle})
                    processed += 1
                else:
                    step.status, step.cancellation_reason = "PAUSED", "Listing state or consent revision changed"
            step.save(update_fields=("status", "processed_at", "cancellation_reason", "updated_at"))
    return processed
