from django.contrib import admin

from .models import (
    EthicalAuditEvent,
    EthicalEscalationStep,
    EthicalImportBatch,
    EthicalJurisdictionPolicy,
    EthicalListing,
    EthicalPharmacyApproval,
    EthicalPharmacyGrant,
    EthicalProfessionalAccess,
    EthicalProduct,
    EthicalStockLot,
    EthicalTransfer,
)


@admin.register(EthicalPharmacyApproval)
class EthicalPharmacyApprovalAdmin(admin.ModelAdmin):
    list_display = ("pharmacy", "pbs_approval_number", "status", "accountable_owner", "checked_at", "updated_at")
    list_filter = ("status", "pharmacy__state")
    search_fields = ("pharmacy__name", "pbs_approval_number", "business_email", "accountable_owner__email")


@admin.register(EthicalListing)
class EthicalListingAdmin(admin.ModelAdmin):
    list_display = ("product", "pharmacy", "status", "current_circle", "maximum_circle", "prepared_by", "updated_at")
    list_filter = ("status", "current_circle", "maximum_circle", "product__schedule")
    search_fields = ("product__name", "pharmacy__name", "prepared_by__email", "accountable_owner__email")


@admin.register(EthicalProduct)
class EthicalProductAdmin(admin.ModelAdmin):
    list_display = ("name", "strength", "form", "schedule", "status", "updated_at")
    list_filter = ("schedule", "status")
    search_fields = ("name", "strength", "form", "pack_size", "identifiers__value")


admin.site.register((
    EthicalProfessionalAccess,
    EthicalJurisdictionPolicy,
    EthicalPharmacyGrant,
    EthicalImportBatch,
    EthicalStockLot,
    EthicalEscalationStep,
    EthicalTransfer,
    EthicalAuditEvent,
))
