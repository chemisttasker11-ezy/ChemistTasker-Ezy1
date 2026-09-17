from django.core.exceptions import ValidationError
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from .listing_policy import can_list_category
from .models import ListingAudiencePolicy, MarketplaceListing

AUDIENCE_ORDER = {ListingAudiencePolicy.Circle.OWNED_CHAIN: 1, ListingAudiencePolicy.Circle.ORGANISATION: 2, ListingAudiencePolicy.Circle.PLATFORM: 3}


@receiver(pre_save, sender=MarketplaceListing)
def enforce_listing_seller_policy(sender, instance: MarketplaceListing, **kwargs):
    if not instance.creator_id or not instance.category_id:
        return
    decision = can_list_category(instance.creator, instance.category, instance.seller_context, instance.pharmacy if instance.pharmacy_id else None)
    if not decision.allowed:
        raise ValidationError({"seller_context": f"{decision.code}: {decision.message}"})


@receiver(pre_save, sender=ListingAudiencePolicy)
def validate_listing_audience(sender, instance: ListingAudiencePolicy, **kwargs):
    listing = instance.listing
    if listing.seller_context != MarketplaceListing.SellerContext.PHARMACY:
        instance.current_circle = None
        instance.maximum_circle = None
        instance.source_owner_id = None
        instance.source_organization_id = None
        return
    if instance.current_circle and instance.current_circle not in AUDIENCE_ORDER:
        raise ValidationError({"current_circle": "Unsupported pharmacy audience circle."})
    if instance.maximum_circle and instance.maximum_circle not in AUDIENCE_ORDER:
        raise ValidationError({"maximum_circle": "Unsupported maximum pharmacy audience circle."})
    if instance.current_circle and instance.maximum_circle and AUDIENCE_ORDER[instance.current_circle] > AUDIENCE_ORDER[instance.maximum_circle]:
        raise ValidationError({"maximum_circle": "Maximum audience cannot be narrower than current audience."})
    if listing.pharmacy_id:
        instance.source_owner_id = listing.pharmacy.owner_id
        instance.source_organization_id = listing.pharmacy.organization_id


@receiver(post_save, sender=ListingAudiencePolicy)
def initialise_pharmacy_audience(sender, instance: ListingAudiencePolicy, created, **kwargs):
    listing = instance.listing
    if listing.seller_context != MarketplaceListing.SellerContext.PHARMACY or not listing.pharmacy_id:
        return
    updates = {}
    if not instance.current_circle:
        updates["current_circle"] = ListingAudiencePolicy.Circle.OWNED_CHAIN
    if not instance.maximum_circle:
        updates["maximum_circle"] = ListingAudiencePolicy.Circle.PLATFORM
    if not instance.source_owner_id:
        updates["source_owner_id"] = listing.pharmacy.owner_id
    if instance.source_organization_id != listing.pharmacy.organization_id:
        updates["source_organization_id"] = listing.pharmacy.organization_id
    if updates:
        ListingAudiencePolicy.objects.filter(pk=instance.pk).update(**updates)
