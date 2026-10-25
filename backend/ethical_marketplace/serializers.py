from rest_framework import serializers

from .models import (EthicalImportBatch, EthicalListing, EthicalListingLot, EthicalMessage,
                     EthicalPharmacyApproval, EthicalPharmacyGrant, EthicalProduct,
                     EthicalStockLot, EthicalTransfer, EthicalTransferLine)
from .policy import evaluate_ethical_access


class ApprovalSerializer(serializers.ModelSerializer):
    class Meta:
        model = EthicalPharmacyApproval
        fields = ("id", "pharmacy", "pbs_approval_number", "evidence", "business_phone", "business_email", "status", "owner_confirmed_at", "checked_at", "due_at", "review_reason", "created_at", "updated_at")
        read_only_fields = ("id", "pharmacy", "status", "owner_confirmed_at", "checked_at", "due_at", "review_reason", "created_at", "updated_at")
        extra_kwargs = {"evidence": {"write_only": True}}


class GrantSerializer(serializers.ModelSerializer):
    class Meta:
        model = EthicalPharmacyGrant
        fields = ("id", "pharmacy", "user", "pharmacy_admin", "allowed_actions", "valid_from", "valid_until", "revoked_at", "revocation_reason", "created_at")
        read_only_fields = ("id", "pharmacy", "revoked_at", "revocation_reason", "created_at")


class ProductSerializer(serializers.ModelSerializer):
    identifiers = serializers.SerializerMethodField()
    class Meta:
        model = EthicalProduct
        fields = ("id", "name", "strength", "form", "pack_size", "schedule", "flags", "identifiers")
    def get_identifiers(self, obj):
        return [{"kind": row.kind, "value": row.value} for row in obj.identifiers.all()]


class StockLotSerializer(serializers.ModelSerializer):
    available_quantity = serializers.IntegerField(read_only=True)
    product_detail = ProductSerializer(source="product", read_only=True)
    expected_version = serializers.IntegerField(write_only=True, required=False)
    class Meta:
        model = EthicalStockLot
        fields = ("id", "pharmacy", "product", "product_detail", "batch_number", "expiry_date", "intact_pack_unit", "on_hand_quantity", "reserved_quantity", "available_quantity", "storage_checks", "source_reference", "last_reconciled_at", "status", "version", "expected_version")
        read_only_fields = ("id", "reserved_quantity", "available_quantity", "status", "version")

    def update(self, instance, validated_data):
        validated_data.pop("expected_version", None)
        return super().update(instance, validated_data)


class ListingLotSerializer(serializers.ModelSerializer):
    lot_detail = StockLotSerializer(source="lot", read_only=True)
    class Meta:
        model = EthicalListingLot
        fields = ("id", "lot", "quantity", "lot_detail")

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if not request or not evaluate_ethical_access(request.user, instance.lot.pharmacy, "MANAGE_OWN_STOCK", product=instance.lot.product).admitted:
            data.pop("lot_detail", None)
        return data


class EthicalListingSerializer(serializers.ModelSerializer):
    product_detail = ProductSerializer(source="product", read_only=True)
    lots = ListingLotSerializer(source="lot_allocations", many=True, write_only=True, required=False)
    lot_allocations = ListingLotSerializer(many=True, read_only=True)
    expected_version = serializers.IntegerField(write_only=True, required=False)
    class Meta:
        model = EthicalListing
        fields = ("id", "pharmacy", "product", "product_detail", "mode", "amount", "current_circle", "maximum_circle", "scope_chain", "status", "version", "published_at", "lots", "lot_allocations", "expected_version", "created_at", "updated_at")
        read_only_fields = ("id", "status", "version", "published_at", "lot_allocations", "created_at", "updated_at")

    def validate(self, attrs):
        if self.instance:
            pharmacy = attrs.get("pharmacy", self.instance.pharmacy)
            product = attrs.get("product", self.instance.product)
            if self.instance.lot_allocations.exclude(lot__pharmacy=pharmacy, lot__product=product).exists():
                raise serializers.ValidationError({"lots": "Existing lots must belong to the listing pharmacy and product."})
        return attrs

    def create(self, validated_data):
        validated_data.pop("lot_allocations", None)
        validated_data.pop("expected_version", None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("lot_allocations", None)
        validated_data.pop("expected_version", None)
        return super().update(instance, validated_data)


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = EthicalMessage
        fields = ("id", "body", "created_at")
        read_only_fields = ("id", "created_at")


class TransferLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = EthicalTransferLine
        fields = ("id", "lot", "quantity", "unit_amount")


class TransferSerializer(serializers.ModelSerializer):
    lines = TransferLineSerializer(many=True, read_only=True)
    class Meta:
        model = EthicalTransfer
        fields = ("id", "listing", "source_pharmacy", "destination_pharmacy", "mode", "terms", "legal_basis", "state", "version", "dispatched_at", "received_at", "lines", "created_at", "updated_at")
