"""client_profile models: orgs (split verbatim from client_profile/models.py)."""
from django.db import models
from django.db.models import Q
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from client_profile.models.common import _unique_upload_path
from client_profile.models.onboarding import OwnerOnboarding


def organization_cover_upload_path(instance, filename):
    owner = instance.pk or "new"
    return _unique_upload_path(f"organizations/{owner}/covers", filename)


def pharmacy_upload_path(instance, filename, folder):
    owner = instance.pk or getattr(instance, "owner_id", None) or "new"
    return _unique_upload_path(f"pharmacies/{owner}/{folder}", filename)


def pharmacy_reg_doc_upload_path(instance, filename):
    return pharmacy_upload_path(instance, filename, "reg_docs")


def pharmacy_other_doc_upload_path(instance, filename):
    return pharmacy_upload_path(instance, filename, "other_docs")


def pharmacy_cover_upload_path(instance, filename):
    return pharmacy_upload_path(instance, filename, "covers")


def chain_logo_upload_path(instance, filename):
    owner = instance.pk or getattr(instance, "owner_id", None) or "new"
    return _unique_upload_path(f"chains/{owner}/logos", filename)


class Organization(models.Model):
    """
    Corporate entity that claims pharmacies and manages org users.
    """
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True, db_index=True)
    about = models.TextField(blank=True, null=True)
    cover_image = models.ImageField(
        upload_to=organization_cover_upload_path, blank=True, null=True
    )

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        # Auto-generate a slug from the name if one has not been set
        if not self.slug and self.name:
            from django.utils.text import slugify
            base_slug = slugify(self.name)
            slug = base_slug
            idx = 1
            while Organization.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                idx += 1
                slug = f"{base_slug}-{idx}"
            self.slug = slug
        super().save(*args, **kwargs)


# Pharmacy Model - Represents an individual pharmacy
class Pharmacy(models.Model):
    EMPLOYMENT_CHOICES = [
        ('PART_TIME', 'Part-time'),
        ('FULL_TIME',  'Full-time'),
        ('LOCUMS',     'Locums'),
    ]
    ROLE_CHOICES = [
        ('PHARMACIST',       'Pharmacist'),
        ('INTERN',           'Intern'),
        ('ASSISTANT',        'Assistant'),
        ('TECHNICIAN',       'Technician'),
        ('STUDENT',          'Student'),
        ('ADMIN',            'Admin'),
        ('DRIVER',           'Driver'),
    ]
    RATE_TYPE_CHOICES = [
        ('FIXED',             'Fixed'),
        ('FLEXIBLE',          'Flexible'),
        ('PHARMACIST_PROVIDED','Pharmacist Provided'),
    ]

    name                   = models.CharField(max_length=120)
    email                  = models.EmailField(blank=True, null=True)
    # --- ADD THESE NEW STRUCTURED ADDRESS FIELDS ---
    street_address = models.CharField(max_length=255, blank=True, null=True)
    suburb = models.CharField(max_length=100, blank=True, null=True)
    postcode = models.CharField(max_length=10, blank=True, null=True)
    google_place_id = models.CharField(max_length=255, blank=True, null=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)


    # state = models.CharField(max_length=3, choices=STATE_CHOICES, blank=True, null=True)
    state = models.CharField(max_length=50, blank=True, null=True)

    owner                  = models.ForeignKey(
                                OwnerOnboarding,
                                on_delete=models.CASCADE,
                                null=True,
                                blank=True,
                                related_name='pharmacies'
                             )
    organization           = models.ForeignKey(
                                Organization,
                                on_delete=models.CASCADE,
                                null=True,
                                blank=True,
                                related_name='pharmacies'
                             )
    verified               = models.BooleanField(default=False)
    abn                    = models.CharField(max_length=20, blank=True, null=True)
    abn_entity_name        = models.CharField(max_length=255, blank=True, null=True)
    abn_entity_type        = models.CharField(max_length=100, blank=True, null=True)
    abn_status             = models.CharField(max_length=50, blank=True, null=True)
    abn_gst_registered     = models.BooleanField(null=True, blank=True)
    abn_gst_from           = models.DateField(blank=True, null=True)
    abn_gst_to             = models.DateField(blank=True, null=True)
    abn_last_checked       = models.DateTimeField(blank=True, null=True)
    abn_entity_confirmed   = models.BooleanField(default=False)
    abn_verification_note  = models.TextField(blank=True, null=True)

    timezone               = models.CharField(
                                max_length=50,
                                blank=True,
                                null=True,
                                help_text="IANA timezone, e.g. Australia/Sydney"
                             )

    # asic_number            = models.CharField(max_length=50, blank=True, null=True)
    methadone_s8_protocols = models.FileField(upload_to=pharmacy_reg_doc_upload_path, blank=True, null=True)
    qld_sump_docs          = models.FileField(upload_to=pharmacy_reg_doc_upload_path, blank=True, null=True)
    sops                   = models.FileField(upload_to=pharmacy_other_doc_upload_path, blank=True, null=True)
    induction_guides       = models.FileField(upload_to=pharmacy_other_doc_upload_path, blank=True, null=True)

    # Opening hours split by day‐type
    weekdays_start         = models.TimeField(blank=True, null=True)
    weekdays_end           = models.TimeField(blank=True, null=True)
    monday_start           = models.TimeField(blank=True, null=True)
    monday_end             = models.TimeField(blank=True, null=True)
    monday_closed          = models.BooleanField(default=False)
    tuesday_start          = models.TimeField(blank=True, null=True)
    tuesday_end            = models.TimeField(blank=True, null=True)
    tuesday_closed         = models.BooleanField(default=False)
    wednesday_start        = models.TimeField(blank=True, null=True)
    wednesday_end          = models.TimeField(blank=True, null=True)
    wednesday_closed       = models.BooleanField(default=False)
    thursday_start         = models.TimeField(blank=True, null=True)
    thursday_end           = models.TimeField(blank=True, null=True)
    thursday_closed        = models.BooleanField(default=False)
    friday_start           = models.TimeField(blank=True, null=True)
    friday_end             = models.TimeField(blank=True, null=True)
    friday_closed          = models.BooleanField(default=False)
    saturdays_start        = models.TimeField(blank=True, null=True)
    saturdays_end          = models.TimeField(blank=True, null=True)
    saturdays_closed       = models.BooleanField(default=False)
    sundays_start          = models.TimeField(blank=True, null=True)
    sundays_end            = models.TimeField(blank=True, null=True)
    sundays_closed         = models.BooleanField(default=False)
    public_holidays_start  = models.TimeField(blank=True, null=True)
    public_holidays_end    = models.TimeField(blank=True, null=True)
    public_holidays_closed = models.BooleanField(default=False)

    # Employment & roles
    employment_types       = models.JSONField(default=list, blank=True)
    roles_needed           = models.JSONField(default=list, blank=True)
    use_chemisttasker_payroll = models.BooleanField(
        default=False,
        help_text=(
            "Opt in to ChemistTasker payroll. When disabled, roster and attendance still "
            "produce timesheets without requiring Award classifications or pay rates."
        ),
    )

    # Default shift rate settings
    default_rate_type      = models.CharField(
                                max_length=50,
                                choices=RATE_TYPE_CHOICES,
                                blank=True,
                                null=True
                             )
    default_fixed_rate     = models.DecimalField(
                                max_digits=6,
                                decimal_places=2,
                                blank=True,
                                null=True
                             )

    # Base rates (used for Pharmacist rate previews and defaults)
    rate_weekday = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    rate_saturday = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    rate_sunday = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    rate_public_holiday = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    rate_early_morning = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    rate_late_night = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)

    about                  = models.TextField(blank=True)
    cover_image            = models.ImageField(
                                upload_to=pharmacy_cover_upload_path,
                                blank=True,
                                null=True
                             )

    # verfications
    abn_verified = models.BooleanField(default=False, db_index=True)


    auto_publish_worker_requests = models.BooleanField(
        default=False,
        help_text=(
            "If True, worker-initiated swap/cover requests will automatically "
            "create and publish a new shift. "
            "If False, the request must be approved by the owner or admin first."
        ),
    )

    class Meta:
        indexes = [
            models.Index(fields=['owner']),
            models.Index(fields=['organization']),
            models.Index(fields=['state']),
            models.Index(fields=['email']),
        ]

    def __str__(self):
        return self.name


class PharmacyClaim(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"

    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="claims",
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="pharmacy_claims",
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pharmacy_claims_requested",
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
    )
    message = models.TextField(blank=True)
    response_message = models.TextField(blank=True)
    responded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pharmacy_claims_reviewed",
    )
    responded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["pharmacy", "organization"],
                condition=Q(status__in=["PENDING", "ACCEPTED"]),
                name="unique_active_pharmacy_claim",
            ),
            models.UniqueConstraint(
                fields=["pharmacy"],
                condition=Q(status="ACCEPTED"),
                name="unique_accepted_pharmacy_claim",
            ),
        ]
        indexes = [
            models.Index(fields=["pharmacy"]),
            models.Index(fields=["organization"]),
            models.Index(fields=["status"]),
        ]

    def mark_accepted(self, responder, response_message=""):
        self.status = self.Status.ACCEPTED
        self.responded_by = responder
        self.response_message = response_message
        self.responded_at = timezone.now()
        self.save(
            update_fields=[
                "status",
                "responded_by",
                "response_message",
                "responded_at",
                "updated_at",
            ]
        )

    def mark_rejected(self, responder, response_message=""):
        self.status = self.Status.REJECTED
        self.responded_by = responder
        self.response_message = response_message
        self.responded_at = timezone.now()
        self.save(
            update_fields=[
                "status",
                "responded_by",
                "response_message",
                "responded_at",
                "updated_at",
            ]
        )

    def __str__(self):
        return f"PharmacyClaim#{self.pk} pharmacy={self.pharmacy_id} org={self.organization_id} status={self.status}"


class PharmacyAdmin(models.Model):
    class AdminLevel(models.TextChoices):
        OWNER = "OWNER", "Owner"
        MANAGER = "MANAGER", "Manager"
        ROSTER_MANAGER = "ROSTER_MANAGER", "Roster Manager"
        COMMUNICATION_MANAGER = "COMMUNICATION_MANAGER", "Communication Manager"

    CAPABILITY_MANAGE_ADMINS = "MANAGE_ADMINS"
    CAPABILITY_MANAGE_STAFF = "MANAGE_STAFF"
    CAPABILITY_MANAGE_ROSTER = "MANAGE_ROSTER"
    CAPABILITY_MANAGE_COMMS = "MANAGE_COMMUNICATIONS"

    CAPABILITY_MATRIX = {
        AdminLevel.OWNER: {
            CAPABILITY_MANAGE_ADMINS,
            CAPABILITY_MANAGE_STAFF,
            CAPABILITY_MANAGE_ROSTER,
            CAPABILITY_MANAGE_COMMS,
        },
        AdminLevel.MANAGER: {
            CAPABILITY_MANAGE_ADMINS,
            CAPABILITY_MANAGE_STAFF,
            CAPABILITY_MANAGE_ROSTER,
            CAPABILITY_MANAGE_COMMS,
        },
        AdminLevel.ROSTER_MANAGER: {
            CAPABILITY_MANAGE_ROSTER,
            CAPABILITY_MANAGE_COMMS,
        },
        AdminLevel.COMMUNICATION_MANAGER: {
            CAPABILITY_MANAGE_COMMS,
        },
    }

    ADMIN_STAFF_ROLE_CHOICES = [
        ("PHARMACIST", "Pharmacist"),
        ("INTERN", "Intern Pharmacist"),
        ("TECHNICIAN", "Dispensary Technician"),
        ("ASSISTANT", "Pharmacy Assistant"),
        ("STUDENT", "Pharmacy Student"),
    ]

    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pharmacy_admin_assignments",
    )
    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="admin_assignments",
    )
    membership = models.OneToOneField(
        "client_profile.Membership",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="admin_assignment",
    )
    admin_level = models.CharField(
        max_length=32,
        choices=AdminLevel.choices,
        default=AdminLevel.MANAGER,
    )
    staff_role = models.CharField(
        max_length=32,
        choices=ADMIN_STAFF_ROLE_CHOICES,
        blank=True,
        null=True,
    )
    job_title = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pharmacy_admins_created",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "pharmacy")
        indexes = [
            models.Index(fields=["user"], name="pharm_admin_user_idx"),
            models.Index(fields=["pharmacy"], name="pharm_admin_pharmacy_idx"),
            models.Index(fields=["pharmacy", "admin_level"], name="pharm_admin_pharmacy_level_idx"),
        ]

    def __str__(self):
        return f"{self.user.email} @ {self.pharmacy.name} [{self.admin_level}]"

    @property
    def capabilities(self) -> set[str]:
        return self.CAPABILITY_MATRIX.get(self.admin_level, set())

    def has_capability(self, capability: str) -> bool:
        return capability in self.capabilities

    def clean(self):
        # Prevent demoting the pharmacy owner record
        if (
            self.admin_level != self.AdminLevel.OWNER
            and getattr(self.pharmacy.owner, "user_id", None) == self.user_id
        ):
            raise ValidationError("Pharmacy owner must remain an OWNER level admin.")

    def can_be_removed_by(self, acting_user) -> bool:
        """
        Enforce that Owners cannot be removed by other admins,
        and Managers cannot remove Owners.
        """
        if getattr(self.pharmacy.owner, "user_id", None) == self.user_id:
            return False
        if acting_user and acting_user == getattr(self.pharmacy.owner, "user", None):
            return True
        acting_assignment = PharmacyAdmin.objects.filter(
            user=acting_user,
            pharmacy=self.pharmacy,
            is_active=True,
        ).first()
        if not acting_assignment:
            return False
        if self.admin_level == self.AdminLevel.OWNER:
            return False
        if (
            acting_assignment.admin_level in {self.AdminLevel.OWNER, self.AdminLevel.MANAGER}
            and acting_assignment.has_capability(self.CAPABILITY_MANAGE_ADMINS)
        ):
            return True
        return False


# Chain Model - Represents a chain of pharmacies
class Chain(models.Model):
    owner = models.ForeignKey(
        'OwnerOnboarding',
        on_delete=models.CASCADE,
        related_name='chains',
        limit_choices_to={'role': 'OWNER'},
        null=True,
        blank=True
    )
    organization = models.ForeignKey(
        'Organization',
        on_delete=models.CASCADE,
        related_name='chains',
        null=True,
        blank=True
    )
    name = models.CharField(max_length=120)  # Chain name
    logo = models.ImageField(upload_to=chain_logo_upload_path, blank=True)  # Chain logo
    subscription_plan = models.CharField(max_length=50, default="Basic")  # Subscription plan
    primary_contact_email = models.EmailField()  # Primary contact email for the chain admin
    created_at = models.DateTimeField(auto_now_add=True)  # Date when the chain was created
    updated_at = models.DateTimeField(auto_now=True)  # Date when the chain was last updated
    is_active = models.BooleanField(default=True)  # Whether the chain is active
    pharmacies = models.ManyToManyField(
        Pharmacy,
        blank=True,
        related_name='chains'
    )
    class Meta:
        indexes = [
            models.Index(fields=['owner']),
            models.Index(fields=['organization']),
        ]

    def __str__(self):
        return self.name
