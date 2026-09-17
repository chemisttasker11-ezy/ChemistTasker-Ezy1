from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from marketplace.policy import owns_pharmacy
from .models import EthicalAuditEvent, EthicalEscalationStep
from .policy import evaluate_ethical_access


@shared_task
def process_ethical_escalations(limit=100):
    if not settings.ETHICAL_ESCALATION_ENABLED:
        return 0
    processed = 0
    ids = list(EthicalEscalationStep.objects.filter(status="PENDING", due_at__lte=timezone.now()).values_list("id", flat=True)[:limit])
    for step_id in ids:
        with transaction.atomic():
            step = EthicalEscalationStep.objects.select_for_update().select_related("listing", "listing__product", "listing__pharmacy", "listing__accountable_owner").get(pk=step_id)
            listing = step.listing
            owner = listing.accountable_owner
            decision = evaluate_ethical_access(owner, listing.pharmacy, "APPROVE_TRANSFER", product=listing.product, mode=listing.mode)
            order = {"CHAIN_PHARMACIES": 1, "ORGANISATION_OWNERS": 2, "PLATFORM_OWNERS": 3}
            target_too_broad = order.get(step.target_circle, 99) > order.get(listing.maximum_circle, 0)
            s8_too_broad = listing.product.schedule.upper() == "S8" and step.target_circle == "PLATFORM_OWNERS"
            valid = decision.admitted and owns_pharmacy(owner, listing.pharmacy) and listing.status == "PUBLISHED" and listing.version == step.schedule_version and not s8_too_broad and not target_too_broad
            if valid:
                listing.current_circle = step.target_circle
                listing.save(update_fields=("current_circle", "updated_at"))
                step.status, step.processed_at = "PROCESSED", timezone.now()
                EthicalAuditEvent.objects.create(actor=owner, pharmacy=listing.pharmacy, action="ESCALATION_PROCESSED", target_type="listing", target_id=str(listing.id), safe_changes={"circle": step.target_circle})
                processed += 1
            else:
                step.status, step.reason = "PAUSED", "Policy, authority, stock state or consent revision changed"
            step.save(update_fields=("status", "processed_at", "reason", "updated_at"))
    return processed
