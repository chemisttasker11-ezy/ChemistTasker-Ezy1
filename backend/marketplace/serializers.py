from rest_framework import serializers

from .models import ListingAudiencePolicy, ListingDeliveryTerms, MarketplaceCategory, MarketplaceExchange, MarketplaceListing, MarketplaceMessage
from .policy import ROLE_LABELS, resolved_role


class PublicCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MarketplaceCategory
        fields = ("id", "slug", "name", "description", "context", "permitted_modes", "maximum_buyer_roles", "field_schema", "policy_version")


class PublicListingSerializer(serializers.ModelSerializer):
    category = PublicCategorySerializer(read_only=True)
    summary = serializers.SerializerMethodField()
    item_amount = serializers.DecimalField(source="amount", max_digits=10, decimal_places=2)
    currency = serializers.SerializerMethodField()
    seller_role_label = serializers.SerializerMethodField()
    coarse_location = serializers.SerializerMethodField()
    permitted_buyer_labels = serializers.SerializerMethodField()
    delivery_options = serializers.SerializerMethodField()
    postage_payer = serializers.SerializerMethodField()
    postage_organiser = serializers.SerializerMethodField()
    postage_quote_required = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()

    class Meta:
        model = MarketplaceListing
        fields = ("id", "slug", "title", "summary", "description", "category", "condition", "mode", "item_amount", "currency", "seller_role_label", "coarse_location", "permitted_buyer_labels", "delivery_options", "postage_payer", "postage_organiser", "postage_quote_required", "images", "availability_status", "published_at")

    def get_summary(self, obj):
        return obj.description[:180]
    def get_currency(self, obj):
        return "AUD"
    def get_seller_role_label(self, obj):
        role = "OWNER" if obj.seller_context == MarketplaceListing.SellerContext.PHARMACY else resolved_role(obj.creator)
        return ROLE_LABELS.get(role, "Verified member")
    def get_coarse_location(self, obj):
        return ", ".join(value for value in (obj.suburb, obj.state) if value)
    def get_permitted_buyer_labels(self, obj):
        roles = getattr(getattr(obj, "audience", None), "allowed_buyer_roles", [])
        return [ROLE_LABELS.get(role, role.replace("_", " ").title()) for role in roles]
    def get_delivery_options(self, obj):
        delivery = getattr(obj, "delivery", None)
        return [delivery.get_method_display()] if delivery else []
    def get_postage_payer(self, obj):
        return getattr(getattr(obj, "delivery", None), "postage_payer", "")
    def get_postage_organiser(self, obj):
        return getattr(getattr(obj, "delivery", None), "postage_organiser", "")
    def get_postage_quote_required(self, obj):
        return bool(getattr(getattr(obj, "delivery", None), "quote_required", False))
    def get_images(self, obj):
        request = self.context.get("request")
        rows = []
        for image in obj.images.filter(moderation_status="APPROVED"):
            if not image.derivative:
                continue
            rows.append({"derivative_url": request.build_absolute_uri(f"/api/marketplace/images/{image.pk}/") if request else f"/api/marketplace/images/{image.pk}/", "alt": image.alt_text})
        return rows


class ListingWriteSerializer(serializers.ModelSerializer):
    allowed_buyer_roles = serializers.ListField(child=serializers.CharField(max_length=32), write_only=True)
    delivery = serializers.DictField(write_only=True)
    expected_version = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = MarketplaceListing
        fields = ("id", "slug", "seller_context", "pharmacy", "category", "mode", "title", "description", "attributes", "condition", "quantity", "unit", "amount", "desired_swap", "suburb", "state", "postcode", "private_pickup_details", "allowed_buyer_roles", "delivery", "expected_version", "publication_status", "availability_status", "version")
        read_only_fields = ("id", "slug", "publication_status", "availability_status", "version")

    def validate(self, attrs):
        category = attrs.get("category", getattr(self.instance, "category", None))
        mode = attrs.get("mode", getattr(self.instance, "mode", None))
        seller_context = attrs.get("seller_context", getattr(self.instance, "seller_context", None))
        pharmacy = attrs.get("pharmacy", getattr(self.instance, "pharmacy", None))
        if category and (category.is_medicine or mode not in category.permitted_modes):
            raise serializers.ValidationError({"category": "This item cannot be listed in the ordinary marketplace."})
        if category and category.context not in (seller_context, "BOTH"):
            raise serializers.ValidationError({"seller_context": "This category is not available in that seller context."})
        if seller_context == "PERSONAL" and pharmacy:
            raise serializers.ValidationError({"pharmacy": "Personal listings cannot carry a pharmacy identity."})
        roles = attrs.get("allowed_buyer_roles")
        if roles is not None and (not roles or not set(roles).issubset(set(category.maximum_buyer_roles))):
            raise serializers.ValidationError({"allowed_buyer_roles": "Choose at least one buyer role permitted by the category."})
        amount = attrs.get("amount", getattr(self.instance, "amount", 0))
        desired_swap = attrs.get("desired_swap", getattr(self.instance, "desired_swap", ""))
        if mode == "SELL" and amount <= 0:
            raise serializers.ValidationError({"amount": "Sell listings require a positive AUD amount."})
        if mode in ("FREE", "SWAP") and amount != 0:
            raise serializers.ValidationError({"amount": "Free and swap listings do not use an item price."})
        if mode == "SWAP" and not desired_swap.strip():
            raise serializers.ValidationError({"desired_swap": "Describe the requested swap item."})
        delivery = attrs.get("delivery")
        if delivery:
            method = delivery.get("method")
            if method not in ("PICKUP", "POSTAGE", "BOTH"):
                raise serializers.ValidationError({"delivery": "Choose pickup, postage or both."})
            if method in ("POSTAGE", "BOTH") and (delivery.get("postage_payer") not in ("BUYER", "SELLER") or delivery.get("postage_organiser") not in ("BUYER", "SELLER")):
                raise serializers.ValidationError({"delivery": "Postage payer and organiser are independently required."})
        if self.instance and attrs.get("expected_version", self.instance.version) != self.instance.version:
            raise serializers.ValidationError({"expected_version": "STALE_VERSION"})
        return attrs

    def create(self, validated_data):
        audience = validated_data.pop("allowed_buyer_roles")
        delivery = validated_data.pop("delivery")
        validated_data.pop("expected_version", None)
        listing = MarketplaceListing.objects.create(**validated_data)
        ListingAudiencePolicy.objects.create(listing=listing, allowed_buyer_roles=audience)
        ListingDeliveryTerms.objects.create(listing=listing, **delivery)
        return listing

    def update(self, instance, validated_data):
        audience = validated_data.pop("allowed_buyer_roles", None)
        delivery = validated_data.pop("delivery", None)
        validated_data.pop("expected_version", None)
        for name, value in validated_data.items():
            setattr(instance, name, value)
        instance.version += 1
        instance.full_clean()
        instance.save()
        if audience is not None:
            instance.audience.allowed_buyer_roles = audience
            instance.audience.save(update_fields=("allowed_buyer_roles", "updated_at"))
        if delivery is not None:
            for name, value in delivery.items():
                setattr(instance.delivery, name, value)
            instance.delivery.full_clean()
            instance.delivery.save()
        return instance


class MessageSerializer(serializers.ModelSerializer):
    author_label = serializers.SerializerMethodField()
    class Meta:
        model = MarketplaceMessage
        fields = ("id", "author_label", "body", "created_at")
        read_only_fields = ("id", "author_label", "created_at")
    def get_author_label(self, obj):
        return ROLE_LABELS.get(resolved_role(obj.author), "Verified member")


class ExchangeSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    listing_title = serializers.CharField(source="listing.title", read_only=True)
    allowed_actions = serializers.SerializerMethodField()
    class Meta:
        model = MarketplaceExchange
        fields = ("id", "listing", "listing_title", "buying_pharmacy", "proposed_terms", "agreed_terms", "quantity", "state", "version", "seller_confirmed", "buyer_confirmed", "created_at", "updated_at", "messages", "allowed_actions")
        read_only_fields = fields

    def get_allowed_actions(self, obj):
        request = self.context.get("request")
        if not request:
            return []
        seller = obj.listing.creator_id == request.user.id
        actions = ["message"]
        if obj.state in ("ENQUIRY", "TERMS_PROPOSED"):
            actions.extend(("propose-terms", "cancel"))
            if seller:
                actions.extend(("accept", "decline"))
        if obj.state in ("ACCEPTED", "AWAITING_COMPLETION"):
            actions.extend(("confirm-completion", "cancel"))
        return actions
