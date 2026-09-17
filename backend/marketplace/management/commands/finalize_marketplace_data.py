from django.core.management.base import BaseCommand
from django.db import transaction
from marketplace.models import ListingAudiencePolicy, MarketplaceListing


class Command(BaseCommand):
    help = "Backfill marketplace audience invariants introduced by the finalisation patch."

    @transaction.atomic
    def handle(self, *args, **options):
        fixed = 0
        rows = MarketplaceListing.objects.filter(seller_context=MarketplaceListing.SellerContext.PHARMACY, pharmacy__isnull=False).select_related("pharmacy")
        for listing in rows.iterator():
            audience, _ = ListingAudiencePolicy.objects.get_or_create(listing=listing, defaults={"allowed_buyer_roles": ["OWNER"]})
            changed = False
            if not audience.current_circle:
                audience.current_circle = ListingAudiencePolicy.Circle.OWNED_CHAIN; changed = True
            if not audience.maximum_circle:
                audience.maximum_circle = ListingAudiencePolicy.Circle.PLATFORM; changed = True
            if audience.source_owner_id != listing.pharmacy.owner_id:
                audience.source_owner_id = listing.pharmacy.owner_id; changed = True
            if audience.source_organization_id != listing.pharmacy.organization_id:
                audience.source_organization_id = listing.pharmacy.organization_id; changed = True
            if audience.allowed_buyer_roles != ["OWNER"]:
                audience.allowed_buyer_roles = ["OWNER"]; changed = True
            if changed:
                audience.save(); fixed += 1
        self.stdout.write(self.style.SUCCESS(f"Marketplace audience finalisation complete: {fixed} listing(s) updated."))
