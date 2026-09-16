import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class TimeStamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        abstract = True


class EthicalPharmacyApproval(TimeStamped):
    class Status(models.TextChoices):
        NOT_SUBMITTED = "NOT_SUBMITTED", "Not submitted"
        PENDING_REVIEW = "PENDING_REVIEW", "Pending review"
        VERIFIED = "VERIFIED", "Verified"
        REJECTED = "REJECTED", "Rejected"
        REVERIFY_REQUIRED = "REVERIFY_REQUIRED", "Reverification required"
        SUSPENDED = "SUSPENDED", "Suspended"
        REVOKED = "REVOKED", "Revoked"

    pharmacy = models.OneToOneField("client_profile.Pharmacy", on_delete=models.CASCADE, related_name="ethical_approval")
    applicant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="ethical_applications")
    accountable_owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="ethical_approvals_owned")
    pbs_approval_number = models.CharField(max_length=80, blank=True)
    evidence = models.FileField(upload_to="ethical/private/approvals/%Y/%m/", blank=True, max_length=300)
    business_phone = models.CharField(max_length=32)
    business_email = models.EmailField()
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.NOT_SUBMITTED, db_index=True)
    owner_confirmed_at = models.DateTimeField(null=True, blank=True)
    checked_at = models.DateTimeField(null=True, blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="ethical_approval_reviews")
    review_method = models.CharField(max_length=80, blank=True)
    review_reason = models.TextField(blank=True)


class EthicalProfessionalAccess(TimeStamped):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        VERIFIED = "VERIFIED", "Verified"
        REVOKED = "REVOKED", "Revoked"
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ethical_professional_access")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    professional_basis = models.CharField(max_length=120)
    schedules = models.JSONField(default=list)
    activities = models.JSONField(default=list)
    jurisdictions = models.JSONField(default=list)
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="ethical_professional_reviews")
    verified_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)


class EthicalPharmacyGrant(TimeStamped):
    pharmacy = models.ForeignKey("client_profile.Pharmacy", on_delete=models.CASCADE, related_name="ethical_grants")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ethical_grants")
    pharmacy_admin = models.ForeignKey("client_profile.PharmacyAdmin", on_delete=models.PROTECT, related_name="ethical_grants")
    grantor_owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="ethical_grants_issued")
    allowed_actions = models.JSONField(default=list)
    valid_from = models.DateTimeField()
    valid_until = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revocation_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("pharmacy", "user"), condition=Q(revoked_at__isnull=True), name="uniq_active_ethical_grant")]


class EthicalJurisdictionPolicy(TimeStamped):
    jurisdiction = models.CharField(max_length=50)
    activity = models.CharField(max_length=50)
    schedule = models.CharField(max_length=20)
    mode = models.CharField(max_length=20)
    allowed = models.BooleanField(default=False)
    effective_from = models.DateTimeField()
    effective_until = models.DateTimeField(null=True, blank=True)
    policy_version = models.CharField(max_length=32)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("jurisdiction", "activity", "schedule", "mode", "effective_from"), name="uniq_ethical_jurisdiction_policy")]


class EthicalProduct(TimeStamped):
    name = models.CharField(max_length=240)
    strength = models.CharField(max_length=80)
    form = models.CharField(max_length=80)
    pack_size = models.CharField(max_length=80)
    schedule = models.CharField(max_length=20, db_index=True)
    classification_provenance = models.CharField(max_length=255)
    flags = models.JSONField(default=list)
    status = models.CharField(max_length=16, default="PENDING", db_index=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)


class EthicalProductIdentifier(models.Model):
    product = models.ForeignKey(EthicalProduct, on_delete=models.CASCADE, related_name="identifiers")
    kind = models.CharField(max_length=30)
    value = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("kind", "value"), name="uniq_ethical_product_identifier")]


class EthicalImportBatch(TimeStamped):
    pharmacy = models.ForeignKey("client_profile.Pharmacy", on_delete=models.PROTECT, related_name="ethical_imports")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    source_name = models.CharField(max_length=160)
    source_rights_attested = models.BooleanField(default=False)
    file = models.FileField(upload_to="ethical/private/imports/%Y/%m/", max_length=300)
    status = models.CharField(max_length=20, default="STAGED")
    row_count = models.PositiveIntegerField(default=0)
    accepted_count = models.PositiveIntegerField(default=0)
    rejected_count = models.PositiveIntegerField(default=0)


class EthicalStagingRow(models.Model):
    batch = models.ForeignKey(EthicalImportBatch, on_delete=models.CASCADE, related_name="rows")
    row_number = models.PositiveIntegerField()
    safe_payload = models.JSONField(default=dict)
    status = models.CharField(max_length=20, default="PENDING")
    reason = models.CharField(max_length=255, blank=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("batch", "row_number"), name="uniq_ethical_staging_row")]


class EthicalStockLot(TimeStamped):
    pharmacy = models.ForeignKey("client_profile.Pharmacy", on_delete=models.PROTECT, related_name="ethical_stock_lots")
    product = models.ForeignKey(EthicalProduct, on_delete=models.PROTECT, related_name="stock_lots")
    batch_number = models.CharField(max_length=100)
    expiry_date = models.DateField()
    intact_pack_unit = models.CharField(max_length=50, default="pack")
    on_hand_quantity = models.PositiveIntegerField()
    reserved_quantity = models.PositiveIntegerField(default=0)
    storage_checks = models.JSONField(default=dict)
    source_reference = models.CharField(max_length=160)
    last_reconciled_at = models.DateTimeField()
    status = models.CharField(max_length=20, default="AVAILABLE", db_index=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(reserved_quantity__lte=models.F("on_hand_quantity")), name="ethical_reserved_lte_on_hand")]

    @property
    def available_quantity(self):
        return self.on_hand_quantity - self.reserved_quantity


class EthicalStockMovement(models.Model):
    lot = models.ForeignKey(EthicalStockLot, on_delete=models.PROTECT, related_name="movements")
    movement_type = models.CharField(max_length=30)
    quantity_delta = models.IntegerField()
    resulting_on_hand = models.PositiveIntegerField()
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    reference_type = models.CharField(max_length=60)
    reference_id = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)


class EthicalListing(TimeStamped):
    class Circle(models.TextChoices):
        CHAIN_PHARMACIES = "CHAIN_PHARMACIES", "Chain pharmacies"
        ORGANISATION_OWNERS = "ORGANISATION_OWNERS", "Organisation owners"
        PLATFORM_OWNERS = "PLATFORM_OWNERS", "Platform owners"
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"
        RESERVED = "RESERVED", "Reserved"
        WITHDRAWN = "WITHDRAWN", "Withdrawn"
        COMPLETED = "COMPLETED", "Completed"
        QUARANTINED = "QUARANTINED", "Quarantined"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pharmacy = models.ForeignKey("client_profile.Pharmacy", on_delete=models.PROTECT, related_name="ethical_listings")
    accountable_owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="ethical_listings_owned")
    prepared_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="ethical_listings_prepared")
    product = models.ForeignKey(EthicalProduct, on_delete=models.PROTECT, related_name="listings")
    mode = models.CharField(max_length=20)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    current_circle = models.CharField(max_length=30, choices=Circle.choices)
    maximum_circle = models.CharField(max_length=30, choices=Circle.choices)
    scope_owner_id = models.PositiveBigIntegerField()
    scope_chain = models.ForeignKey("client_profile.Chain", null=True, blank=True, on_delete=models.PROTECT)
    scope_organization_id = models.PositiveBigIntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    version = models.PositiveIntegerField(default=1)
    published_at = models.DateTimeField(null=True, blank=True)


class EthicalListingLot(models.Model):
    listing = models.ForeignKey(EthicalListing, on_delete=models.CASCADE, related_name="lot_allocations")
    lot = models.ForeignKey(EthicalStockLot, on_delete=models.PROTECT, related_name="listing_allocations")
    quantity = models.PositiveIntegerField()
    class Meta:
        constraints = [models.UniqueConstraint(fields=("listing", "lot"), name="uniq_ethical_listing_lot")]


class EthicalListingRevision(models.Model):
    listing = models.ForeignKey(EthicalListing, on_delete=models.CASCADE, related_name="revisions")
    version = models.PositiveIntegerField()
    payload = models.JSONField()
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=20, default="PENDING")
    reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("listing", "version"), name="uniq_ethical_listing_revision")]


class EthicalEscalationStep(TimeStamped):
    listing = models.ForeignKey(EthicalListing, on_delete=models.CASCADE, related_name="escalation_steps")
    target_circle = models.CharField(max_length=30, choices=EthicalListing.Circle.choices)
    due_at = models.DateTimeField()
    schedule_version = models.PositiveIntegerField()
    status = models.CharField(max_length=20, default="PENDING")
    processed_at = models.DateTimeField(null=True, blank=True)
    reason = models.CharField(max_length=255, blank=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("listing", "target_circle", "schedule_version"), name="uniq_ethical_escalation_step")]


class EthicalTransfer(TimeStamped):
    class State(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        REVIEWED = "REVIEWED", "Reviewed"
        AGREED = "AGREED", "Agreed"
        AUTHORISED_FOR_DISPATCH = "AUTHORISED_FOR_DISPATCH", "Authorised for dispatch"
        DISPATCHED = "DISPATCHED", "Dispatched"
        RECEIVED = "RECEIVED", "Received"
        DECLINED = "DECLINED", "Declined"
        CANCELLED = "CANCELLED", "Cancelled"
        EXPIRED = "EXPIRED", "Expired"
        QUARANTINED = "QUARANTINED", "Quarantined"
        DISCREPANCY = "DISCREPANCY", "Discrepancy"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    listing = models.ForeignKey(EthicalListing, on_delete=models.PROTECT, related_name="transfers")
    source_pharmacy = models.ForeignKey("client_profile.Pharmacy", on_delete=models.PROTECT, related_name="ethical_transfers_out")
    destination_pharmacy = models.ForeignKey("client_profile.Pharmacy", on_delete=models.PROTECT, related_name="ethical_transfers_in")
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="ethical_transfers_requested")
    source_approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="ethical_transfers_source_approved")
    destination_approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="ethical_transfers_destination_approved")
    mode = models.CharField(max_length=20)
    terms = models.JSONField(default=dict)
    legal_basis = models.CharField(max_length=255, blank=True)
    state = models.CharField(max_length=30, choices=State.choices, default=State.REQUESTED, db_index=True)
    version = models.PositiveIntegerField(default=1)
    dispatched_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=~Q(source_pharmacy=models.F("destination_pharmacy")), name="ethical_transfer_distinct_pharmacies")]


class EthicalTransferLine(models.Model):
    transfer = models.ForeignKey(EthicalTransfer, on_delete=models.CASCADE, related_name="lines")
    lot = models.ForeignKey(EthicalStockLot, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    unit_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("transfer", "lot"), name="uniq_ethical_transfer_lot")]


class EthicalReservation(TimeStamped):
    transfer_line = models.OneToOneField(EthicalTransferLine, on_delete=models.PROTECT, related_name="reservation")
    lot = models.ForeignKey(EthicalStockLot, on_delete=models.PROTECT, related_name="reservations")
    quantity = models.PositiveIntegerField()
    active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)


class EthicalMessage(models.Model):
    transfer = models.ForeignKey(EthicalTransfer, on_delete=models.CASCADE, related_name="messages")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    body = models.TextField(max_length=4000)
    created_at = models.DateTimeField(auto_now_add=True)


class EthicalTransferDocument(TimeStamped):
    transfer = models.ForeignKey(EthicalTransfer, on_delete=models.PROTECT, related_name="documents")
    document_type = models.CharField(max_length=80)
    file = models.FileField(upload_to="ethical/private/transfers/%Y/%m/", max_length=300)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)


class EthicalPolicyDecision(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    pharmacy = models.ForeignKey("client_profile.Pharmacy", null=True, on_delete=models.PROTECT)
    operation = models.CharField(max_length=80)
    allowed = models.BooleanField()
    reason_code = models.CharField(max_length=80)
    policy_version = models.CharField(max_length=32)
    created_at = models.DateTimeField(auto_now_add=True)


class EthicalAuditEvent(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    pharmacy = models.ForeignKey("client_profile.Pharmacy", null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=80)
    target_type = models.CharField(max_length=80)
    target_id = models.CharField(max_length=64)
    safe_changes = models.JSONField(default=dict)
    correlation_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)


class EthicalNotificationOutbox(TimeStamped):
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    event_type = models.CharField(max_length=80)
    safe_payload = models.JSONField(default=dict)
    deduplication_key = models.CharField(max_length=180, unique=True)
    status = models.CharField(max_length=20, default="PENDING")
    attempts = models.PositiveIntegerField(default=0)


class EthicalRequestReceipt(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    action = models.CharField(max_length=80)
    client_request_id = models.UUIDField()
    payload_hash = models.CharField(max_length=64)
    outcome = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=("actor", "action", "client_request_id"), name="uniq_ethical_request_receipt")]
