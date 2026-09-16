from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import ListingEscalationStep, MarketplaceAuditEvent
from .services import assert_listing_manager


@shared_task
def process_goods_escalations(limit=100):
    if not settings.MARKETPLACE_ESCALATION_ENABLED:
        return 0
    processed = 0
    step_ids = list(ListingEscalationStep.objects.filter(status="PENDING", due_at__lte=timezone.now()).values_list("id", flat=True)[:limit])
    for step_id in step_ids:
        with transaction.atomic():
            step = ListingEscalationStep.objects.select_for_update().select_related("listing", "listing__creator", "listing__pharmacy", "listing__audience").get(pk=step_id)
            listing = step.listing
            try:
                assert_listing_manager(listing.creator, listing)
            except Exception:
                step.status, step.cancellation_reason = "PAUSED", "Authority or eligibility changed"
            else:
                valid = listing.publication_status == "PUBLISHED" and listing.availability_status == "AVAILABLE" and listing.version == step.schedule_version
                if valid:
                    listing.audience.current_circle = step.target_circle
                    listing.audience.save(update_fields=("current_circle", "updated_at"))
                    step.status, step.processed_at = "PROCESSED", timezone.now()
                    MarketplaceAuditEvent.objects.create(actor=listing.creator, acting_pharmacy=listing.pharmacy, action="ESCALATION_PROCESSED", target_type="listing", target_id=str(listing.id), safe_changes={"circle": step.target_circle})
                    processed += 1
                else:
                    step.status, step.cancellation_reason = "PAUSED", "Listing state or consent revision changed"
            step.save(update_fields=("status", "processed_at", "cancellation_reason", "updated_at"))
    return processed
