import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


class TimeStamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class IdentityVerification(TimeStamped):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        VERIFIED = "VERIFIED", "Verified"
        REJECTED = "REJECTED", "Rejected"
        REVOKED = "REVOKED", "Revoked"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="marketplace_identity")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING, db_index=True)
    assurance_method = models.CharField(max_length=64)
    provider_reference = models.CharField(max_length=128, blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="marketplace_id_reviews")
    verified_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)


class MarketplaceTermsAcceptance(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="marketplace_terms")
    version = models.CharField(max_length=32)
    accepted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("user", "version"), name="uniq_market_terms_user_version")]


class MarketplaceRestriction(TimeStamped):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="marketplace_restrictions")
    pharmacy = models.ForeignKey("client_profile.Pharmacy", null=True, blank=True, on_delete=models.CASCADE, related_name="marketplace_restrictions")
    reason = models.CharField(max_length=255)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="marketplace_restriction_reviews")

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(user__isnull=False) | Q(pharmacy__isnull=False), name="market_restriction_has_target")]


class MarketplaceCategory(TimeStamped):
    class Context(models.TextChoices):
        PERSONAL = "PERSONAL", "Personal"
        PHARMACY = "PHARMACY", "Pharmacy"
        BOTH = "BOTH", "Both"

    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=100)
    description = models.CharField(max_length=300, blank=True)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="children")
    context = models.CharField(max_length=16, choices=Context.choices, default=Context.BOTH)
    permitted_modes = models.JSONField(default=list)
    maximum_buyer_roles = models.JSONField(default=list)
    field_schema = models.JSONField(default=dict, blank=True)
    policy_version = models.CharField(max_length=32, default="2026-09")
    is_active = models.BooleanField(default=True, db_index=True)
    requires_review = models.BooleanField(default=True)
    is_medicine = models.BooleanField(default=False, editable=False)


class MarketplaceListing(TimeStamped):
    class SellerContext(models.TextChoices):
        PERSONAL = "PERSONAL", "Personal"
        PHARMACY = "PHARMACY", "Pharmacy"
    class Mode(models.TextChoices):
        SELL = "SELL", "Sell"
        SWAP = "SWAP", "Swap"
        FREE = "FREE", "Free"
    class Publication(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PENDING_REVIEW = "PENDING_REVIEW", "Pending review"
        PUBLISHED = "PUBLISHED", "Published"
        REJECTED = "REJECTED", "Rejected"
        HIDDEN = "HIDDEN", "Hidden"
        ARCHIVED = "ARCHIVED", "Archived"
        WITHDRAWN = "WITHDRAWN", "Withdrawn"
    class Availability(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        RESERVED = "RESERVED", "Reserved"
        COMPLETED = "COMPLETED", "Completed"
        EXPIRED = "EXPIRED", "Expired"
        WITHDRAWN = "WITHDRAWN", "Withdrawn"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(max_length=180)
    creator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="marketplace_listings")
    seller_context = models.CharField(max_length=16, choices=SellerContext.choices)
    pharmacy = models.ForeignKey("client_profile.Pharmacy", null=True, blank=True, on_delete=models.PROTECT, related_name="marketplace_listings")
    category = models.ForeignKey(MarketplaceCategory, on_delete=models.PROTECT, related_name="listings")
    mode = models.CharField(max_length=8, choices=Mode.choices)
    title = models.CharField(max_length=140)
    description = models.TextField()
    attributes = models.JSONField(default=dict, blank=True)
    condition = models.CharField(max_length=64)
    quantity = models.PositiveIntegerField(default=1)
    unit = models.CharField(max_length=32, default="bundle")
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    desired_swap = models.TextField(blank=True)
    suburb = models.CharField(max_length=100)
    state = models.CharField(max_length=50)
    postcode = models.CharField(max_length=10, blank=True)
    private_pickup_details = models.TextField(blank=True)
    publication_status = models.CharField(max_length=24, choices=Publication.choices, default=Publication.DRAFT, db_index=True)
    availability_status = models.CharField(max_length=16, choices=Availability.choices, default=Availability.AVAILABLE, db_index=True)
    version = models.PositiveIntegerField(default=1)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=("publication_status", "availability_status", "-created_at")), models.Index(fields=("category", "-created_at"))]
        constraints = [
            models.CheckConstraint(condition=(Q(seller_context="PERSONAL", pharmacy__isnull=True) | Q(seller_context="PHARMACY", pharmacy__isnull=False)), name="market_listing_context_pharmacy"),
            models.CheckConstraint(condition=(Q(mode="SELL", amount__gt=0) | Q(mode="FREE", amount=0) | Q(mode="SWAP", amount=0)), name="market_listing_mode_amount"),
        ]

    def clean(self):
        if self.category_id and self.category.is_medicine:
            raise ValidationError("Medicines belong to the private ethical marketplace.")
        if self.mode == self.Mode.SWAP and not self.desired_swap.strip():
            raise ValidationError({"desired_swap": "Swap terms are required."})


class ListingAudiencePolicy(TimeStamped):
    class Circle(models.TextChoices):
        OWNED_CHAIN = "OWNED_CHAIN", "Owned pharmacies"
        ORGANISATION = "ORGANISATION", "Organisation"
        PLATFORM = "PLATFORM", "Platform owners"

    listing = models.OneToOneField(MarketplaceListing, on_delete=models.CASCADE, related_name="audience")
    allowed_buyer_roles = models.JSONField(default=list)
    current_circle = models.CharField(max_length=20, choices=Circle.choices, null=True, blank=True)
    maximum_circle = models.CharField(max_length=20, choices=Circle.choices, null=True, blank=True)
    source_owner_id = models.PositiveBigIntegerField(null=True, blank=True, editable=False)
    source_organization_id = models.PositiveBigIntegerField(null=True, blank=True, editable=False)
    public_discovery = models.BooleanField(default=True)
    policy_version = models.CharField(max_length=32, default="2026-09")


class ListingDeliveryTerms(TimeStamped):
    class Method(models.TextChoices):
        PICKUP = "PICKUP", "Pickup"
        POSTAGE = "POSTAGE", "Postage"
        BOTH = "BOTH", "Both"
    class Party(models.TextChoices):
        BUYER = "BUYER", "Buyer"
        SELLER = "SELLER", "Seller"

    listing = models.OneToOneField(MarketplaceListing, on_delete=models.CASCADE, related_name="delivery")
    method = models.CharField(max_length=12, choices=Method.choices)
    postage_payer = models.CharField(max_length=8, choices=Party.choices, blank=True)
    postage_organiser = models.CharField(max_length=8, choices=Party.choices, blank=True)
    known_cost = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    quote_required = models.BooleanField(default=False)
    notes = models.TextField(blank=True)


class ListingEscalationStep(TimeStamped):
    listing = models.ForeignKey(MarketplaceListing, on_delete=models.CASCADE, related_name="escalation_steps")
    target_circle = models.CharField(max_length=20, choices=ListingAudiencePolicy.Circle.choices)
    due_at = models.DateTimeField()
    schedule_version = models.PositiveIntegerField()
    status = models.CharField(max_length=16, default="PENDING")
    processed_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("listing", "schedule_version", "target_circle"), name="uniq_market_escalation_step")]


class MarketplaceImage(TimeStamped):
    listing = models.ForeignKey(MarketplaceListing, on_delete=models.CASCADE, related_name="images")
    uploader = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    original = models.ImageField(upload_to="marketplace/originals/%Y/%m/", max_length=300)
    derivative = models.ImageField(upload_to="marketplace/derivatives/%Y/%m/", max_length=300, blank=True)
    position = models.PositiveSmallIntegerField(default=0)
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    moderation_status = models.CharField(max_length=16, default="PENDING")
    alt_text = models.CharField(max_length=180, blank=True)

    class Meta:
        ordering = ("position", "id")
        constraints = [models.UniqueConstraint(fields=("listing", "position"), name="uniq_market_image_position")]


class MarketplaceListingRevision(models.Model):
    listing = models.ForeignKey(MarketplaceListing, on_delete=models.CASCADE, related_name="revisions")
    version = models.PositiveIntegerField()
    submitted_payload = models.JSONField()
    status = models.CharField(max_length=16, default="PENDING")
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("listing", "version"), name="uniq_market_listing_revision")]


class MarketplaceExchange(TimeStamped):
    class State(models.TextChoices):
        ENQUIRY = "ENQUIRY", "Enquiry"
        TERMS_PROPOSED = "TERMS_PROPOSED", "Terms proposed"
        ACCEPTED = "ACCEPTED", "Accepted"
        AWAITING_COMPLETION = "AWAITING_COMPLETION", "Awaiting completion"
        COMPLETED = "COMPLETED", "Completed"
        DECLINED = "DECLINED", "Declined"
        CANCELLED = "CANCELLED", "Cancelled"
        EXPIRED = "EXPIRED", "Expired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    listing = models.ForeignKey(MarketplaceListing, on_delete=models.PROTECT, related_name="exchanges")
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="marketplace_exchanges")
    buying_pharmacy = models.ForeignKey("client_profile.Pharmacy", null=True, blank=True, on_delete=models.PROTECT, related_name="marketplace_purchases")
    proposed_terms = models.JSONField(default=dict)
    agreed_terms = models.JSONField(default=dict)
    quantity = models.PositiveIntegerField(default=1)
    seller_confirmed = models.BooleanField(default=False)
    buyer_confirmed = models.BooleanField(default=False)
    state = models.CharField(max_length=24, choices=State.choices, default=State.ENQUIRY, db_index=True)
    version = models.PositiveIntegerField(default=1)


class MarketplaceMessage(models.Model):
    exchange = models.ForeignKey(MarketplaceExchange, on_delete=models.CASCADE, related_name="messages")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    body = models.TextField(max_length=4000)
    moderation_state = models.CharField(max_length=16, default="VISIBLE")
    created_at = models.DateTimeField(auto_now_add=True)


class MarketplaceExchangeParticipant(TimeStamped):
    exchange = models.ForeignKey(MarketplaceExchange, on_delete=models.CASCADE, related_name="participants")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="marketplace_participations")
    party_context = models.CharField(max_length=20)
    permissions = models.JSONField(default=list)
    blocked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("exchange", "user"), name="uniq_market_exchange_participant")]


class MarketplaceDeliveryLeg(TimeStamped):
    exchange = models.ForeignKey(MarketplaceExchange, on_delete=models.CASCADE, related_name="delivery_legs")
    direction = models.CharField(max_length=20)
    method = models.CharField(max_length=12, choices=ListingDeliveryTerms.Method.choices)
    payer = models.CharField(max_length=8, choices=ListingDeliveryTerms.Party.choices, blank=True)
    organiser = models.CharField(max_length=8, choices=ListingDeliveryTerms.Party.choices, blank=True)
    agreed_cost = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    quote_required = models.BooleanField(default=False)
    confirmed_by_buyer = models.BooleanField(default=False)
    confirmed_by_seller = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("exchange", "direction"), name="uniq_market_exchange_delivery_leg")]


class MarketplaceReservation(TimeStamped):
    listing = models.ForeignKey(MarketplaceListing, on_delete=models.PROTECT, related_name="reservations")
    exchange = models.OneToOneField(MarketplaceExchange, on_delete=models.PROTECT, related_name="reservation")
    active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    release_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("listing",), condition=Q(active=True), name="uniq_live_market_reservation")]


class MarketplaceInternalTransfer(TimeStamped):
    listing = models.ForeignKey(MarketplaceListing, on_delete=models.PROTECT, related_name="internal_transfers")
    source_pharmacy = models.ForeignKey("client_profile.Pharmacy", on_delete=models.PROTECT, related_name="marketplace_transfers_out")
    destination_pharmacy = models.ForeignKey("client_profile.Pharmacy", on_delete=models.PROTECT, related_name="marketplace_transfers_in")
    accountable_owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    transport_terms = models.JSONField(default=dict)
    state = models.CharField(max_length=24, default="PROPOSED")
    version = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [models.CheckConstraint(condition=~Q(source_pharmacy=models.F("destination_pharmacy")), name="market_internal_distinct_pharmacies")]


class MarketplaceSavedListing(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    listing = models.ForeignKey(MarketplaceListing, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("user", "listing"), name="uniq_saved_market_listing")]


class MarketplaceReport(TimeStamped):
    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    listing = models.ForeignKey(MarketplaceListing, on_delete=models.CASCADE, related_name="reports")
    public_reference = models.UUIDField(default=uuid.uuid4, editable=False)
    reason = models.TextField(max_length=2000)
    status = models.CharField(max_length=16, default="OPEN")


class MarketplaceAuditEvent(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    acting_pharmacy = models.ForeignKey("client_profile.Pharmacy", null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=80)
    target_type = models.CharField(max_length=80)
    target_id = models.CharField(max_length=64)
    reason = models.CharField(max_length=255, blank=True)
    safe_changes = models.JSONField(default=dict)
    correlation_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)


class MarketplaceRequestReceipt(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    action = models.CharField(max_length=80)
    client_request_id = models.UUIDField()
    payload_hash = models.CharField(max_length=64)
    outcome = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("actor", "action", "client_request_id"), name="uniq_market_request_receipt")]


class MarketplaceNotificationOutbox(TimeStamped):
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    event_type = models.CharField(max_length=80)
    safe_payload = models.JSONField(default=dict)
    deduplication_key = models.CharField(max_length=180, unique=True)
    attempts = models.PositiveIntegerField(default=0)
    next_retry_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, default="PENDING")


class MarketplaceCatalogueProduct(TimeStamped):
    name = models.CharField(max_length=240)
    brand = models.CharField(max_length=120, blank=True)
    description = models.TextField(blank=True)
    category = models.ForeignKey(MarketplaceCategory, on_delete=models.PROTECT, related_name="catalogue_products")
    status = models.CharField(max_length=20, default="PENDING", db_index=True)
    is_medicine = models.BooleanField(default=False, db_index=True)
    provenance = models.CharField(max_length=255)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)


class MarketplaceCatalogueIdentifier(models.Model):
    product = models.ForeignKey(MarketplaceCatalogueProduct, on_delete=models.CASCADE, related_name="identifiers")
    kind = models.CharField(max_length=30)
    value = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("kind", "value"), name="uniq_market_catalogue_identifier")]


class MarketplaceCatalogueImport(TimeStamped):
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    source_name = models.CharField(max_length=160)
    source_rights_attested = models.BooleanField(default=False)
    file = models.FileField(upload_to="marketplace/private/catalogue-imports/%Y/%m/", max_length=300)
    status = models.CharField(max_length=20, default="STAGED")
    row_count = models.PositiveIntegerField(default=0)


class MarketplaceCatalogueStagingRow(models.Model):
    batch = models.ForeignKey(MarketplaceCatalogueImport, on_delete=models.CASCADE, related_name="rows")
    row_number = models.PositiveIntegerField()
    safe_payload = models.JSONField(default=dict)
    status = models.CharField(max_length=20, default="PENDING")
    reason = models.CharField(max_length=255, blank=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("batch", "row_number"), name="uniq_market_catalogue_staging_row")]
