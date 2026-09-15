# client_profile/models.py
from django.db import models, transaction
from django.contrib.auth.hashers import check_password, make_password
from django.db.models import Q
from django.conf import settings
from django.core.exceptions import ValidationError
from datetime import date
import uuid
from django.contrib.contenttypes.fields import GenericRelation, GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from datetime import timedelta
from django.utils import timezone
from client_profile.fields import EncryptedTextField
import os


GENDER_CHOICES = [
    ("MALE", "Male"),
    ("FEMALE", "Female"),
    ("PREFER_NOT_TO_SAY", "Prefer not to say"),
]


def _safe_ext(filename):
    _base, ext = os.path.splitext(filename or "")
    return ext.lower()


def _unique_upload_path(prefix, filename):
    return f"{prefix}/{uuid.uuid4().hex}{_safe_ext(filename)}"


def organization_cover_upload_path(instance, filename):
    owner = instance.pk or "new"
    return _unique_upload_path(f"organizations/{owner}/covers", filename)


def onboarding_upload_path(instance, filename, folder):
    user_id = getattr(instance, "user_id", None) or "new"
    return _unique_upload_path(f"users/{user_id}/{folder}", filename)


def owner_profile_photo_upload_path(instance, filename):
    return onboarding_upload_path(instance, filename, "profile_photos")


def pharmacist_profile_photo_upload_path(instance, filename):
    return onboarding_upload_path(instance, filename, "profile_photos")


def pharmacist_gov_id_upload_path(instance, filename):
    return onboarding_upload_path(instance, filename, "gov_ids")


def pharmacist_secondary_id_upload_path(instance, filename):
    return onboarding_upload_path(instance, filename, "gov_ids_secondary")


def pharmacist_resume_upload_path(instance, filename):
    return onboarding_upload_path(instance, filename, "resumes")


def otherstaff_profile_photo_upload_path(instance, filename):
    return onboarding_upload_path(instance, filename, "profile_photos")


def otherstaff_gov_id_upload_path(instance, filename):
    return onboarding_upload_path(instance, filename, "gov_ids")


def otherstaff_secondary_id_upload_path(instance, filename):
    return onboarding_upload_path(instance, filename, "gov_ids_secondary")


def otherstaff_role_doc_upload_path(instance, filename):
    return onboarding_upload_path(instance, filename, "role_docs")


def otherstaff_resume_upload_path(instance, filename):
    return onboarding_upload_path(instance, filename, "resumes")


def explorer_gov_id_upload_path(instance, filename):
    return onboarding_upload_path(instance, filename, "gov_ids")


def explorer_resume_upload_path(instance, filename):
    return onboarding_upload_path(instance, filename, "resumes")


def explorer_profile_photo_upload_path(instance, filename):
    return onboarding_upload_path(instance, filename, "profile_photos")


def explorer_secondary_id_upload_path(instance, filename):
    return onboarding_upload_path(instance, filename, "gov_ids_secondary")


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


def hub_attachment_upload_path(instance, filename):
    return _unique_upload_path("pharmacy_hub/attachments", filename)


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

class OnboardingNotification(models.Model):
    # Links to any onboarding model (PharmacistOnboarding, OtherStaffOnboarding, etc.)
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    onboarding = GenericForeignKey('content_type', 'object_id')

    NOTIFICATION_TYPE_CHOICES = [
        ('referee1', 'Referee 1 Email'),
        ('referee2', 'Referee 2 Email'),
        ('admin_notify', 'Admin/Superuser Notification'),
        ('verified', 'Profile Verified Email'),
        ('failed', 'Profile Verification Failed Email'),
    ]
    notification_type = models.CharField(max_length=32, choices=NOTIFICATION_TYPE_CHOICES)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('content_type', 'object_id', 'notification_type')

    def __str__(self):
        return f"{self.onboarding} – {self.notification_type} sent at {self.sent_at}"

class OwnerOnboarding(models.Model):
    ROLE_CHOICES = [
        ("MANAGER", "Pharmacy Manager"),
        ("PHARMACIST", "Pharmacist"),
    ]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)

    # Basic Info
    # username        = models.CharField(max_length=150)
    phone_number    = models.CharField(max_length=20)
    gender          = models.CharField(max_length=20, choices=GENDER_CHOICES, blank=True, null=True)
    role            = models.CharField(max_length=20, choices=ROLE_CHOICES)
    chain_pharmacy  = models.BooleanField(default=False)
    number_of_pharmacies = models.PositiveIntegerField(default=1)
    profile_photo = models.ImageField(upload_to=owner_profile_photo_upload_path, blank=True, null=True)

    # Regulatory Info for pharmacists only
    ahpra_number    = models.CharField(max_length=100, blank=True, null=True)

    verified        = models.BooleanField(default=False)
    submitted_for_verification = models.BooleanField(default=False)

    organization        = models.ForeignKey(
                             Organization,
                             on_delete=models.SET_NULL,
                             null=True,
                             blank=True,
                             related_name='owner_onboardings'
                          )
    # Verification Fields
    ahpra_verified = models.BooleanField(default=False, db_index=True)
    ahpra_registration_status = models.CharField(max_length=100, blank=True, null=True)
    ahpra_registration_type = models.CharField(max_length=100, blank=True, null=True)
    ahpra_expiry_date = models.DateField(blank=True, null=True)
    ahpra_first_registration_date = models.DateField(blank=True, null=True)
    ahpra_verification_note = models.TextField(blank=True, null=True)

    # Notifications
    notifications = GenericRelation(OnboardingNotification)

    class Meta:
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['organization']),
        ]

    def __str__(self):
        # Always show the user’s login email
        return self.user.email

    def clean(self):
        super().clean()
        if self.user_id and getattr(self.user, "role", None) != "OWNER":
            raise ValidationError({"user": "Owner onboarding can only be linked to users with role OWNER."})

    @property
    def ahpra_years_since_first_registration(self):
        start = self.ahpra_first_registration_date
        if not start:
            return None
        today = timezone.now().date()
        years = today.year - start.year
        if (today.month, today.day) < (start.month, start.day):
            years -= 1
        return max(years, 0)

class PharmacistOnboarding(models.Model):
    REFEREE_REL_CHOICES = [
    ('manager', 'Manager'),
    ('supervisor', 'Supervisor'),
    ('colleague', 'Colleague'),
    ('owner', 'Owner'),
    ('other', 'Other'),
    ]
    ID_DOC_CHOICES = [
        ('GOV_ID', 'Government ID'),
        ('DRIVER_LICENSE', 'Driving license'),
        ('VISA', 'Visa'),
        ('AUS_PASSPORT', 'Australian Passport'),
        ('OTHER_PASSPORT', 'Other Passport'),
        ('AGE_PROOF', 'Age Proof Card'),
    ]

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)

    profile_photo = models.ImageField(upload_to=pharmacist_profile_photo_upload_path, blank=True, null=True)
    government_id = models.FileField(upload_to=pharmacist_gov_id_upload_path, blank=True, null=True)
    government_id_type = models.CharField(max_length=32, choices=ID_DOC_CHOICES, blank=True, null=True)
    identity_meta = models.JSONField(default=dict, blank=True)  # per-type details: state/country/expiry/visa_type_number/valid_to
    identity_secondary_file = models.FileField(upload_to=pharmacist_secondary_id_upload_path, blank=True, null=True)  # second doc when required
    ahpra_number = models.CharField(max_length=100, blank=True, null=True)
    # phone_number = models.CharField(max_length=20, blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True)
    gender = models.CharField(max_length=20, choices=GENDER_CHOICES, blank=True, null=True)
    emergency_contact_number = models.CharField(max_length=20, blank=True, null=True)
    emergency_contact_relation = models.CharField(max_length=100, blank=True, null=True)
    short_bio = models.TextField(blank=True, null=True)
    resume = models.FileField(upload_to=pharmacist_resume_upload_path, blank=True, null=True)

    skills = models.JSONField(default=list, blank=True)
    skill_certificates = models.JSONField(default=dict, blank=True)

    payment_preference = models.CharField(max_length=10, blank=True, null=True)

    # ABN
    abn = models.CharField(max_length=20, blank=True, null=True)
    gst_registered = models.BooleanField(default=False)
    # Scraped ABN facts (kept)
    abn_entity_name      = models.CharField(max_length=255, blank=True, null=True)
    abn_entity_type      = models.CharField(max_length=100, blank=True, null=True)
    abn_status           = models.CharField(max_length=50,  blank=True, null=True)
    abn_gst_registered   = models.BooleanField(null=True, blank=True)   # None=unknown
    abn_gst_from         = models.DateField(blank=True, null=True)
    abn_gst_to           = models.DateField(blank=True, null=True)
    abn_last_checked     = models.DateTimeField(blank=True, null=True)
    abn_entity_confirmed = models.BooleanField(default=False)

    # TFN
    tfn_number = EncryptedTextField(blank=True, null=True)
    super_fund_name = models.CharField(max_length=255, blank=True, null=True)
    super_usi = models.CharField(max_length=50, blank=True, null=True)
    super_member_number = models.CharField(max_length=100, blank=True, null=True)

    referee1_name = models.CharField(max_length=150, blank=True, null=True)
    referee1_relation = models.CharField(max_length=30, choices=REFEREE_REL_CHOICES, blank=True, null=True)
    referee1_email = models.EmailField(blank=True, null=True)
    referee1_confirmed = models.BooleanField(default=False)
    referee1_rejected = models.BooleanField(default=False)
    referee1_last_sent = models.DateTimeField(null=True, blank=True)
    referee1_workplace = models.CharField(max_length=150, blank=True, null=True)

    referee2_name = models.CharField(max_length=150, blank=True, null=True)
    referee2_relation = models.CharField(max_length=30, choices=REFEREE_REL_CHOICES, blank=True, null=True)
    referee2_email = models.EmailField(blank=True, null=True)
    referee2_confirmed = models.BooleanField(default=False)
    referee2_rejected = models.BooleanField(default=False)
    referee2_last_sent = models.DateTimeField(null=True, blank=True)
    referee2_workplace = models.CharField(max_length=150, blank=True, null=True)

    rate_preference = models.JSONField(blank=True, null=True)

    submitted_for_verification = models.BooleanField(default=False)
    verified = models.BooleanField(default=False)
    member_of_chain = models.BooleanField(default=False)

    # Verification Fields
    gov_id_verified = models.BooleanField(default=False, db_index=True)
    abn_verified = models.BooleanField(default=False, db_index=True)
    ahpra_verified = models.BooleanField(default=False, db_index=True)
    ahpra_registration_status = models.CharField(max_length=100, blank=True, null=True)
    ahpra_registration_type = models.CharField(max_length=100, blank=True, null=True)
    ahpra_expiry_date = models.DateField(blank=True, null=True)
    ahpra_first_registration_date = models.DateField(blank=True, null=True)

    # Verification notes
    ahpra_verification_note = models.TextField(blank=True, null=True)
    gov_id_verification_note = models.TextField(blank=True, null=True)
    abn_verification_note = models.TextField(blank=True, null=True)

    # Location
    street_address   = models.CharField(max_length=255, blank=True, null=True)
    suburb           = models.CharField(max_length=100, blank=True, null=True)
    state            = models.CharField(max_length=50,  blank=True, null=True)
    postcode         = models.CharField(max_length=10,  blank=True, null=True)
    google_place_id  = models.CharField(max_length=255, blank=True, null=True)
    latitude         = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude        = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    open_to_travel   = models.BooleanField(default=False)
    travel_states    = models.JSONField(default=list, blank=True)
    coverage_radius_km = models.PositiveSmallIntegerField(blank=True, null=True)

    def __str__(self):
        return f"{self.user.get_full_name()} - Onboarding"

    def clean(self):
        super().clean()
        if self.user_id and getattr(self.user, "role", None) != "PHARMACIST":
            raise ValidationError({"user": "Pharmacist onboarding can only be linked to users with role PHARMACIST."})

    @property
    def ahpra_years_since_first_registration(self):
        start = self.ahpra_first_registration_date
        if not start:
            return None
        today = timezone.now().date()
        years = today.year - start.year
        if (today.month, today.day) < (start.month, start.day):
            years -= 1
        return max(years, 0)

class OtherStaffOnboarding(models.Model):
    ROLE_CHOICES = [
        ("INTERN", "Intern Pharmacist"),
        ("TECHNICIAN", "Dispensary Technician"),
        ("ASSISTANT", "Pharmacy Assistant"),
        ("STUDENT", "Pharmacy Student"),
    ]

    ASSISTANT_LEVEL_CHOICES = [
        ("LEVEL_1", "Pharmacy Assistant - Level 1"),
        ("LEVEL_2", "Pharmacy Assistant - Level 2"),
        ("LEVEL_3", "Pharmacy Assistant - Level 3"),
        ("LEVEL_4", "Pharmacy Assistant - Level 4"),
    ]

    STUDENT_YEAR_CHOICES = [
        ("YEAR_1", "Pharmacy Student - 1st Year"),
        ("YEAR_2", "Pharmacy Student - 2nd Year"),
        ("YEAR_3", "Pharmacy Student - 3rd Year"),
        ("YEAR_4", "Pharmacy Student - 4th Year"),
    ]

    INTERN_HALF_CHOICES = [
        ("FIRST_HALF", "Intern - First Half"),
        ("SECOND_HALF", "Intern - Second Half"),
    ]

    REFEREE_REL_CHOICES = [
        ('manager', 'Manager'),
        ('supervisor', 'Supervisor'),
        ('colleague', 'Colleague'),
        ('owner', 'Owner'),
        ('other', 'Other'),
    ]

    # --- Core ---
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)

    profile_photo = models.ImageField(upload_to=otherstaff_profile_photo_upload_path, blank=True, null=True)

    # --- Identity (parity with Pharmacist) ---
    government_id = models.FileField(upload_to=otherstaff_gov_id_upload_path, blank=True, null=True)
    government_id_type = models.CharField(max_length=32, choices=PharmacistOnboarding.ID_DOC_CHOICES, blank=True, null=True)
    identity_meta = models.JSONField(default=dict, blank=True)
    identity_secondary_file = models.FileField(upload_to=otherstaff_secondary_id_upload_path, blank=True, null=True)

    # --- Role selection ---
    role_type = models.CharField(max_length=50, choices=ROLE_CHOICES, blank=True, null=True)

    # --- Basic (address + dob; phone comes from User.mobile_number in V2 serializers) ---
    date_of_birth = models.DateField(blank=True, null=True)
    gender = models.CharField(max_length=20, choices=GENDER_CHOICES, blank=True, null=True)
    emergency_contact_number = models.CharField(max_length=20, blank=True, null=True)
    emergency_contact_relation = models.CharField(max_length=100, blank=True, null=True)
    street_address = models.CharField(max_length=255, blank=True, null=True)
    suburb = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=50, blank=True, null=True)
    postcode = models.CharField(max_length=10, blank=True, null=True)
    google_place_id = models.CharField(max_length=255, blank=True, null=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    open_to_travel = models.BooleanField(default=False)
    travel_states = models.JSONField(default=list, blank=True)
    coverage_radius_km = models.PositiveSmallIntegerField(blank=True, null=True)

    # --- Experience / Skills ---
    skills = models.JSONField(default=list, blank=True)
    skill_certificates = models.JSONField(default=dict, blank=True)  # per-skill files (parity with Pharmacist)
    years_experience = models.CharField(max_length=20, blank=True, null=True)

    # --- Payments (parity with Pharmacist) ---
    payment_preference = models.CharField(max_length=10, blank=True, null=True)
    abn = models.CharField(max_length=20, blank=True, null=True)
    gst_registered = models.BooleanField(default=False)
    # ABR-scraped facts
    abn_entity_name = models.CharField(max_length=255, blank=True, null=True)
    abn_entity_type = models.CharField(max_length=100, blank=True, null=True)
    abn_status = models.CharField(max_length=50, blank=True, null=True)
    abn_gst_registered = models.BooleanField(null=True, blank=True)  # None = unknown
    abn_gst_from = models.DateField(blank=True, null=True)
    abn_gst_to = models.DateField(blank=True, null=True)
    abn_last_checked = models.DateTimeField(blank=True, null=True)
    abn_entity_confirmed = models.BooleanField(default=False)

    # TFN (stored; masked via serializer)
    tfn_number = EncryptedTextField(blank=True, null=True)
    super_fund_name = models.CharField(max_length=255, blank=True, null=True)
    super_usi = models.CharField(max_length=50, blank=True, null=True)
    super_member_number = models.CharField(max_length=100, blank=True, null=True)

    # --- Granular classification (award logic) ---
    classification_level = models.CharField(max_length=20, choices=ASSISTANT_LEVEL_CHOICES, blank=True, null=True)
    student_year = models.CharField(max_length=20, choices=STUDENT_YEAR_CHOICES, blank=True, null=True)
    intern_half = models.CharField(max_length=20, choices=INTERN_HALF_CHOICES, blank=True, null=True)

    # --- Role-specific docs (kept) ---
    ahpra_proof = models.FileField(upload_to=otherstaff_role_doc_upload_path, blank=True, null=True)
    hours_proof = models.FileField(upload_to=otherstaff_role_doc_upload_path, blank=True, null=True)
    certificate = models.FileField(upload_to=otherstaff_role_doc_upload_path, blank=True, null=True)
    university_id = models.FileField(upload_to=otherstaff_role_doc_upload_path, blank=True, null=True)
    cpr_certificate = models.FileField(upload_to=otherstaff_role_doc_upload_path, blank=True, null=True)
    s8_certificate = models.FileField(upload_to=otherstaff_role_doc_upload_path, blank=True, null=True)

    # --- Referees ---
    referee1_name = models.CharField(max_length=150, blank=True, null=True)
    referee1_relation = models.CharField(max_length=30, choices=REFEREE_REL_CHOICES, blank=True, null=True)
    referee1_email = models.EmailField(blank=True, null=True)
    referee1_workplace = models.CharField(max_length=150, blank=True, null=True)
    referee1_confirmed = models.BooleanField(default=False)
    referee1_rejected = models.BooleanField(default=False)
    referee1_last_sent = models.DateTimeField(null=True, blank=True)

    referee2_name = models.CharField(max_length=150, blank=True, null=True)
    referee2_relation = models.CharField(max_length=30, choices=REFEREE_REL_CHOICES, blank=True, null=True)
    referee2_email = models.EmailField(blank=True, null=True)
    referee2_workplace = models.CharField(max_length=150, blank=True, null=True)
    referee2_confirmed = models.BooleanField(default=False)
    referee2_rejected = models.BooleanField(default=False)
    referee2_last_sent = models.DateTimeField(null=True, blank=True)

    # --- Profile / Rate ---
    short_bio = models.TextField(blank=True, null=True)
    resume = models.FileField(upload_to=otherstaff_resume_upload_path, blank=True, null=True)

    # --- Status ---
    verified = models.BooleanField(default=False)
    submitted_for_verification = models.BooleanField(default=False)

    # --- Verification flags / notes ---
    gov_id_verified = models.BooleanField(default=False, db_index=True)
    gov_id_verification_note = models.TextField(blank=True, null=True)

    ahpra_proof_verified = models.BooleanField(default=False, db_index=True)
    ahpra_proof_verification_note = models.TextField(blank=True, null=True)

    hours_proof_verified = models.BooleanField(default=False, db_index=True)
    hours_proof_verification_note = models.TextField(blank=True, null=True)

    certificate_verified = models.BooleanField(default=False, db_index=True)
    certificate_verification_note = models.TextField(blank=True, null=True)

    university_id_verified = models.BooleanField(default=False, db_index=True)
    university_id_verification_note = models.TextField(blank=True, null=True)

    cpr_certificate_verified = models.BooleanField(default=False, db_index=True)
    cpr_certificate_verification_note = models.TextField(blank=True, null=True)

    s8_certificate_verified = models.BooleanField(default=False, db_index=True)
    s8_certificate_verification_note = models.TextField(blank=True, null=True)

    abn_verified = models.BooleanField(default=False, db_index=True)
    abn_verification_note = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.user.get_full_name()} - {self.role_type} Onboarding"

    def clean(self):
        super().clean()
        if self.user_id and getattr(self.user, "role", None) != "OTHER_STAFF":
            raise ValidationError({"user": "Other staff onboarding can only be linked to users with role OTHER_STAFF."})

class ExplorerOnboarding(models.Model):
    ROLE_CHOICES = [
        ("STUDENT", "Student"),
        ("JUNIOR", "Junior"),
        ("CAREER_SWITCHER", "Career Switcher"),
    ]
  
    REFEREE_REL_CHOICES = [
    ('manager', 'Manager'),
    ('supervisor', 'Supervisor'),
    ('colleague', 'Colleague'),
    ('owner', 'Owner'),
    ('other', 'Other'),
    ]

    ID_DOC_CHOICES = [
        ('GOV_ID', 'Government ID'),
        ('DRIVER_LICENSE', 'Driving license'),
        ('VISA', 'Visa'),
        ('AUS_PASSPORT', 'Australian Passport'),
        ('OTHER_PASSPORT', 'Other Passport'),
        ('AGE_PROOF', 'Age Proof Card'),
    ]
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    government_id = models.FileField(upload_to=explorer_gov_id_upload_path, blank=True, null=True)
    role_type = models.CharField(max_length=50, choices=ROLE_CHOICES, blank=True, null=True)
    gender = models.CharField(max_length=20, choices=GENDER_CHOICES, blank=True, null=True)
    emergency_contact_number = models.CharField(max_length=20, blank=True, null=True)
    emergency_contact_relation = models.CharField(max_length=100, blank=True, null=True)

    interests = models.JSONField(default=list, blank=True, null=True)     # e.g. ['Shadowing','Volunteering','Placement','Junior Assistant Role']

    # --- Referees ---
    referee1_name = models.CharField(max_length=150, blank=True, null=True)
    referee1_relation = models.CharField(max_length=30, choices=REFEREE_REL_CHOICES, blank=True, null=True)
    referee1_email = models.EmailField(blank=True, null=True)
    referee1_workplace = models.CharField(max_length=150, blank=True, null=True)
    referee1_confirmed = models.BooleanField(default=False)
    referee1_rejected = models.BooleanField(default=False)
    referee1_last_sent = models.DateTimeField(null=True, blank=True)

    referee2_name = models.CharField(max_length=150, blank=True, null=True)
    referee2_relation = models.CharField(max_length=30, choices=REFEREE_REL_CHOICES, blank=True, null=True)
    referee2_email = models.EmailField(blank=True, null=True)
    referee2_workplace = models.CharField(max_length=150, blank=True, null=True)
    referee2_confirmed = models.BooleanField(default=False)
    referee2_rejected = models.BooleanField(default=False)
    referee2_last_sent = models.DateTimeField(null=True, blank=True)

    short_bio = models.TextField(blank=True, null=True)
    resume = models.FileField(upload_to=explorer_resume_upload_path, blank=True, null=True)

    verified = models.BooleanField(default=False)
    submitted_for_verification = models.BooleanField(default=False)

    # --- Address (same shape as Pharmacist) ---
    street_address   = models.CharField(max_length=255, blank=True, null=True)
    suburb           = models.CharField(max_length=100, blank=True, null=True)
    state            = models.CharField(max_length=50,  blank=True, null=True)
    postcode         = models.CharField(max_length=10,  blank=True, null=True)
    google_place_id  = models.CharField(max_length=255, blank=True, null=True)
    latitude         = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude        = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    open_to_travel   = models.BooleanField(default=False)
    travel_states    = models.JSONField(default=list, blank=True)
    coverage_radius_km = models.PositiveSmallIntegerField(blank=True, null=True)

    profile_photo = models.ImageField(upload_to=explorer_profile_photo_upload_path, blank=True, null=True)

    # --- Identity  ---
    government_id = models.FileField(upload_to=explorer_gov_id_upload_path, blank=True, null=True)
    government_id_type = models.CharField(max_length=32, choices=ID_DOC_CHOICES, blank=True, null=True)
    identity_meta = models.JSONField(default=dict, blank=True)  # per-type details (state, expiry, visa fields…)
    identity_secondary_file = models.FileField(upload_to=explorer_secondary_id_upload_path, blank=True, null=True)

    # Verification flags/notes
    gov_id_verified = models.BooleanField(default=False, db_index=True)
    gov_id_verification_note = models.TextField(blank=True, null=True)


    def __str__(self):
        return f"{self.user.get_full_name()} - Explorer Onboarding"

    def clean(self):
        super().clean()
        if self.user_id and getattr(self.user, "role", None) != "EXPLORER":
            raise ValidationError({"user": "Explorer onboarding can only be linked to users with role EXPLORER."})


class RefereeResponse(models.Model):
    # Link to the specific onboarding profile (works for all types)
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    onboarding_profile = GenericForeignKey('content_type', 'object_id')

    # Link to the specific referee number (1 or 2)
    referee_index = models.PositiveSmallIntegerField(choices=[(1, 'Referee 1'), (2, 'Referee 2')])

    # Fields from your questionnaire
    referee_name = models.CharField(max_length=255, blank=True)
    referee_position = models.CharField(max_length=255, blank=True)
    relationship_to_candidate = models.CharField(max_length=255, blank=True)
    association_period = models.CharField(max_length=100, blank=True)
    contact_details = models.CharField(max_length=255, blank=True)

    # 1. Role & Performance
    role_and_responsibilities = models.TextField(blank=True)

    # 2. Professionalism & Work Ethic
    reliability_rating = models.CharField(max_length=20, blank=True) # Excellent, Good, etc.
    professionalism_notes = models.TextField(blank=True)

    skills_rating = models.CharField(max_length=20, blank=True)          # same options as above
    skills_strengths_weaknesses = models.TextField(blank=True)

    # 4. Teamwork & Communication
    teamwork_communication_notes = models.TextField(blank=True)
    feedback_conflict_notes = models.TextField(blank=True)

    # 5. Integrity & Conduct
    conduct_concerns = models.BooleanField(default=False)
    conduct_explanation = models.TextField(blank=True)

    # 6. Compliance & Safety
    compliance_adherence = models.CharField(max_length=10, blank=True)   # 'Yes' | 'No' | 'Unsure'
    compliance_incidents = models.TextField(blank=True)

    # 7. Rehire & Overall Recommendation (CRITICAL)
    would_rehire = models.CharField(max_length=20, blank=True)           # 'Yes' | 'No' | 'With Reservations'
    rehire_explanation = models.TextField(blank=True)

    # 8. Additional
    additional_comments = models.TextField(blank=True)

    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Ensures a candidate can't have two responses for the same referee
        unique_together = ('content_type', 'object_id', 'referee_index')


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


PHARMACIST_AWARD_LEVEL_CHOICES = [
    ('PHARMACIST', 'Pharmacist'),
    ('EXPERIENCED_PHARMACIST', 'Experienced Pharmacist'),
    ('PHARMACIST_IN_CHARGE', 'Pharmacist In Charge'),
    ('PHARMACIST_MANAGER', 'Pharmacist Manager'),
] #cite: 1

OTHERSTAFF_CLASSIFICATION_CHOICES = [
    ('LEVEL_1', 'Level 1'),
    ('LEVEL_2', 'Level 2'),
    ('LEVEL_3', 'Level 3'),
    ('LEVEL_4', 'Level 4'),
]

INTERN_HALF_CHOICES = [
    ('FIRST_HALF', 'First Half'),
    ('SECOND_HALF', 'Second Half'),
]

STUDENT_YEAR_CHOICES = [
    ('YEAR_1', 'Year 1'),
    ('YEAR_2', 'Year 2'),
    ('YEAR_3', 'Year 3'),
    ('YEAR_4', 'Year 4'),
]


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

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    submitted_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(blank=True, null=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='membership_applications_decided')

    class Meta:
        indexes = [
            models.Index(fields=['pharmacy', 'status']),
        ]

    def __str__(self):
        return f"{self.first_name} {self.last_name} → {self.pharmacy.name} ({self.status})"

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

# Shift Model - Represents an available shift in a pharmacy
class Shift(models.Model):
    ROLE_CHOICES = [
        ('PHARMACIST', 'Pharmacist'),
        ('INTERN', 'Intern'),
        ('STUDENT', 'Student'),
        ('ASSISTANT', 'Assistant'),
        ('TECHNICIAN', 'Technician'),
        ('EXPLORER', 'Explorer'),
    ]
    RATE_TYPE_CHOICES = [
        ('FIXED', 'Fixed'),
        ('FLEXIBLE', 'Flexible'),
        ('PHARMACIST_PROVIDED', 'Pharmacist Provided'),
    ]
    EMPLOYMENT_TYPE_CHOICES = [
        ('FULL_TIME', 'Full-Time'),
        ('PART_TIME', 'Part-Time'),
        ('LOCUM', 'Locum'),
    ]

    PAYMENT_STATUS_CHOICES = (
        ('NOT_REQUIRED', 'Not Required'),
        ('PENDING', 'Pending Payment'),
        ('PAID', 'Paid'),
    )
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='NOT_REQUIRED')

    pharmacy = models.ForeignKey(
        'Pharmacy',
        on_delete=models.CASCADE,
        related_name='shifts'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        editable=False,
        on_delete=models.SET_NULL,
        related_name='shifts_created'
    )
    dedicated_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='dedicated_shifts'
    )
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    role_needed = models.CharField(max_length=50, choices=ROLE_CHOICES)
    employment_type = models.CharField(
        max_length=20, choices=EMPLOYMENT_TYPE_CHOICES, default='LOCUM'
    )

    workload_tags = models.JSONField(default=list, blank=True)
    must_have = models.JSONField(default=list, blank=True)
    nice_to_have = models.JSONField(default=list, blank=True)

    rate_type = models.CharField(
        max_length=50, choices=RATE_TYPE_CHOICES,
        null=True, blank=True
    )
    fixed_rate = models.DecimalField(
        max_digits=6, decimal_places=2,
        null=True, blank=True
    )
    owner_adjusted_rate = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        blank=True,
        null=True,
        help_text="Optional bonus/hr offered by owner for all staff"
    )
    flexible_timing = models.BooleanField(default=False)
    min_hourly_rate = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    max_hourly_rate = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    min_annual_salary = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    max_annual_salary = models.DecimalField(max_digits=9, decimal_places=2, null=True, blank=True)
    super_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    payment_preference = models.CharField(max_length=10, blank=True, null=True)  # e.g., ABN/TFN
    visibility = models.CharField(
        max_length=20,
        choices=[
            ('FULL_PART_TIME', 'Full/Part Time Pharmacy Members'),
            ('LOCUM_CASUAL',   'Locum/Casual Pharmacy Members'),
            ('OWNER_CHAIN',    'Owner Chain'),
            ('ORG_CHAIN',      'Organization Chain'),
            ('PLATFORM',       'Platform (Public)'),
        ],
        default='PLATFORM'
    )

    reveal_count = models.IntegerField(default=0)
    reveal_quota = models.IntegerField(null=True, blank=True)

    escalate_to_locum_casual = models.DateTimeField(null=True, blank=True)
    escalate_to_owner_chain = models.DateTimeField(null=True, blank=True)
    escalate_to_org_chain = models.DateTimeField(null=True, blank=True)
    escalate_to_platform = models.DateTimeField(null=True, blank=True)
    escalation_level = models.IntegerField(default=3)

    revealed_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='revealed_shifts'
    )
    interested_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='interested_shifts'
    )
    single_user_only = models.BooleanField(
        default=False,
        help_text="If true, only one user may take the entire shift (all slots)."
    )
    has_travel = models.BooleanField(
        default=False,
        help_text="Whether travel allowance is provided for this shift."
    )
    has_accommodation = models.BooleanField(
        default=False,
        help_text="Whether accommodation is provided for this shift."
    )
    is_urgent = models.BooleanField(
        default=False,
        help_text="Whether this shift is marked as urgent by the poster."
    )
    post_anonymously = models.BooleanField(
        default=False,
        help_text="Hide pharmacy identity from applicants; only suburb is shown."
    )
    share_token = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, null=True)

    description = models.TextField(
        blank=True,
        null=True,
        help_text="A plain English description of the shift."
    )


    def clean(self):
        # Validate JSON lists are lists of strings
        for field in ['workload_tags', 'must_have', 'nice_to_have']:
            val = getattr(self, field)
            if not isinstance(val, list) or not all(isinstance(x, str) for x in val):
                raise ValidationError({field: 'Must be a list of strings.'})

        # Validate rate fields ONLY for PHARMACIST
        if self.role_needed == 'PHARMACIST':
            if self.rate_type == 'FIXED' and self.fixed_rate is None:
                raise ValidationError({'fixed_rate': 'fixed_rate required when rate_type=FIXED.'})
        else:
            if self.rate_type or self.fixed_rate is not None:
                raise ValidationError('Rate fields are only allowed for Pharmacist shifts.')

        # Validate FT/PT pay bands (hourly or annual + super)
        if self.employment_type in ['FULL_TIME', 'PART_TIME']:
            has_hourly = self.min_hourly_rate is not None or self.max_hourly_rate is not None
            has_annual = self.min_annual_salary is not None or self.max_annual_salary is not None
            if not has_hourly and not has_annual:
                raise ValidationError({
                    'min_hourly_rate': 'Provide hourly or annual pay.',
                    'min_annual_salary': 'Provide hourly or annual pay.',
                })
            if has_hourly:
                if self.min_hourly_rate is None or self.max_hourly_rate is None:
                    raise ValidationError({'min_hourly_rate': 'Both min and max hourly are required for hourly pay.'})
                if self.min_hourly_rate > self.max_hourly_rate:
                    raise ValidationError({'min_hourly_rate': 'Min hourly cannot exceed max hourly.'})
            if has_annual:
                if self.min_annual_salary is None or self.max_annual_salary is None:
                    raise ValidationError({'min_annual_salary': 'Both min and max annual are required for annual pay.'})
                if self.min_annual_salary > self.max_annual_salary:
                    raise ValidationError({'min_annual_salary': 'Min annual cannot exceed max annual.'})
                if self.super_percent is None:
                    raise ValidationError({'super_percent': 'Super % is required when annual package is provided.'})
        else:
            # For locum/casual, ignore any annual/hourly inputs
            self.min_hourly_rate = None
            self.max_hourly_rate = None
            self.min_annual_salary = None
            self.max_annual_salary = None
            # super_percent can still be stored for locum/casual (used for superannuation flag)


    def save(self, *args, **kwargs):
        self.full_clean()
        if not self.pk and self.role_needed == 'PHARMACIST':
            self.rate_type = self.rate_type or self.pharmacy.default_rate_type
            self.fixed_rate = self.fixed_rate or self.pharmacy.default_fixed_rate
        super().save(*args, **kwargs)
   
    class Meta:
        indexes = [
            models.Index(fields=['pharmacy']),
            models.Index(fields=['created_by']),
        ]


class ShiftDescriptionTemplate(models.Model):
    pharmacy = models.ForeignKey(
        'Pharmacy',
        on_delete=models.CASCADE,
        related_name='shift_description_templates',
    )
    role_needed = models.CharField(max_length=50, choices=Shift.ROLE_CHOICES)
    description = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_shift_description_templates',
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_shift_description_templates',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['pharmacy', 'role_needed'],
                name='unique_shift_description_template_per_pharmacy_role',
            )
        ]
        indexes = [
            models.Index(fields=['pharmacy', 'role_needed']),
        ]

    def __str__(self):
        return f"{self.pharmacy_id} {self.role_needed} description template"


class PillRewardRule(models.Model):
    class EventType(models.TextChoices):
        EARN = "EARN", "Earn"
        SPEND = "SPEND", "Spend"

    class Audience(models.TextChoices):
        ANY = "ANY", "Any authenticated user"
        SHIFT_POSTER = "SHIFT_POSTER", "Shift posters"
        WORKER = "WORKER", "Workers"

    code = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True, default="")
    event_type = models.CharField(max_length=12, choices=EventType.choices)
    audience = models.CharField(max_length=24, choices=Audience.choices, default=Audience.ANY)
    pill_amount = models.PositiveIntegerField(
        help_text="Readable configurable pill amount for this rule. Spend rules deduct this many pills."
    )
    is_active = models.BooleanField(default=True)
    starts_at = models.DateTimeField(blank=True, null=True)
    ends_at = models.DateTimeField(blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["event_type", "is_active"]),
            models.Index(fields=["audience", "is_active"]),
        ]
        ordering = ["code"]

    def __str__(self):
        return f"{self.name} ({self.pill_amount} pills)"

    def is_current(self, at=None):
        at = at or timezone.now()
        if not self.is_active:
            return False
        if self.starts_at and self.starts_at > at:
            return False
        if self.ends_at and self.ends_at <= at:
            return False
        return True


class PillReferralCode(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pill_referral_code",
    )
    code = models.CharField(max_length=32, unique=True, db_index=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["code", "is_active"]),
        ]

    def __str__(self):
        return f"{self.code} -> {self.user.email}"


class PillReferralEvent(models.Model):
    class ReferralType(models.TextChoices):
        FRIEND = "FRIEND", "Friend referral"
        SHIFT = "SHIFT", "Shift referral"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        CLAIMED = "CLAIMED", "Claimed"
        AWARDED = "AWARDED", "Awarded"
        CANCELLED = "CANCELLED", "Cancelled"

    referrer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pill_referrals_sent",
    )
    referred_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pill_referrals_received",
    )
    referral_code = models.ForeignKey(
        PillReferralCode,
        on_delete=models.PROTECT,
        related_name="events",
    )
    referral_type = models.CharField(max_length=16, choices=ReferralType.choices)
    shift = models.ForeignKey(
        "Shift",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pill_referral_events",
    )
    referred_email = models.EmailField(blank=True, default="")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    claimed_at = models.DateTimeField(blank=True, null=True)
    awarded_at = models.DateTimeField(blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["referrer", "referral_type"]),
            models.Index(fields=["referred_user", "status"]),
            models.Index(fields=["shift", "referral_type"]),
            models.Index(fields=["status", "created_at"]),
        ]

    def __str__(self):
        target = self.referred_user.email if self.referred_user_id else self.referred_email or "unclaimed"
        return f"{self.referral_type} referral {self.referrer.email} -> {target}"


class PillLedgerEntry(models.Model):
    class EntryType(models.TextChoices):
        EARN = "EARN", "Earn"
        SPEND = "SPEND", "Spend"
        ADJUSTMENT = "ADJUSTMENT", "Adjustment"
        REVERSAL = "REVERSAL", "Reversal"

    class Source(models.TextChoices):
        FRIEND_REFERRAL = "FRIEND_REFERRAL", "Friend referral"
        SHIFT_REFERRAL = "SHIFT_REFERRAL", "Shift referral"
        SHIFT_POST = "SHIFT_POST", "Shift post"
        PAYMENT_CREDIT = "PAYMENT_CREDIT", "Payment credit"
        MANUAL = "MANUAL", "Manual"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pill_ledger_entries",
    )
    rule = models.ForeignKey(
        PillRewardRule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ledger_entries",
    )
    referral_event = models.ForeignKey(
        PillReferralEvent,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ledger_entries",
    )
    shift = models.ForeignKey(
        "Shift",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pill_ledger_entries",
    )
    entry_type = models.CharField(max_length=16, choices=EntryType.choices)
    source = models.CharField(max_length=32, choices=Source.choices)
    delta = models.IntegerField(help_text="Signed pill delta. Earn is positive, spend is negative.")
    balance_after = models.IntegerField()
    description = models.CharField(max_length=255, blank=True, default="")
    idempotency_key = models.CharField(max_length=160, unique=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["source", "created_at"]),
            models.Index(fields=["entry_type", "created_at"]),
        ]
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.user.email}: {self.delta:+d} pills ({self.source})"


class ShiftSlot(models.Model):
    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name='slots'
    )
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    rate = models.DecimalField(
        max_digits=7,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Optional per-slot hourly rate for display."
    )
    is_recurring = models.BooleanField(default=False)
    recurring_days = models.JSONField(default=list, blank=True)
    recurring_end_date = models.DateField(null=True, blank=True)

    def clean(self):
        """
        Validates a ShiftSlot, ensuring recurring slot definitions are correct.

        - recurring_days: List of integers 0 (Monday) to 6 (Sunday) - consistent with Python's datetime.weekday().
        - recurring_end_date: Required for recurring slots, must be after start date.
        - For non-recurring, recurring_days must be empty.
        """
        if self.is_recurring:
            if not self.recurring_days:
                raise ValidationError({'recurring_days': 'This field is required for recurring slots.'})
            if not isinstance(self.recurring_days, list):
                raise ValidationError({'recurring_days': 'Must be a list of integers (0=Monday, 6=Sunday).'})
            for d in self.recurring_days:
                if not isinstance(d, int) or not (0 <= d <= 6):
                    raise ValidationError({'recurring_days': 'Each entry must be an integer between 0 (Monday) and 6 (Sunday).'})

            if self.recurring_end_date is None:
                raise ValidationError({'recurring_end_date': 'This field is required for recurring slots.'})
            if self.recurring_end_date <= self.date:
                raise ValidationError({'recurring_end_date': 'End date must be after start date for recurring slots.'})
        else:
            if self.recurring_days:
                raise ValidationError({'recurring_days': 'Should be empty for non-recurring slots.'})
            if self.recurring_end_date:
                raise ValidationError({'recurring_end_date': 'Should be empty for non-recurring slots.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.shift} slot on {self.date}"

class ShiftInterest(models.Model):
    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name='interests'
    )
    slot = models.ForeignKey(
        ShiftSlot,
        on_delete=models.CASCADE,
        related_name='slot_interests',
        null=True, blank=True
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='shift_interests'
    )

    revealed = models.BooleanField(default=False)

    expressed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        slot_info = f' (slot {self.slot.id})' if self.slot else ''
        return f"{self.user.get_full_name()} interested in {self.shift.pharmacy.name}{slot_info}"

class ShiftSlotAssignment(models.Model):
    # link back to the parent Shift for easy filtering
    shift = models.ForeignKey(
        'Shift',
        on_delete=models.CASCADE,
        related_name='slot_assignments'
    )
    slot = models.ForeignKey(
        'ShiftSlot',
        on_delete=models.CASCADE,
        related_name='assignments'
    )
    slot_date = models.DateField(
        null=True,  # ✅ TEMPORARY — allow nulls just for migration
        blank=True,
        help_text="Specific date instance if this slot recurs"
    )
    # who is doing that slot
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='slot_assignments'
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    unit_rate = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Locked-in rate at time of assignment"
    )

    rate_reason = models.JSONField(
        default=dict,
        blank=True,
        help_text="Details explaining how the rate was calculated"
    )
    class Meta:
        unique_together = ('slot', 'slot_date')
        indexes = [
            models.Index(fields=['slot', 'slot_date']),      # Fast lookup by slot and date
            models.Index(fields=['user', 'slot_date']),      # Fast lookup for all slots by user for a day
        ]

    is_rostered = models.BooleanField(default=False) 

    def __str__(self):
        return f"{self.user.get_full_name()} assigned to slot {self.slot.id}"


class ShiftProfileAccessAudit(models.Model):
    class Action(models.TextChoices):
        REVEAL_PROFILE = "REVEAL_PROFILE", "Reveal profile"
        VIEW_ASSIGNED_PROFILE = "VIEW_ASSIGNED_PROFILE", "View assigned profile"

    shift = models.ForeignKey(
        'Shift',
        on_delete=models.CASCADE,
        related_name='profile_access_audits'
    )
    slot = models.ForeignKey(
        'ShiftSlot',
        on_delete=models.SET_NULL,
        related_name='profile_access_audits',
        null=True,
        blank=True
    )
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile_access_events'
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='performed_profile_access_events'
    )
    action = models.CharField(max_length=32, choices=Action.choices)
    request_ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['shift', 'created_at']),
            models.Index(fields=['target_user', 'created_at']),
            models.Index(fields=['actor', 'created_at']),
            models.Index(fields=['action', 'created_at']),
        ]

    def __str__(self):
        return f"{self.action} shift={self.shift_id} actor={self.actor_id} target={self.target_user_id}"

class ShiftRejection(models.Model):
    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name='rejections'
    )
    slot = models.ForeignKey(
        ShiftSlot,
        on_delete=models.CASCADE,
        related_name='slot_rejections',
        null=True, blank=True
    )
    slot_date = models.DateField(
        null=True, blank=True,
        help_text="Specific date instance if this slot recurs"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='slot_rejections'
    )
    rejected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('slot', 'slot_date', 'user')
        indexes = [
            models.Index(fields=['slot', 'slot_date']),
            models.Index(fields=['user', 'slot_date']),
        ]

    def __str__(self):
        # FIX: Check if self.slot is not None before accessing its attributes
        slotinfo = f' (slot {self.slot.id})' if self.slot else ''
        # You can add slot_date for more detail if slot is present and has a date
        if self.slot and self.slot_date: # Only add slot_date if slot is not None and slot_date exists
            slotinfo = f" (slot {self.slot.id} on {self.slot_date})"
        elif self.slot_date: # If slot is None but slot_date exists (though unlikely for a full rejection)
            slotinfo = f" (on {self.slot_date})"
        # If both slot and slot_date are None, slotinfo remains an empty string.

        return f"{self.user.get_full_name()} rejected shift at {self.shift.pharmacy.name}{slotinfo}"

class ShiftCounterOffer(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"

    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name="counter_offers"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="shift_counter_offers"
    )
    message = models.TextField(blank=True)
    request_travel = models.BooleanField(default=False)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="decided_shift_counter_offers"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["shift", "status"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def __str__(self):
        return f"CounterOffer#{self.pk} shift={self.shift_id} user={self.user_id} status={self.status}"


class ShiftOffer(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED_AWAITING_PAYMENT = "ACCEPTED_AWAITING_PAYMENT", "Accepted Awaiting Payment"
        ACCEPTED = "ACCEPTED", "Accepted"
        DECLINED = "DECLINED", "Declined"
        EXPIRED = "EXPIRED", "Expired"

    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name="offers"
    )
    slot = models.ForeignKey(
        ShiftSlot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="offers"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="shift_offers"
    )
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    offered_slot_date = models.DateField(null=True, blank=True)
    offered_start_time = models.TimeField(null=True, blank=True)
    offered_end_time = models.TimeField(null=True, blank=True)
    offered_rate = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    counter_offer = models.ForeignKey(
        "ShiftCounterOffer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_shift_offers",
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    last_buzzed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["shift", "status"]),
            models.Index(fields=["user", "status"]),
            models.Index(fields=["expires_at"]),
        ]

    def __str__(self):
        return f"ShiftOffer#{self.pk} shift={self.shift_id} user={self.user_id} status={self.status}"


class ShiftCounterOfferSlot(models.Model):
    offer = models.ForeignKey(
        ShiftCounterOffer,
        on_delete=models.CASCADE,
        related_name="slots"
    )
    slot = models.ForeignKey(
        ShiftSlot,
        on_delete=models.CASCADE,
        related_name="counter_offer_slots",
        null=True,
        blank=True
    )
    slot_date = models.DateField(null=True, blank=True)
    proposed_start_time = models.TimeField()
    proposed_end_time = models.TimeField()
    proposed_rate = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True
    )

    class Meta:
        unique_together = ("offer", "slot", "slot_date")
        indexes = [
            models.Index(fields=["offer", "slot", "slot_date"]),
        ]

    def __str__(self):
        return f"CounterOfferSlot#{self.pk} offer={self.offer_id} slot={self.slot_id}"

class ShiftSaved(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="saved_shifts"
    )
    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name="saved_by"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "shift")
        indexes = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["shift"]),
        ]

    def __str__(self):
        return f"SavedShift#{self.pk} user={self.user_id} shift={self.shift_id}"

class LeaveRequest(models.Model):
    LEAVE_TYPE_CHOICES = [
        ('SICK', 'Sick Leave'),
        ('ANNUAL', 'Annual Leave'),
        ('COMPASSIONATE', 'Compassionate Leave'),
        ('STUDY', 'Study Leave'),
        ('CARER', 'Carer\'s Leave'),
        ('UNPAID', 'Unpaid Leave'),
        ('OTHER', 'Other'),
    ]
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]

    slot_assignment = models.ForeignKey(
        'ShiftSlotAssignment', 
        on_delete=models.CASCADE, 
        related_name='leave_requests'
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    leave_type = models.CharField(max_length=20, choices=LEAVE_TYPE_CHOICES)
    note = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='PENDING')
    date_applied = models.DateTimeField(auto_now_add=True)
    date_resolved = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('slot_assignment', 'user', 'leave_type', 'status')  # Prevent duplicate pending leaves

    def __str__(self):
        return f"{self.user} requests {self.leave_type} for {self.slot_assignment} ({self.status})"

class WorkerShiftRequest(models.Model):
    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("APPROVED", "Approved"),
        ("REJECTED", "Rejected"),
        ("AUTO_PUBLISHED", "Auto Published"),
    ]

    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="worker_shift_requests",
    )
    # Match your codebase convention: use AUTH_USER_MODEL (resolves to users.User in your setup)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="worker_shift_requests",
    )
    # Optional link for true “swap” (when requesting on an already-defined/assigned slot)
    shift = models.ForeignKey(
        "client_profile.ShiftSlotAssignment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="swap_requests",
    )

    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_worker_shift_requests",
    )
    resolved_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    role = models.CharField(max_length=100)
    slot_date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    note = models.TextField(blank=True, null=True)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="PENDING",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.requested_by} → {self.pharmacy} ({self.slot_date})"

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Worker Shift Request"
        verbose_name_plural = "Worker Shift Requests"

# Rating model
class Rating(models.Model):
    """
    Global, relationship-level rating (not per shift/slot).
    - OWNER_TO_WORKER: owner/org admin/pharmacy admin rates a worker (pharmacist/other staff)
    - WORKER_TO_PHARMACY: worker rates a pharmacy
    Exactly one rating per relationship per direction; editable later.
    """

    class Direction(models.TextChoices):
        OWNER_TO_WORKER = "OWNER_TO_WORKER", "Owner/Org/PharmacyAdmin → Worker"
        WORKER_TO_PHARMACY = "WORKER_TO_PHARMACY", "Worker → Pharmacy"

    # Who is submitting the rating
    rater_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ratings_given",
        db_index=True,
    )

    # Target (exactly one of these will be set depending on direction)
    ratee_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ratings_received_as_worker",
        null=True, blank=True,
        db_index=True,
    )
    ratee_pharmacy = models.ForeignKey(
        "Pharmacy",
        on_delete=models.CASCADE,
        related_name="ratings_received",
        null=True, blank=True,
        db_index=True,
    )

    direction = models.CharField(max_length=32, choices=Direction.choices, db_index=True)

    # The rating itself
    stars = models.PositiveSmallIntegerField()  # enforce 1..5 in clean()
    comment = models.TextField(blank=True, null=True, max_length=1000)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # One rating per relationship, per direction
        constraints = [
            # OWNER_TO_WORKER uniqueness
            models.UniqueConstraint(
                fields=["rater_user", "ratee_user", "direction"],
                name="uniq_owner_to_worker_per_pair",
                condition=models.Q(direction="OWNER_TO_WORKER"),
            ),
            # WORKER_TO_PHARMACY uniqueness
            models.UniqueConstraint(
                fields=["rater_user", "ratee_pharmacy", "direction"],
                name="uniq_worker_to_pharmacy_per_pair",
                condition=models.Q(direction="WORKER_TO_PHARMACY"),
            ),
        ]
        indexes = [
            models.Index(fields=["direction", "rater_user"]),
            models.Index(fields=["direction", "ratee_user"]),
            models.Index(fields=["direction", "ratee_pharmacy"]),
        ]

    def clean(self):
        # stars must be 1..5
        if not (1 <= int(self.stars) <= 5):
            raise ValidationError({"stars": "Stars must be between 1 and 5."})

        if self.direction == self.Direction.OWNER_TO_WORKER:
            # must target a user; must NOT target a pharmacy
            if not self.rater_user_id or not self.ratee_user_id:
                raise ValidationError("OWNER_TO_WORKER requires rater_user and ratee_user.")
            if self.ratee_pharmacy_id is not None:
                raise ValidationError("OWNER_TO_WORKER must not set ratee_pharmacy.")
        elif self.direction == self.Direction.WORKER_TO_PHARMACY:
            # must target a pharmacy; must NOT target a user
            if not self.rater_user_id or not self.ratee_pharmacy_id:
                raise ValidationError("WORKER_TO_PHARMACY requires rater_user and ratee_pharmacy.")
            if self.ratee_user_id is not None:
                raise ValidationError("WORKER_TO_PHARMACY must not set ratee_user.")
        else:
            raise ValidationError({"direction": "Unknown direction."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        target = self.ratee_user_id or self.ratee_pharmacy_id
        return f"{self.direction} by {self.rater_user_id} → {target}: {self.stars}★"

## Invoice model
class Invoice(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('sent',  'Sent'),
        ('paid',  'Paid'),
    ]

    # Who issues the invoice
    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='invoices'
    )

    # Optional link to a ChemistTasker pharmacy
    pharmacy = models.ForeignKey(
        'client_profile.Pharmacy',
        on_delete=models.CASCADE,
        related_name='invoices',
        null=True,
        blank=True
    )
    pharmacy_name_snapshot    = models.CharField(max_length=255, blank=True, default="")
    pharmacy_address_snapshot = models.TextField(blank=True, default="")
    pharmacy_abn_snapshot     = models.CharField(max_length=20, blank=True, default="")

    # External-invoice fields
    external                = models.BooleanField(default=False)
    custom_bill_to_name     = models.CharField(max_length=255, blank=True)
    custom_bill_to_address  = models.TextField(blank=True)

    # —────────── Issuer snapshot (the one creating the invoice) ──────────—
    issuer_first_name        = models.CharField(max_length=150, blank=True, default="")
    issuer_last_name         = models.CharField(max_length=150, blank=True, default="")
    issuer_abn           = models.CharField(max_length=20, blank=True, default="")
    issuer_email = models.EmailField(blank=True, default="")
    gst_registered       = models.BooleanField(default=False)
    super_rate_snapshot  = models.DecimalField(max_digits=5, decimal_places=2, default=11.5)

    # —────────── Recipient snapshot (who’s billed) ──────────—
    bill_to_first_name       = models.CharField(max_length=150, blank=True, default="")
    bill_to_last_name        = models.CharField(max_length=150, blank=True, default="")
    bill_to_abn              = models.CharField(max_length=20,  blank=True, default="")

    bank_account_name    = models.CharField(max_length=255, blank=True, default="")
    bsb                  = models.CharField(max_length=6,   blank=True, default="")
    account_number       = models.CharField(max_length=20,  blank=True, default="")

    super_fund_name      = models.CharField(max_length=255, blank=True, default="")
    super_usi            = models.CharField(max_length=50,  blank=True, default="")
    super_member_number  = models.CharField(max_length=50,  blank=True, default="")

    bill_to_email        = models.EmailField(blank=True, default="")
    cc_emails            = models.TextField(blank=True, default="", help_text="Comma-separated emails for CC")

    invoice_date = models.DateField(default=date.today)

    due_date     = models.DateField(null=True, blank=True)

    subtotal   = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    gst_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    super_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total      = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    status     = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['pharmacy']),
        ]

    def __str__(self):
        client = self.custom_bill_to_name if self.external else self.pharmacy_name_snapshot
        return f"Invoice {self.id} to {client}"

class InvoiceLineItem(models.Model):
    CATEGORY_CHOICES = [
        ('ProfessionalServices', 'Professional services'),
        ('Superannuation', 'Superannuation'),
        ('Transportation', 'Travel expenses'),
        ('Accommodation', 'Accommodation'),
        ('Miscellaneous', 'Miscellaneous reimbursements'),
    ]
    UNIT_CHOICES = [
        ('Hours', 'Hours'),
        ('Lump Sum', 'Lump Sum'),
    ]

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name='line_items'
    )
    description      = models.CharField(max_length=255)
    category_code    = models.CharField(
        max_length=20,
        choices=CATEGORY_CHOICES,
        default='ProfessionalServices',
        help_text='ATO category code'
    )
    unit             = models.CharField(
        max_length=50,
        choices=UNIT_CHOICES,
        default='Hours',
        help_text='Unit of measure'
    )
    quantity         = models.DecimalField(max_digits=6, decimal_places=2)
    unit_price       = models.DecimalField(max_digits=10, decimal_places=2)
    discount         = models.DecimalField(
        max_digits=5, decimal_places=2,
        default=0,
        help_text='Discount percentage'
    )
    total            = models.DecimalField(max_digits=10, decimal_places=2)

    gst_applicable   = models.BooleanField(default=True)
    super_applicable = models.BooleanField(default=True)
    is_manual        = models.BooleanField(default=False)
    was_modified     = models.BooleanField(default=False)  # ✅ New field

    shift = models.ForeignKey(
        'client_profile.Shift',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoice_items'
    )
    class Meta:
        indexes = [
            models.Index(fields=['invoice']),
            models.Index(fields=['shift']),
        ]

    def __str__(self):
        return f"{self.description} – {self.quantity} {self.unit} @ {self.unit_price}"



def explorer_post_upload_path(instance, filename):
    """
    Legacy upload path kept for historical migrations (e.g. 0002_initial).
    Do not remove unless those migrations are rewritten.
    """
    post_id = getattr(instance, "post_id", "unknown")
    return f"explorer_posts/{post_id}/{filename}"


class ExplorerPost(models.Model):
    ROLE_CATEGORY_CHOICES = [
        ("EXPLORER", "Explorer"),
        ("PHARMACIST", "Pharmacist"),
        ("OTHER_STAFF", "Other Staff"),
    ]
    WORK_TYPE_CHOICES = [
        ("FULL_TIME", "Full Time"),
        ("PART_TIME", "Part Time"),
        ("CASUAL", "Casual"),
    ]
    AVAILABILITY_MODE_CHOICES = [
        ("FULL_TIME_NOTICE", "Full Time Notice"),
        ("PART_TIME_DAYS", "Part Time Days"),
        ("CASUAL_CALENDAR", "Casual/Locum Calendar"),
    ]
    POST_KIND_CHOICES = [
        ("FULL_TIME_APPLICATION", "Full Time Application"),
        ("AVAILABILITY", "Availability Post"),
    ]

    explorer_profile = models.ForeignKey(
        'ExplorerOnboarding',
        on_delete=models.CASCADE,
        related_name='posts',
        null=True,
        blank=True,
    )
    author_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="talent_posts",
        null=True,
        blank=True,
    )
    headline    = models.CharField(max_length=255)
    body        = models.TextField(blank=True)

    # Talent board fields (used across Explorer/Pharmacist/Other Staff)
    role_category = models.CharField(max_length=20, choices=ROLE_CATEGORY_CHOICES, blank=True, null=True)
    role_title = models.CharField(max_length=120, blank=True, null=True)
    work_types = models.JSONField(default=list, blank=True)  # multi-select support
    post_kind = models.CharField(max_length=30, choices=POST_KIND_CHOICES, default="AVAILABILITY")
    coverage_radius_km = models.PositiveSmallIntegerField(blank=True, null=True)
    open_to_travel = models.BooleanField(default=False)
    availability_mode = models.CharField(max_length=30, choices=AVAILABILITY_MODE_CHOICES, blank=True, null=True)
    availability_summary = models.CharField(max_length=255, blank=True, null=True)
    availability_days = models.JSONField(default=list, blank=True)
    availability_notice = models.CharField(max_length=50, blank=True, null=True)
    location_suburb = models.CharField(max_length=100, blank=True, null=True)
    location_state = models.CharField(max_length=50, blank=True, null=True)
    location_postcode = models.CharField(max_length=10, blank=True, null=True)
    skills = models.JSONField(default=list, blank=True)
    software = models.JSONField(default=list, blank=True)
    reference_code = models.CharField(max_length=20, unique=True, blank=True, null=True)
    is_anonymous = models.BooleanField(default=True)

    # Denormalized counters (kept in sync in views)
    view_count  = models.PositiveIntegerField(default=0)
    like_count  = models.PositiveIntegerField(default=0)
    reply_count = models.PositiveIntegerField(default=0)  # future-ready (comments)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['explorer_profile', '-created_at']),
        ]

    def __str__(self):
        if self.author_user:
            return f"{self.headline} - {self.author_user.get_full_name()}"
        if self.explorer_profile and getattr(self.explorer_profile, "user", None):
            return f"{self.headline} - {self.explorer_profile.user.get_full_name()}"
        return self.headline

    def parsed_availability_dates(self):
        dates = []
        for entry in self.availability_days or []:
            raw_date = None
            if isinstance(entry, str):
                raw_date = entry
            elif isinstance(entry, dict):
                raw_date = entry.get("date")
            if not raw_date:
                continue
            try:
                dates.append(date.fromisoformat(str(raw_date)))
            except (TypeError, ValueError):
                continue
        return dates

    def latest_availability_date(self):
        dates = self.parsed_availability_dates()
        if not dates:
            return None
        return max(dates)

    def is_talent_board_visible(self, today=None):
        if self.post_kind == "FULL_TIME_APPLICATION":
            return True
        latest_date = self.latest_availability_date()
        if latest_date is None:
            return True
        return latest_date >= (today or timezone.localdate())

class ExplorerPostReaction(models.Model):
    """
    Simple 'like' for now (one per user per post).
    Extend later for emojis by adding a 'type' field.
    """
    post   = models.ForeignKey(ExplorerPost, on_delete=models.CASCADE, related_name='reactions')
    user   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='explorer_post_reactions')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('post', 'user')]
        indexes = [
            models.Index(fields=['post']),
            models.Index(fields=['user']),
        ]

    def __str__(self):
        return f"❤️ u#{self.user_id} → p#{self.post_id}"






class UserAvailability(models.Model):
    """
    Timeslot model representing when a user is available to work.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='user_availabilities'
    )
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    is_all_day = models.BooleanField(default=False)
    is_recurring = models.BooleanField(default=False)
    recurring_days = models.JSONField(default=list, blank=True)  # list of ints [0=Sun..6=Sat]
    recurring_end_date = models.DateField(null=True, blank=True)
    notify_new_shifts = models.BooleanField(
        default=False,
        help_text="Notify this user when a public shift matches this availability."
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        indexes = [
            models.Index(fields=['user']),
        ]

    def __str__(self):
        times = "All Day" if self.is_all_day else f"{self.start_time}-{self.end_time}"
        return f"{self.user.username} available {times} on {self.date}"



# --- Realtime Chat Models ----------------------------------------------------

class Conversation(models.Model):
    class Type(models.TextChoices):
        GROUP = "GROUP", "Group"
        DM = "DM", "Direct"

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_conversations'
    )
    type = models.CharField(max_length=8, choices=Type.choices, default=Type.GROUP)
    title = models.CharField(max_length=255, blank=True)
    dm_key = models.CharField(max_length=63, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    pinned_message = models.ForeignKey(
        'Message',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+' # No reverse relation needed
    )

    # 👇 THIS IS THE MISSING FIELD TO ADD
    # This links a conversation to a pharmacy, identifying it as a "community" chat.
    pharmacy = models.ForeignKey(
        'client_profile.Pharmacy',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='group_conversations'
    )

    class Meta:
        indexes = [
            models.Index(fields=['created_by', 'updated_at']),
            models.Index(fields=['updated_at']),
            models.Index(fields=['pharmacy']),
            models.Index(fields=['dm_key']),
        ]
        constraints = [
            # This rule prevents duplicate community chats for the same pharmacy.
            models.UniqueConstraint(
                fields=['pharmacy'],
                name='uniq_community_chat_per_pharmacy',
                condition=models.Q(pharmacy__isnull=False)
            ),
            models.UniqueConstraint(fields=['dm_key'],
                                    name='uniq_dm_per_user_pair',
                                    condition=~models.Q(dm_key="")),
        ]

    def __str__(self):
        return self.title or f"Conversation {self.id}"

class Participant(models.Model):
    conversation = models.ForeignKey('client_profile.Conversation',
                                     on_delete=models.CASCADE,
                                     related_name='participants')
    membership = models.ForeignKey(Membership, on_delete=models.SET_NULL, null=True, blank=True, related_name='chat_participations')
    is_admin = models.BooleanField(default=False)
    joined_at = models.DateTimeField(auto_now_add=True)
    last_read_at = models.DateTimeField(null=True, blank=True)

    # FIX: Add is_pinned field to track pinning on a per-user basis.
    is_pinned = models.BooleanField(default=False)
    # Per-user pinned message (replaces global conversation.pinned_message for user-specific pins)
    pinned_message = models.ForeignKey(
        'client_profile.Message',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pinned_by_participants'
    )

    class Meta:
        unique_together = [('conversation', 'membership')]
        indexes = [
            models.Index(fields=['conversation']),
            models.Index(fields=['membership']),
        ]

    def __str__(self):
        return f"Participant m#{self.membership_id} in c#{self.conversation_id}"



def chat_upload_path(instance, filename):
    conversation_id = instance.conversation_id or "new"
    return _unique_upload_path(f"chat/{conversation_id}", filename)


class Message(models.Model):
    """
    A message in a conversation.
    Attachments use your existing MEDIA storage config.
    """
    conversation = models.ForeignKey('client_profile.Conversation',
                                     on_delete=models.CASCADE,
                                     related_name='messages')
    sender = models.ForeignKey('client_profile.Membership',
                               on_delete=models.CASCADE,
                               related_name='sent_messages')
    body = models.TextField(blank=True)
    attachment = models.FileField(upload_to=chat_upload_path, null=True, blank=True)
    attachment_filename = models.CharField(max_length=255, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    is_deleted = models.BooleanField(default=False)
    is_edited = models.BooleanField(default=False)
    original_body = models.TextField(blank=True, null=True, help_text="Stores the original message body before an edit.")

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['conversation', 'created_at']),
            models.Index(fields=['sender']),
            models.Index(fields=['conversation', 'id']),
        ]

    def __str__(self):
        return f"Msg#{self.id} by m#{self.sender_id} in c#{self.conversation_id}"

class MessageReaction(models.Model):
    REACTION_CHOICES = [
        ('👍', 'Thumbs Up'),
        ('❤️', 'Heart'),
        ('🔥', 'Fire'),
        ('💩', 'Poop'),
    ]

    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='reactions')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='message_reactions')
    reaction = models.CharField(max_length=4, choices=REACTION_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Ensures a user can only give one type of reaction per message
        unique_together = ('message', 'user', 'reaction')
        ordering = ['created_at']

    def __str__(self):
        return f"{self.user} reacted with {self.reaction} to message {self.message.id}"

# --- Helper for DM key -------------------------------------------------------
def make_dm_key(user_id_a: int, user_id_b: int) -> str:
    """
    Deterministic pair key so the same two users map to the same DM room.
    e.g., make_dm_key(45, 12) -> '12:45'
    """
    a, b = sorted([int(user_id_a), int(user_id_b)])
    return f"{a}:{b}"


class NotificationQuerySet(models.QuerySet):
    def unread(self):
        return self.filter(read_at__isnull=True)


class Notification(models.Model):
    class Type(models.TextChoices):
        TASK = "task", "Task"
        MESSAGE = "message", "Message"
        ALERT = "alert", "Alert"
        WORK_NOTE = "work_note", "Work Note"


    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    type = models.CharField(max_length=32, choices=Type.choices, default=Type.TASK)
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    action_url = models.CharField(max_length=512, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = NotificationQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "read_at"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def mark_read(self, commit: bool = True):
        if self.read_at:
            return False
        self.read_at = timezone.now()
        if commit:
            self.save(update_fields=["read_at"])
        return True

    def __str__(self):
        return f"Notification #{self.pk} to user {self.user_id} ({self.type})"


# PharmacyHub
class PharmacyCommunityGroup(models.Model):
    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="community_groups",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_community_groups",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["pharmacy", "name"],
                name="uniq_group_name_per_pharmacy",
            )
        ]
        indexes = [
            models.Index(fields=["pharmacy", "name"]),
            models.Index(fields=["pharmacy", "created_at"]),
        ]

    def __str__(self):
        return f"CommunityGroup#{self.pk} pharmacy={self.pharmacy_id} name={self.name}"


class PharmacyCommunityGroupMembership(models.Model):
    group = models.ForeignKey(
        PharmacyCommunityGroup,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    membership = models.ForeignKey(
        "client_profile.Membership",
        on_delete=models.CASCADE,
        related_name="community_group_memberships",
    )
    is_admin = models.BooleanField(default=False)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("group", "membership")
        indexes = [
            models.Index(fields=["group"]),
            models.Index(fields=["membership"]),
        ]

    def clean(self):
        super().clean()
        if (
            self.membership
            and self.membership.pharmacy_id
            and self.group
            and self.group.pharmacy_id
        ):
            member_pharmacy = self.membership.pharmacy
            group_pharmacy = self.group.pharmacy
            if not member_pharmacy or not group_pharmacy:
                return
            if self.membership.pharmacy_id == self.group.pharmacy_id:
                return
            same_owner = False
            same_org = False
            if getattr(member_pharmacy, "owner_id", None) and getattr(
                group_pharmacy, "owner_id", None
            ):
                same_owner = member_pharmacy.owner_id == group_pharmacy.owner_id
            if getattr(member_pharmacy, "organization_id", None) and getattr(
                group_pharmacy, "organization_id", None
            ):
                same_org = (
                    member_pharmacy.organization_id
                    == group_pharmacy.organization_id
                )
            if not (same_owner or same_org):
                raise ValidationError(
                    "Membership must belong to the same owner or organization as the community group."
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"CommunityGroupMembership#{self.pk} group={self.group_id} membership={self.membership_id}"


class PharmacyHubPost(models.Model):
    class Visibility(models.TextChoices):
        NORMAL = "NORMAL", "Normal"
        ANNOUNCEMENT = "ANNOUNCEMENT", "Announcement"

    class PlatformHub(models.TextChoices):
        PUBLIC = "public", "Public Hub"
        OWNER = "owner", "Owner Hub"
        PHARMACIST = "pharmacist", "Pharmacists Hub"
        INTERN = "intern", "Interns Hub"
        STAFF = "staff", "Staff Hub"
        EXPLORER = "explorer", "Explorer Hub"

    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="hub_posts",
        null=True,
        blank=True,
    )
    author_membership = models.ForeignKey(Membership, on_delete=models.SET_NULL, null=True, blank=True)
    author_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pharmacy_hub_posts",
    )

    body = models.TextField()
    visibility = models.CharField(
        max_length=16,
        choices=Visibility.choices,
        default=Visibility.NORMAL,
    )
    community_group = models.ForeignKey(
        'client_profile.PharmacyCommunityGroup',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='hub_posts'
    )

    allow_comments = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    organization = models.ForeignKey(
        "client_profile.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="hub_posts",
    )
    platform_hub = models.CharField(
        max_length=32,
        choices=PlatformHub.choices,
        null=True,
        blank=True,
        db_index=True,
    )
    is_pinned = models.BooleanField(default=False)
    pinned_at = models.DateTimeField(null=True, blank=True)
    pinned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pinned_pharmacy_hub_posts",
    )
    tagged_members = models.ManyToManyField(
        Membership,
        through="PharmacyHubPostMention",
        related_name="tagged_pharmacy_hub_posts",
        blank=True,
    )

    comment_count = models.PositiveIntegerField(default=0)
    reaction_summary = models.JSONField(default=dict, blank=True)
    original_body = models.TextField(blank=True, default="")
    is_edited = models.BooleanField(default=False)
    last_edited_at = models.DateTimeField(null=True, blank=True)
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edited_pharmacy_hub_posts",
    )

    class Meta:
        db_table = "client_profile_pharmacyhubpost"
        ordering = ["-is_pinned", "-pinned_at", "-created_at"]
        indexes = [
            models.Index(fields=["pharmacy", "created_at"]),
            models.Index(fields=["author_membership"]),
            models.Index(fields=["author_user"]),
            models.Index(fields=["is_pinned", "pinned_at"]),
            models.Index(fields=["organization", "created_at"]),
            models.Index(fields=["community_group", "created_at"]),
            models.Index(fields=["platform_hub", "created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=(
                    Q(
                        platform_hub__isnull=False,
                        pharmacy__isnull=True,
                        organization__isnull=True,
                        community_group__isnull=True,
                    )
                    | Q(
                        community_group__isnull=False,
                        pharmacy__isnull=False,
                        organization__isnull=True,
                        platform_hub__isnull=True,
                    )
                    | Q(
                        community_group__isnull=True,
                        pharmacy__isnull=False,
                        organization__isnull=True,
                        platform_hub__isnull=True,
                    )
                    | Q(
                        community_group__isnull=True,
                        pharmacy__isnull=True,
                        organization__isnull=False,
                        platform_hub__isnull=True,
                    )
                ),
                name="pharmacy_hub_post_scope_check",
            )
        ]

    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")

        if self.platform_hub:
            self.pharmacy_id = None
            self.organization_id = None
            self.community_group_id = None
            if update_fields is not None:
                fields = set(update_fields)
                fields.update({"pharmacy", "organization", "community_group"})
                kwargs["update_fields"] = list(fields)
        elif self.pharmacy_id and not self.organization_id:
            self.organization_id = None
            if update_fields is not None:
                fields = set(update_fields)
                fields.add("organization")
                kwargs["update_fields"] = list(fields)
        elif self.organization_id and not self.pharmacy_id:
            self.pharmacy_id = None
            if update_fields is not None:
                fields = set(update_fields)
                fields.add("pharmacy")
                kwargs["update_fields"] = list(fields)

        if self.community_group_id:
            group_pharmacy_id = self.community_group.pharmacy_id
            if not group_pharmacy_id:
                raise ValidationError("Community group must be linked to a pharmacy.")
            self.pharmacy_id = group_pharmacy_id
            self.organization_id = None
            self.platform_hub = None
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                fields = set(update_fields)
                fields.update({"pharmacy", "organization", "platform_hub"})
                kwargs["update_fields"] = list(fields)
        super().save(*args, **kwargs)

    def soft_delete(self):
        if self.deleted_at:
            return
        attachments = list(self.attachments.all())
        for attachment in attachments:
            try:
                if attachment.file:
                    attachment.file.delete(save=False)
            except Exception:
                pass
            attachment.delete()
        self.deleted_at = timezone.now()
        self.is_pinned = False
        self.pinned_at = None
        self.pinned_by = None
        self.save(update_fields=["deleted_at", "is_pinned", "pinned_at", "pinned_by"])

    def recompute_comment_count(self):
        from django.db.models import Count

        total = (
            self.comments.filter(deleted_at__isnull=True)
            .aggregate(total=Count("id"))
            .get("total", 0)
        )
        if total != self.comment_count:
            self.comment_count = total
            self.save(update_fields=["comment_count"])

    def recompute_reaction_summary(self):
        from django.db.models import Count

        summary = {
            row["reaction_type"]: row["total"]
            for row in self.reactions.values("reaction_type")
            .order_by()
            .annotate(total=Count("id"))
        }
        if summary != self.reaction_summary:
            self.reaction_summary = summary
            self.save(update_fields=["reaction_summary"])


class PharmacyHubPostMention(models.Model):
    post = models.ForeignKey(
        PharmacyHubPost,
        on_delete=models.CASCADE,
        related_name="mentions",
    )
    membership = models.ForeignKey(
        Membership,
        on_delete=models.CASCADE,
        related_name="hub_post_mentions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "client_profile_pharmacyhubpostmention"
        unique_together = ("post", "membership")

    def __str__(self):
        return f"HubPostMention#{self.pk} post={self.post_id} membership={self.membership_id}"


class PharmacyHubComment(models.Model):
    post = models.ForeignKey(
        PharmacyHubPost,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    author_membership = models.ForeignKey(Membership, on_delete=models.SET_NULL, null=True, blank=True)
    author_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hub_comments",
    )

    body = models.TextField()
    reaction_summary = models.JSONField(default=dict, blank=True)
    parent_comment = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="replies",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    original_body = models.TextField(blank=True, default="")
    is_edited = models.BooleanField(default=False)
    last_edited_at = models.DateTimeField(null=True, blank=True)
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edited_pharmacy_hub_comments",
    )

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["post", "created_at"]),
            models.Index(fields=["author_membership"]),
            models.Index(fields=["author_user"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=Q(author_membership__isnull=False) | Q(author_user__isnull=False),
                name="hub_comment_has_author_membership_or_user",
            )
        ]

    def soft_delete(self):
        if not self.deleted_at:
            self.deleted_at = timezone.now()
            self.save(update_fields=["deleted_at"])

    def recompute_reaction_summary(self):
        from django.db.models import Count

        summary = {
            row["reaction_type"]: row["total"]
            for row in self.reactions.values("reaction_type")
            .order_by()
            .annotate(total=Count("id"))
        }
        if summary != self.reaction_summary:
            self.reaction_summary = summary
            self.save(update_fields=["reaction_summary"])

    def __str__(self):
        return f"HubComment#{self.pk} post={self.post_id}"


class HubReactionType(models.TextChoices):
    LIKE = "LIKE", "Like"
    CELEBRATE = "CELEBRATE", "Celebrate"
    SUPPORT = "SUPPORT", "Support"
    INSIGHTFUL = "INSIGHTFUL", "Insightful"
    LOVE = "LOVE", "Love"


class PharmacyHubCommentReaction(models.Model):
    comment = models.ForeignKey(
        PharmacyHubComment,
        on_delete=models.CASCADE,
        related_name="reactions",
    )
    member = models.ForeignKey(
        "client_profile.Membership",
        on_delete=models.CASCADE,
        related_name="hub_comment_reactions",
        null=True,
        blank=True,
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hub_comment_reactions",
        null=True,
        blank=True,
    )
    reaction_type = models.CharField(
        max_length=16,
        choices=HubReactionType.choices,
        default=HubReactionType.LIKE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["comment", "member"],
                condition=Q(member__isnull=False),
                name="unique_hub_comment_reaction_member",
            ),
            models.UniqueConstraint(
                fields=["comment", "user"],
                condition=Q(user__isnull=False),
                name="unique_hub_comment_reaction_user",
            ),
            models.CheckConstraint(
                check=(
                    (Q(member__isnull=False) & Q(user__isnull=True))
                    | (Q(member__isnull=True) & Q(user__isnull=False))
                ),
                name="hub_comment_reaction_member_xor_user",
            ),
        ]
        indexes = [
            models.Index(fields=["comment"]),
            models.Index(fields=["member"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return (
            f"HubCommentReaction#{self.pk} comment={self.comment_id} member={self.member_id}"
        )


class PharmacyHubReaction(models.Model):
    post = models.ForeignKey(
        PharmacyHubPost,
        on_delete=models.CASCADE,
        related_name="reactions",
    )
    member = models.ForeignKey(
        "client_profile.Membership",
        on_delete=models.CASCADE,
        related_name="hub_reactions",
        null=True,
        blank=True,
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hub_reactions",
        null=True,
        blank=True,
    )
    reaction_type = models.CharField(
        max_length=16,
        choices=HubReactionType.choices,
        default=HubReactionType.LIKE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["post", "member"],
                condition=Q(member__isnull=False),
                name="unique_hub_post_reaction_member",
            ),
            models.UniqueConstraint(
                fields=["post", "user"],
                condition=Q(user__isnull=False),
                name="unique_hub_post_reaction_user",
            ),
            models.CheckConstraint(
                check=(
                    (Q(member__isnull=False) & Q(user__isnull=True))
                    | (Q(member__isnull=True) & Q(user__isnull=False))
                ),
                name="hub_post_reaction_member_xor_user",
            ),
        ]
        indexes = [
            models.Index(fields=["post"]),
            models.Index(fields=["member"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return f"HubReaction#{self.pk} post={self.post_id} member={self.member_id}"


class PharmacyHubAttachment(models.Model):
    class Kind(models.TextChoices):
        IMAGE = "IMAGE", "Image"
        GIF = "GIF", "GIF"
        FILE = "FILE", "File"

    post = models.ForeignKey(
        PharmacyHubPost,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to=hub_attachment_upload_path)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.FILE)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["post"]),
            models.Index(fields=["kind"]),
        ]

    def __str__(self):
        return f"Attachment#{self.pk} for post={self.post_id}"


class PharmacyHubPoll(models.Model):
    class PlatformHub(models.TextChoices):
        PUBLIC = "public", "Public Hub"
        OWNER = "owner", "Owner Hub"
        PHARMACIST = "pharmacist", "Pharmacists Hub"
        INTERN = "intern", "Interns Hub"
        STAFF = "staff", "Staff Hub"
        EXPLORER = "explorer", "Explorer Hub"

    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="hub_polls",
    )
    organization = models.ForeignKey(
        "client_profile.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="hub_polls",
    )
    community_group = models.ForeignKey(
        PharmacyCommunityGroup,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="hub_polls",
    )
    platform_hub = models.CharField(
        max_length=32,
        choices=PlatformHub.choices,
        null=True,
        blank=True,
        db_index=True,
    )
    question = models.CharField(max_length=500)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_hub_polls",
    )
    created_by_membership = models.ForeignKey(
        Membership,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_hub_polls",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    closes_at = models.DateTimeField(null=True, blank=True)
    is_closed = models.BooleanField(default=False)
    comment_count = models.PositiveIntegerField(default=0)
    reaction_summary = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["pharmacy", "created_at"]),
            models.Index(fields=["organization", "created_at"]),
            models.Index(fields=["community_group", "created_at"]),
            models.Index(fields=["platform_hub", "created_at"]),
            models.Index(fields=["is_closed", "closes_at"]),
            models.Index(fields=["created_by"]),
            models.Index(fields=["created_by_membership"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=(
                    Q(
                        platform_hub__isnull=False,
                        pharmacy__isnull=True,
                        organization__isnull=True,
                        community_group__isnull=True,
                    )
                    | Q(
                        community_group__isnull=False,
                        pharmacy__isnull=False,
                        organization__isnull=True,
                        platform_hub__isnull=True,
                    )
                    | Q(
                        community_group__isnull=True,
                        pharmacy__isnull=False,
                        organization__isnull=True,
                        platform_hub__isnull=True,
                    )
                    | Q(
                        community_group__isnull=True,
                        pharmacy__isnull=True,
                        organization__isnull=False,
                        platform_hub__isnull=True,
                    )
                ),
                name="pharmacy_hub_poll_scope_check",
            )
        ]

    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")
        if self.platform_hub:
            self.pharmacy_id = None
            self.organization_id = None
            self.community_group_id = None
            if update_fields is not None:
                fields = set(update_fields)
                fields.update({"pharmacy", "organization", "community_group"})
                kwargs["update_fields"] = list(fields)
        elif self.community_group_id:
            group_pharmacy_id = self.community_group.pharmacy_id
            if not group_pharmacy_id:
                raise ValidationError("Community group must be linked to a pharmacy.")
            self.pharmacy_id = group_pharmacy_id
            self.organization_id = None
            self.platform_hub = None
            if update_fields is not None:
                fields = set(update_fields)
                fields.update({"pharmacy", "organization", "platform_hub"})
                kwargs["update_fields"] = list(fields)
        elif self.pharmacy_id and self.organization_id:
            # enforce constraint manually to keep validation errors clear
            raise ValidationError("Poll must target either a pharmacy or organization, not both.")
        super().save(*args, **kwargs)

    def __str__(self):
        if self.platform_hub:
            return f"HubPoll#{self.pk} platform={self.platform_hub}"
        if self.community_group_id:
            return f"HubPoll#{self.pk} group={self.community_group_id}"
        if self.pharmacy_id:
            return f"HubPoll#{self.pk} pharmacy={self.pharmacy_id}"
        return f"HubPoll#{self.pk} organization={self.organization_id}"

    def recompute_comment_count(self):
        from django.db.models import Count

        total = (
            self.comments.filter(deleted_at__isnull=True)
            .aggregate(total=Count("id"))
            .get("total", 0)
        )
        if total != self.comment_count:
            self.comment_count = total
            self.save(update_fields=["comment_count"])

    def recompute_reaction_summary(self):
        from django.db.models import Count

        summary = {
            row["reaction_type"]: row["total"]
            for row in self.reactions.values("reaction_type")
            .order_by()
            .annotate(total=Count("id"))
        }
        if summary != self.reaction_summary:
            self.reaction_summary = summary
            self.save(update_fields=["reaction_summary"])


class PharmacyHubPollOption(models.Model):
    poll = models.ForeignKey(
        PharmacyHubPoll,
        on_delete=models.CASCADE,
        related_name="options",
    )
    label = models.CharField(max_length=255)
    vote_count = models.PositiveIntegerField(default=0)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
        indexes = [
            models.Index(fields=["poll", "position"]),
        ]

    def __str__(self):
        return f"HubPollOption#{self.pk} poll={self.poll_id}"


class PharmacyHubPollVote(models.Model):
    poll = models.ForeignKey(
        PharmacyHubPoll,
        on_delete=models.CASCADE,
        related_name="votes",
    )
    option = models.ForeignKey(
        PharmacyHubPollOption,
        on_delete=models.CASCADE,
        related_name="votes",
    )
    membership = models.ForeignKey(
        Membership,
        on_delete=models.CASCADE,
        related_name="hub_poll_votes",
        null=True,
        blank=True,
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hub_poll_votes",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["poll", "membership"],
                condition=Q(membership__isnull=False),
                name="unique_hub_poll_vote_membership",
            ),
            models.UniqueConstraint(
                fields=["poll", "user"],
                condition=Q(user__isnull=False),
                name="unique_hub_poll_vote_user",
            ),
            models.CheckConstraint(
                check=(
                    (Q(membership__isnull=False) & Q(user__isnull=True))
                    | (Q(membership__isnull=True) & Q(user__isnull=False))
                ),
                name="hub_poll_vote_membership_xor_user",
            ),
        ]
        indexes = [
            models.Index(fields=["poll"]),
            models.Index(fields=["option"]),
            models.Index(fields=["membership"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return f"HubPollVote#{self.pk} poll={self.poll_id} option={self.option_id} membership={self.membership_id}"


class PharmacyHubPollComment(models.Model):
    poll = models.ForeignKey(
        PharmacyHubPoll,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    author_membership = models.ForeignKey(
        Membership,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hub_poll_comments",
    )
    author_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hub_poll_comments",
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    original_body = models.TextField(blank=True, default="")
    is_edited = models.BooleanField(default=False)
    last_edited_at = models.DateTimeField(null=True, blank=True)
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edited_pharmacy_hub_poll_comments",
    )

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["poll", "created_at"]),
            models.Index(fields=["author_membership"]),
            models.Index(fields=["author_user"]),
        ]

    def soft_delete(self):
        if not self.deleted_at:
            self.deleted_at = timezone.now()
            self.save(update_fields=["deleted_at"])

    def __str__(self):
        return f"HubPollComment#{self.pk} poll={self.poll_id}"


class PharmacyHubPollReaction(models.Model):
    poll = models.ForeignKey(
        PharmacyHubPoll,
        on_delete=models.CASCADE,
        related_name="reactions",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hub_poll_reactions",
    )
    reaction_type = models.CharField(
        max_length=16,
        choices=HubReactionType.choices,
        default=HubReactionType.LIKE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("poll", "user")
        indexes = [
            models.Index(fields=["poll"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return f"HubPollReaction#{self.pk} poll={self.poll_id} user={self.user_id}"





# ============================================================
# Calendar Events & Work Notes
# ============================================================

class CalendarEvent(models.Model):
    """
    Calendar events for pharmacies/organizations.
    Supports manual events, auto-generated birthdays, and shift-linked events.
    """
    class Source(models.TextChoices):
        MANUAL = 'manual', 'Manual'
        BIRTHDAY = 'birthday', 'Birthday'
        SHIFT = 'shift', 'Shift'
        ORG_EVENT = 'org_event', 'Organization Event'

    pharmacy = models.ForeignKey(
        'Pharmacy',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='calendar_events',
    )
    organization = models.ForeignKey(
        'Organization',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='calendar_events',
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    date = models.DateField(db_index=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    all_day = models.BooleanField(default=True)
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.MANUAL)
    recurrence = models.JSONField(null=True, blank=True, help_text="Recurrence rule: {'freq': 'DAILY|WEEKLY|MONTHLY', 'interval': int, 'until_date': 'YYYY-MM-DD', 'byweekday': [0-6]}")
    
    # For birthday idempotency: link to the membership whose birthday this represents
    source_membership = models.ForeignKey(
        'Membership',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='birthday_events',
        help_text="For birthday events: the membership whose DOB generated this event"
    )
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_calendar_events',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['pharmacy', 'date']),
            models.Index(fields=['organization', 'date']),
            models.Index(fields=['source', 'date']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['source_membership', 'date', 'source'],
                name='unique_birthday_event',
                condition=models.Q(source='birthday'),
            ),
        ]

    def __str__(self):
        return f"CalendarEvent#{self.pk} '{self.title}' on {self.date}"


class WorkNote(models.Model):
    """
    Work notes/tasks that can be assigned to staff for a specific date.
    """
    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        IN_PROGRESS = 'in_progress', 'In Progress'
        DONE = 'done', 'Done'

    pharmacy = models.ForeignKey(
        'Pharmacy',
        on_delete=models.CASCADE,
        related_name='work_notes',
    )
    date = models.DateField(db_index=True)
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    
    # Notification settings
    notify_on_shift_start = models.BooleanField(
        default=False,
        help_text="Send notification when assigned staff's shift starts"
    )

    # Recurrence rule similar to CalendarEvent.recurrence
    recurrence = models.JSONField(
        null=True,
        blank=True,
        help_text="Recurrence rule: {'freq': 'DAILY|WEEKLY|MONTHLY', 'interval': int, 'until_date': 'YYYY-MM-DD', 'byweekday': [0-6]}"
    )
    
    # General note (tags all staff)
    is_general = models.BooleanField(
        default=False,
        help_text="If true, this note applies to all pharmacy staff"
    )
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_work_notes',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['pharmacy', 'date']),
            models.Index(fields=['pharmacy', 'status']),
            models.Index(fields=['date', 'notify_on_shift_start']),
        ]
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"WorkNote#{self.pk} '{self.title}' for {self.pharmacy_id} on {self.date}"


class WorkNoteAssignee(models.Model):
    """
    Links work notes to specific staff members via their Membership.
    Using Membership (not User) ensures tenant isolation.
    """
    work_note = models.ForeignKey(
        WorkNote,
        on_delete=models.CASCADE,
        related_name='assignees',
    )
    membership = models.ForeignKey(
        'Membership',
        on_delete=models.CASCADE,
        related_name='assigned_work_notes',
    )
    notified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When shift-start notification was sent"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('work_note', 'membership')
        indexes = [
            models.Index(fields=['membership']),
            models.Index(fields=['work_note']),
        ]

    def __str__(self):
        return f"WorkNoteAssignee#{self.pk} note={self.work_note_id} membership={self.membership_id}"


class WorkNoteCompletion(models.Model):
    """
    Per-user completion for a specific work note occurrence date.
    """
    work_note = models.ForeignKey(
        WorkNote,
        on_delete=models.CASCADE,
        related_name="completions",
    )
    membership = models.ForeignKey(
        "Membership",
        on_delete=models.CASCADE,
        related_name="work_note_completions",
    )
    occurrence_date = models.DateField(db_index=True)
    completed_at = models.DateTimeField(auto_now_add=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="completed_work_notes",
    )

    class Meta:
        unique_together = ("work_note", "membership", "occurrence_date")
        indexes = [
            models.Index(fields=["work_note", "occurrence_date"]),
            models.Index(fields=["membership", "occurrence_date"]),
        ]

    def __str__(self):
        return (
            f"WorkNoteCompletion#{self.pk} note={self.work_note_id} "
            f"membership={self.membership_id} date={self.occurrence_date}"
        )


# ---------------------------------------------------------------------------
# Roster V2 Models
# ---------------------------------------------------------------------------

class RosterPeriod(models.Model):
    """
    Groups a week's worth of ShiftSlotAssignment rows into a manageable
    period that can be drafted, validated, and published.
    """
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"
        ARCHIVED = "ARCHIVED", "Archived"

    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="roster_periods",
    )
    week_start = models.DateField(
        help_text="Monday of the roster week (ISO weekday 1)."
    )
    status = models.CharField(
        max_length=12,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_roster_periods",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_roster_periods",
    )
    copied_from = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="copies",
        help_text="Source period when created via copy-week.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("pharmacy", "week_start")
        ordering = ["-week_start"]
        indexes = [
            models.Index(fields=["pharmacy", "week_start"]),
            models.Index(fields=["status"]),
        ]

    def clean(self):
        if self.week_start and self.week_start.weekday() != 0:
            raise ValidationError({"week_start": "week_start must be a Monday."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def week_end(self):
        """Return Sunday of the roster week."""
        return self.week_start + timedelta(days=6)

    def __str__(self):
        return f"Roster {self.pharmacy.name} w/c {self.week_start} [{self.status}]"


class RosterTemplate(models.Model):
    """
    Reusable weekly template that can be applied to generate draft
    ShiftSlotAssignment rows for a given week.
    """
    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="roster_templates",
    )
    name = models.CharField(max_length=120)
    template_data = models.JSONField(
        default=list,
        help_text=(
            "Array of objects: "
            "[{day_of_week: 0-6, start_time, end_time, role, user_id?}, ...]"
        ),
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_roster_templates",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["pharmacy"]),
        ]

    def __str__(self):
        return f"RosterTemplate '{self.name}' @ {self.pharmacy.name}"


# ---------------------------------------------------------------------------
# Attendance V1 Models
# ---------------------------------------------------------------------------

class KioskDevice(models.Model):
    """
    Registered pharmacy computer that can display QR codes and accept
    optional PIN-based clock-in. Uses a restricted device token, not a
    user JWT.
    """
    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="kiosk_devices",
    )
    device_token = models.CharField(
        max_length=255,
        unique=True,
        db_index=True,
        help_text="Restricted auth token for this device.",
    )
    device_name = models.CharField(
        max_length=120,
        help_text="Human-readable label, e.g. 'Front Counter iPad'.",
    )
    is_active = models.BooleanField(default=True)
    activated_at = models.DateTimeField(auto_now_add=True)
    activated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activated_kiosk_devices",
    )

    class Meta:
        indexes = [
            models.Index(fields=["pharmacy"]),
        ]

    def __str__(self):
        return f"Kiosk '{self.device_name}' @ {self.pharmacy.name}"


class PharmacyQRSession(models.Model):
    """
    Short-lived rotating QR code used for attendance clock-in/out.
    Generated by a kiosk device and valid for a configurable TTL.
    """
    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="qr_sessions",
    )
    code = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="Random short-lived code embedded in QR.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(
        default=False,
        help_text="Optional single-use guard.",
    )

    class Meta:
        indexes = [
            models.Index(fields=["pharmacy", "expires_at"]),
            models.Index(fields=["code"]),
        ]

    @property
    def is_expired(self):
        return timezone.now() >= self.expires_at

    def __str__(self):
        return f"QR {self.code[:8]}… @ {self.pharmacy.name} (exp {self.expires_at})"


class WorkerPIN(models.Model):
    """
    Optional owner-controlled personal code for kiosk-based clock-in.
    Hashed, rate-limited, with lockout.
    """
    membership = models.OneToOneField(
        "client_profile.Membership",
        on_delete=models.CASCADE,
        related_name="worker_pin",
    )
    pin_hash = models.CharField(
        max_length=255,
        help_text="bcrypt/argon2 hash of the worker's PIN.",
    )
    failed_attempts = models.IntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    is_enabled = models.BooleanField(
        default=True,
        help_text="Owner can toggle PIN requirement on/off.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    MAX_FAILED_ATTEMPTS = 5
    LOCKOUT_DURATION = timedelta(minutes=15)

    @property
    def is_locked(self):
        if self.locked_until and timezone.now() < self.locked_until:
            return True
        return False

    def set_pin(self, raw_pin):
        """Hash a code without saving; the owner-authorized service saves it."""
        if not isinstance(raw_pin, str) or not raw_pin.strip():
            raise ValidationError("A non-empty personal code is required.")
        self.pin_hash = make_password(raw_pin)
        self.failed_attempts = 0
        self.locked_until = None

    def check_pin(self, raw_pin):
        """Check credentials only; kiosk services must enforce attempt limits."""
        return (
            self.is_enabled
            and not self.is_locked
            and isinstance(raw_pin, str)
            and check_password(raw_pin, self.pin_hash)
        )

    def record_failed_attempt(self):
        # Serialize attempts against the stored row, not a stale model instance.
        with transaction.atomic():
            current = type(self).objects.select_for_update().get(pk=self.pk)
            now = timezone.now()
            if not current.is_locked:
                if current.locked_until is not None:
                    current.failed_attempts = 0
                    current.locked_until = None
                current.failed_attempts += 1
                if current.failed_attempts >= self.MAX_FAILED_ATTEMPTS:
                    current.locked_until = now + self.LOCKOUT_DURATION
                current.save(update_fields=["failed_attempts", "locked_until", "updated_at"])
            self.failed_attempts = current.failed_attempts
            self.locked_until = current.locked_until

    def reset_attempts(self):
        with transaction.atomic():
            current = type(self).objects.select_for_update().get(pk=self.pk)
            current.failed_attempts = 0
            current.locked_until = None
            current.save(update_fields=["failed_attempts", "locked_until", "updated_at"])
            self.failed_attempts = 0
            self.locked_until = None

    def __str__(self):
        return f"PIN for {self.membership}"


class AttendanceSession(models.Model):
    """
    Immutable event log — append-only, never edited directly.
    Manager corrections go through AttendanceCorrection.
    """
    class EventType(models.TextChoices):
        CLOCK_IN = "CLOCK_IN", "Clock In"
        CLOCK_OUT = "CLOCK_OUT", "Clock Out"
        BREAK_START = "BREAK_START", "Break Start"
        BREAK_END = "BREAK_END", "Break End"

    class Source(models.TextChoices):
        QR_KIOSK = "QR_KIOSK", "QR Kiosk"
        MOBILE_QR = "MOBILE_QR", "Mobile QR"
        KIOSK_PIN = "KIOSK_PIN", "Kiosk PIN"
        IN_APP = "IN_APP", "In-App (breaks)"

    # Valid state transitions: event_type -> allowed next event_types
    VALID_TRANSITIONS = {
        None: {EventType.CLOCK_IN},
        EventType.CLOCK_IN: {EventType.BREAK_START, EventType.CLOCK_OUT},
        EventType.BREAK_START: {EventType.BREAK_END},
        EventType.BREAK_END: {EventType.BREAK_START, EventType.CLOCK_OUT},
        EventType.CLOCK_OUT: {EventType.CLOCK_IN},  # Next day / new session
    }

    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="attendance_events",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="attendance_events",
    )
    assignment = models.ForeignKey(
        "client_profile.ShiftSlotAssignment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attendance_events",
        help_text="Null for unrostered/urgent cover.",
    )
    event_type = models.CharField(
        max_length=16,
        choices=EventType.choices,
    )
    timestamp = models.DateTimeField(
        help_text="Actual clock time.",
    )
    source = models.CharField(
        max_length=16,
        choices=Source.choices,
    )
    qr_session = models.ForeignKey(
        PharmacyQRSession,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attendance_events",
    )
    device = models.ForeignKey(
        KioskDevice,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attendance_events",
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    is_provisional = models.BooleanField(
        default=False,
        help_text="True for unrostered or cross-site cover, pending approval.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["timestamp"]
        indexes = [
            models.Index(fields=["pharmacy", "user", "timestamp"]),
            models.Index(fields=["assignment", "timestamp"]),
            models.Index(fields=["user", "timestamp"]),
        ]

    def __str__(self):
        prov = " [PROVISIONAL]" if self.is_provisional else ""
        return f"{self.event_type} {self.user} @ {self.pharmacy.name} {self.timestamp}{prov}"


class ProvisionalAttendance(models.Model):
    """
    Pending-approval record for unscheduled or cross-site clock-ins.
    Approval backfills the Shift + ShiftSlotAssignment and preserves
    actual clock times. Never auto-creates permanent Membership.
    """
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    class CoverType(models.TextChoices):
        UNROSTERED_LOCAL = "UNROSTERED_LOCAL", "Unrostered Local Staff"
        CROSS_SITE_CHAIN = "CROSS_SITE_CHAIN", "Cross-Site Same Owner Chain"
        CROSS_SITE_ORG = "CROSS_SITE_ORG", "Cross-Site Same Organization"

    attendance_clock_in = models.ForeignKey(
        AttendanceSession,
        on_delete=models.CASCADE,
        related_name="provisional_as_clock_in",
    )
    attendance_clock_out = models.ForeignKey(
        AttendanceSession,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="provisional_as_clock_out",
    )
    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="provisional_attendances",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="provisional_attendances",
    )
    source_membership = models.ForeignKey(
        "client_profile.Membership",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cross_site_attendances",
        help_text="Worker's home membership (for cross-site cover).",
    )
    cover_type = models.CharField(
        max_length=30,
        choices=CoverType.choices,
    )
    status = models.CharField(
        max_length=12,
        choices=Status.choices,
        default=Status.PENDING,
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_provisional_attendances",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    backfill_shift = models.ForeignKey(
        "client_profile.Shift",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="provisional_backfills",
        help_text="Created on approval to record the actual worked shift.",
    )
    backfill_assignment = models.ForeignKey(
        "client_profile.ShiftSlotAssignment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="provisional_backfills",
        help_text="Created on approval to record the actual assignment.",
    )
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["pharmacy", "status"]),
            models.Index(fields=["user", "status"]),
        ]

    def __str__(self):
        return (
            f"Provisional {self.cover_type} {self.user} "
            f"@ {self.pharmacy.name} [{self.status}]"
        )


class AttendanceCorrection(models.Model):
    """
    Fully audited manager corrections to attendance events.
    The original AttendanceSession is never mutated.
    """
    original_event = models.ForeignKey(
        AttendanceSession,
        on_delete=models.CASCADE,
        related_name="corrections",
    )
    corrected_timestamp = models.DateTimeField(
        help_text="The manager-adjusted timestamp.",
    )
    reason = models.TextField(
        help_text="Required justification for the correction.",
    )
    corrected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="attendance_corrections_made",
    )
    corrected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-corrected_at"]
        indexes = [
            models.Index(fields=["original_event"]),
        ]

    def __str__(self):
        return (
            f"Correction on event {self.original_event_id} "
            f"by {self.corrected_by} at {self.corrected_at}"
        )
