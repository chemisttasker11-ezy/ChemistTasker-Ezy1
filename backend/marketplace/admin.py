from django.contrib import admin

from .models import (IdentityVerification, MarketplaceAuditEvent, MarketplaceCategory,
                     MarketplaceListing, MarketplaceReport, MarketplaceRestriction,
                     MarketplaceTermsAcceptance)

admin.site.register((MarketplaceCategory, MarketplaceListing, MarketplaceReport, MarketplaceRestriction, MarketplaceTermsAcceptance, IdentityVerification, MarketplaceAuditEvent))
