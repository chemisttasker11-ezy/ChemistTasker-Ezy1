"""client_profile models: onboarding (split verbatim from client_profile/models.py)."""
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.contrib.contenttypes.fields import GenericForeignKey, GenericRelation
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from client_profile.fields import EncryptedTextField
from client_profile.models.common import GENDER_CHOICES, _unique_upload_path


def onboarding_upload_path(instance, filename, folder):
    user_id = getattr(instance, "user_id", None) or "new"
    return _unique_upload_path(f"users/{user_id}/{folder}", filename)


def owner_profile_photo_upload_path(instance, filename):
    return onboarding_upload_path(instance, filename, "profile_photos")


def owner_gov_id_upload_path(instance, filename):
    return onboarding_upload_path(instance, filename, "gov_ids")


def owner_secondary_id_upload_path(instance, filename):
    return onboarding_upload_path(instance, filename, "gov_ids_secondary")


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
    government_id = models.FileField(upload_to=owner_gov_id_upload_path, blank=True, null=True)
    government_id_type = models.CharField(max_length=32, choices=[
        ('DRIVER_LICENSE', 'Driving license'), ('VISA', 'Visa'),
        ('AUS_PASSPORT', 'Australian Passport'), ('OTHER_PASSPORT', 'Other Passport'),
        ('AGE_PROOF', 'Age Proof Card'),
    ], blank=True, null=True)
    identity_meta = models.JSONField(default=dict, blank=True)
    identity_secondary_file = models.FileField(upload_to=owner_secondary_id_upload_path, blank=True, null=True)
    gov_id_verified = models.BooleanField(default=False, db_index=True)
    gov_id_verification_note = models.TextField(blank=True, null=True)

    # Regulatory Info for pharmacists only
    ahpra_number    = models.CharField(max_length=100, blank=True, null=True)

    verified        = models.BooleanField(default=False)
    submitted_for_verification = models.BooleanField(default=False)

    organization        = models.ForeignKey(
                             'client_profile.Organization',
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
