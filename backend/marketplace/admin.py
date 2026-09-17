from django.contrib import admin
from django.utils import timezone
from .models import (IdentityVerification, MarketplaceAuditEvent, MarketplaceCatalogueImport, MarketplaceCatalogueProduct, MarketplaceCategory, MarketplaceImage, MarketplaceListing, MarketplaceReport, MarketplaceRestriction, MarketplaceTermsAcceptance)

@admin.register(MarketplaceListing)
class MarketplaceListingAdmin(admin.ModelAdmin):
    list_display=("title","seller_context","publication_status","availability_status","created_at")
    list_filter=("seller_context","publication_status","availability_status","category")
    search_fields=("title","description","creator__email","pharmacy__name")
    actions=("publish_selected","reject_selected","hide_selected")
    @admin.action(description="Publish reviewed listings")
    def publish_selected(self,request,queryset): queryset.filter(publication_status__in=("PENDING_REVIEW","REJECTED")).update(publication_status="PUBLISHED",published_at=timezone.now())
    @admin.action(description="Reject listings")
    def reject_selected(self,request,queryset): queryset.exclude(publication_status="PUBLISHED").update(publication_status="REJECTED")
    @admin.action(description="Hide listings immediately")
    def hide_selected(self,request,queryset): queryset.update(publication_status="HIDDEN")

@admin.register(MarketplaceImage)
class MarketplaceImageAdmin(admin.ModelAdmin):
    list_display=("id","listing","moderation_status","position","created_at")
    list_filter=("moderation_status",)
    actions=("approve_images","reject_images")
    @admin.action(description="Approve selected listing images")
    def approve_images(self,request,queryset): queryset.update(moderation_status="APPROVED")
    @admin.action(description="Reject selected listing images")
    def reject_images(self,request,queryset): queryset.update(moderation_status="REJECTED")

@admin.register(MarketplaceCategory)
class MarketplaceCategoryAdmin(admin.ModelAdmin):
    list_display=("name","slug","context","is_active","requires_review","policy_version")
    list_filter=("context","is_active","requires_review")
    search_fields=("name","slug","description")

admin.site.register((MarketplaceReport,MarketplaceRestriction,MarketplaceTermsAcceptance,IdentityVerification,MarketplaceAuditEvent,MarketplaceCatalogueProduct,MarketplaceCatalogueImport))
