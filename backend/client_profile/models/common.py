"""client_profile models: common (split verbatim from client_profile/models.py)."""
import uuid
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
