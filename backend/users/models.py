# users/models.py

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from organizations.models import Organization, PharmacyAdmin

class CustomUserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError('The Email field must be set')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        return self._create_user(email, password, **extra_fields)

class User(AbstractUser):
    # make username truly optional
    username = models.CharField(max_length=150, unique=False, blank=True, null=True)
    # enforce unique email and use it as the login field
    email = models.EmailField('email address', unique=True)

    ROLE_CHOICES = (
        ('OWNER',       'Pharmacy Owner'),
        ('PHARMACIST',  'Pharmacist'),
        ('OTHER_STAFF', 'Other Staff'),
        ('ORG_STAFF',   'Organization Staff'),
        ('EXPLORER',    'Explorer'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)

    USERNAME_FIELD = 'email'       # log in with email
    REQUIRED_FIELDS = []           # no other fields required on create

    objects = CustomUserManager()

    def is_owner(self):
        return self.role == 'OWNER'
    def is_pharmacist(self):
        return self.role == 'PHARMACIST'
    def is_otherstaff(self):
        return self.role == 'OTHER_STAFF'
    def is_org_staff(self):
        return self.role == 'ORG_STAFF'
    def is_explorer(self):
        return self.role == 'EXPLORER'
    
    otp_code = models.CharField(max_length=128, blank=True, null=True)
    otp_created_at = models.DateTimeField(blank=True, null=True)
    otp_failed_attempts = models.PositiveSmallIntegerField(default=0)
    otp_locked_until = models.DateTimeField(blank=True, null=True)
    is_otp_verified = models.BooleanField(default=False)
    accepted_terms = models.BooleanField(default=False)
    accepted_terms_at = models.DateTimeField(null=True, blank=True)

    mobile_number = models.CharField(max_length=20, blank=True, null=True)
    mobile_otp_code = models.CharField(max_length=128, blank=True, null=True)
    mobile_otp_created_at = models.DateTimeField(blank=True, null=True)
    mobile_otp_failed_attempts = models.PositiveSmallIntegerField(default=0)
    mobile_otp_locked_until = models.DateTimeField(blank=True, null=True)
    is_mobile_verified = models.BooleanField(default=False)

    deleted_at = models.DateTimeField(blank=True, null=True)


class OrganizationMembership(models.Model):
    """
    Assigns users to an organisation with an explicit role and admin level.
    """
    ROLE_CHOICES = (
        ('ORG_ADMIN',    'Organization Admin'),
        ('CHIEF_ADMIN',  'Chief Admin'),
        ('REGION_ADMIN', 'Region Admin'),
    )

    user         = models.ForeignKey(User, on_delete=models.CASCADE, related_name='organization_memberships')
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='memberships')
    role         = models.CharField(max_length=30, choices=ROLE_CHOICES)
    region       = models.CharField(max_length=255, blank=True, null=True)
    job_title    = models.CharField(max_length=255, blank=True)
    admin_level  = models.CharField(
        max_length=32,
        choices=PharmacyAdmin.AdminLevel.choices,
        default=PharmacyAdmin.AdminLevel.MANAGER,
    )
    pharmacies   = models.ManyToManyField(
        'client_profile.Pharmacy',
        related_name='organization_scoped_memberships',
        blank=True,
    )

    class Meta:
        unique_together = ('user', 'organization')

    def __str__(self):
        return f"{self.user.email} ({self.role}) @ {self.organization.name}"


class DeviceToken(models.Model):
    """
    Stores Expo/FCM/APNs push tokens per user.
    """
    PLATFORM_CHOICES = (
        ("ios", "iOS"),
        ("android", "Android"),
        ("web", "Web"),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="device_tokens")
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES)
    token = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    active = models.BooleanField(default=True)

    class Meta:
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["platform"]),
        ]

    def __str__(self):
        return f"{self.user.email} ({self.platform})"


class ContactMessage(models.Model):
    class Source(models.TextChoices):
        WEB = 'web', 'Web'
        MOBILE = 'mobile', 'Mobile'

    user = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='contact_messages',
    )
    name = models.CharField(max_length=200)
    email = models.EmailField()
    phone = models.CharField(max_length=50, blank=True, default='')
    subject = models.CharField(max_length=200)
    message = models.TextField()
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.WEB)
    page_url = models.URLField(blank=True, default='')
    app_version = models.CharField(max_length=50, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.subject} ({self.email})"

class WebSocketTicket(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="ws_tickets")
    ticket = models.CharField(max_length=64, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Ticket for {self.user.email} at {self.created_at}"
