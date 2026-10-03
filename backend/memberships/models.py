"""Membership models. Django app labels remain client_profile during the code-ownership phase."""
from django.db import models
from django.conf import settings
import uuid
from django.utils import timezone
from client_profile.models.common import (
    PHARMACIST_AWARD_LEVEL_CHOICES,
    OTHERSTAFF_CLASSIFICATION_CHOICES,
    INTERN_HALF_CHOICES,
    STUDENT_YEAR_CHOICES,
)
from client_profile.models.orgs import PharmacyAdmin


# Membership Model - Manages the user roles within each pharmacy
PHARMACY_STAFF_EMPLOYMENT_TYPES = ("FULL_TIME", "PART_TIME", "CASUAL")


FAVORITE_STAFF_EMPLOYMENT_TYPES = ("LOCUM", "SHIFT_HERO")


class Membership(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"
        LEFT = "LEFT", "Left"

    ROLE_CHOICES = [
        ("PHARMACIST", "Pharmacist"),
        ("INTERN", "Intern Pharmacist"),
        ("TECHNICIAN", "Dispensary Technician"),
        ("ASSISTANT", "Pharmacy Assistant"),
        ("STUDENT", "Pharmacy Student"),
        ('CONTACT', 'Contact'),

    ]

    EMPLOYMENT_TYPE_CHOICES = [
        ("FULL_TIME", "Full-time"),
        ("PART_TIME", "Part-time"),
        ("LOCUM", "Locum"),
        ("CASUAL", "Casual"),
        ('SHIFT_HERO', 'Shift Hero')
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    pharmacy = models.ForeignKey(
        'client_profile.Pharmacy',
        on_delete=models.CASCADE,
        related_name='memberships',
        null=True,
        blank=True
    )

    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sent_pharmacy_invites',
        help_text="The user who sent this invitation."
    )
    invited_name = models.CharField(
        max_length=255,
        blank=True,
        help_text="Staff name as entered by the inviter (optional)."
    )
    role = models.CharField(
        max_length=50,
        choices=ROLE_CHOICES,
        blank=False,
        help_text="Staff role in pharmacy"
    )
    employment_type = models.CharField(
        max_length=20,
        choices=EMPLOYMENT_TYPE_CHOICES,
        blank=False,
        help_text="Employment type"
    )
    job_title = models.CharField(
        max_length=255,
        blank=True,
        help_text="Displayed for full/part-time staff"
    )

    is_active = models.BooleanField(default=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.ACCEPTED,
        db_index=True,
    )
    responded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # FIX 1.1.2: Add fields to store award level/classification details on Membership with choices
    pharmacist_award_level = models.CharField(
        max_length=50,
        choices=PHARMACIST_AWARD_LEVEL_CHOICES,
        blank=True, null=True,
        help_text="Pharmacist award level as per award rates"
    )
    otherstaff_classification_level = models.CharField(
        max_length=50,
        choices=OTHERSTAFF_CLASSIFICATION_CHOICES,
        blank=True, null=True,
        help_text="Other staff (Assistant/Technician) award classification"
    )
    intern_half = models.CharField(
        max_length=50,
        choices=INTERN_HALF_CHOICES,
        blank=True, null=True,
        help_text="Intern pharmacist half of training"
    )
    student_year = models.CharField(
        max_length=50,
        choices=STUDENT_YEAR_CHOICES,
        blank=True, null=True,
        help_text="Pharmacy student year of study"
    )


    class Meta:
        app_label = "client_profile"
        unique_together = ('user', 'pharmacy')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['pharmacy']),
            models.Index(fields=['user']),
            models.Index(fields=['pharmacy', 'user']),
        ]

    @property
    def is_pharmacy_admin(self):
        assignment = getattr(self, "admin_assignment", None)
        if assignment:
            return assignment.is_active
        return PharmacyAdmin.objects.filter(
            user=self.user,
            pharmacy=self.pharmacy,
            is_active=True,
        ).exists()


    @property
    def staff_category(self) -> str:
        """
        Derived grouping for UI/filters:
        - 'PHARMACY_STAFF' for FULL_TIME/PART_TIME/CASUAL
        - 'FAVORITE_STAFF' for LOCUM/SHIFT_HERO
        """
        if self.employment_type in PHARMACY_STAFF_EMPLOYMENT_TYPES:
            return 'PHARMACY_STAFF'
        return 'FAVORITE_STAFF'

    @property
    def is_pharmacy_staff_member(self) -> bool:
        return self.employment_type in PHARMACY_STAFF_EMPLOYMENT_TYPES

    @property
    def is_favorite_staff_member(self) -> bool:
        return self.employment_type in FAVORITE_STAFF_EMPLOYMENT_TYPES


    def __str__(self):
        if self.pharmacy:
            return f"{self.user.email} in {self.pharmacy.name} ({self.role})"
        return self.user.email


class MembershipInviteLink(models.Model):
    """
    Multi-use magic link an Owner/Org Admin/Pharmacy Admin can generate
    for a specific pharmacy and category (FULL/PART-TIME vs LOCUM/CASUAL).
    Candidates submit a short form from this link; each submission becomes
    a MembershipApplication the owner can approve/reject.
    """
    CATEGORY_CHOICES = [
        ('FULL_PART_TIME', 'Full/Part-time'),
        ('LOCUM_CASUAL', 'Locum/Casual'),
    ]

    id = models.BigAutoField(primary_key=True)
    pharmacy = models.ForeignKey('Pharmacy', on_delete=models.CASCADE, related_name='invite_links')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='created_invite_links')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    expires_at = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "client_profile"
        indexes = [
            models.Index(fields=['token']),
            models.Index(fields=['pharmacy', 'is_active']),
        ]

    def is_valid(self) -> bool:
        return self.is_active and timezone.now() < self.expires_at

    def __str__(self):
        return f"{self.pharmacy.name} · {self.category} · {self.token}"


class MembershipApplication(models.Model):
    """
    A single candidate submission coming from a MembershipInviteLink.
    Owner reviews (approve/reject). On approve, we create/attach Membership
    and use your existing invite email flow.
    """
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]

    id = models.BigAutoField(primary_key=True)
    invite_link = models.ForeignKey(MembershipInviteLink, on_delete=models.CASCADE, related_name='applications')
    pharmacy = models.ForeignKey('Pharmacy', on_delete=models.CASCADE, related_name='membership_applications')

    # Category copied from link at submit time (for easy filtering)
    category = models.CharField(max_length=20, choices=MembershipInviteLink.CATEGORY_CHOICES)

    # Minimal fields per your spec
    role = models.CharField(max_length=20, choices=Membership.ROLE_CHOICES)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    username = models.CharField(max_length=150, blank=True)
    mobile_number = models.CharField(max_length=32)
    date_of_birth = models.DateField(
        null=True,
        help_text="Candidate date of birth used for age-dependent Award rates and identity matching.",
    )
    job_title = models.CharField(max_length=255, blank=True)

    # LEVEL – we keep your existing per-role fields so approval can map 1:1 into Membership
    pharmacist_award_level = models.CharField(
        max_length=50, blank=True, null=True,
        choices=PHARMACIST_AWARD_LEVEL_CHOICES,
    )
    otherstaff_classification_level = models.CharField(
        max_length=50, blank=True, null=True,
        choices=OTHERSTAFF_CLASSIFICATION_CHOICES,
    )
    intern_half = models.CharField(
        max_length=50, blank=True, null=True,
        choices=INTERN_HALF_CHOICES,
    )
    student_year = models.CharField(
        max_length=50, blank=True, null=True,
        choices=STUDENT_YEAR_CHOICES,
    )

    # Optional but RECOMMENDED to satisfy step (7) “existing user vs new”
    email = models.EmailField()

    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='membership_applications')

    # Canonical application/audit state. The application is the review record only;
    # accepted staff data lives on User + Membership rather than being copied again.
    pending_identity_key = models.CharField(max_length=320, unique=True, null=True, blank=True, editable=False)
    submitted_snapshot = models.JSONField(default=dict, blank=True)
    review_changes = models.JSONField(default=list, blank=True)
    reviewed_at = models.DateTimeField(blank=True, null=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='membership_applications_reviewed',
    )
    approved_membership = models.ForeignKey(
        'Membership',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='source_applications',
    )

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    submitted_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(blank=True, null=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='membership_applications_decided')

    class Meta:
        app_label = "client_profile"
        indexes = [
            models.Index(fields=['pharmacy', 'status']),
            models.Index(fields=['pharmacy', 'email', 'status'], name='cp_memapp_email_status_idx'),
        ]

    def __str__(self):
        return f"{self.first_name} {self.last_name} → {self.pharmacy.name} ({self.status})"
