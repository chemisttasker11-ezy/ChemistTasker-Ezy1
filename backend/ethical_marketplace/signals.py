from django.core.exceptions import ValidationError
from django.db.models.signals import pre_save
from django.dispatch import receiver

from client_profile.models import Chain
from .models import EthicalListing

CIRCLE_ORDER = {EthicalListing.Circle.CHAIN_PHARMACIES:1, EthicalListing.Circle.ORGANISATION_OWNERS:2, EthicalListing.Circle.PLATFORM_OWNERS:3}


def resolve_source_chain(pharmacy):
    return Chain.objects.filter(owner_id=pharmacy.owner_id,is_active=True,pharmacies=pharmacy).order_by("id").first()


@receiver(pre_save,sender=EthicalListing)
def enforce_ethical_listing_scope(sender,instance:EthicalListing,**kwargs):
    if not instance.pharmacy_id or not instance.product_id:
        return
    pharmacy=instance.pharmacy
    instance.scope_owner_id=pharmacy.owner_id
    instance.scope_organization_id=pharmacy.organization_id
    instance.scope_chain=resolve_source_chain(pharmacy)
    current=instance.current_circle; maximum=instance.maximum_circle
    if current not in CIRCLE_ORDER or maximum not in CIRCLE_ORDER:
        raise ValidationError({"current_circle":"Choose a supported ethical audience circle."})
    if CIRCLE_ORDER[current]>CIRCLE_ORDER[maximum]:
        raise ValidationError({"maximum_circle":"The maximum ethical circle cannot be narrower than the current circle."})
    if current==EthicalListing.Circle.ORGANISATION_OWNERS and not pharmacy.organization_id:
        raise ValidationError({"current_circle":"This pharmacy is not linked to an organisation."})
    if (instance.product.schedule or "").upper()=="S8" and (current==EthicalListing.Circle.PLATFORM_OWNERS or maximum==EthicalListing.Circle.PLATFORM_OWNERS):
        raise ValidationError({"maximum_circle":"S8 can never reach the platform-owner circle."})
