"""Backward-compatible shared choices and upload-path helpers of the client_profile models.

The choices are owned by the domain that uses them (`onboarding.models`, `memberships.models`) and the generic
upload-path helpers by `infrastructure.uploads`. The names below keep the historical import paths working.
"""
from infrastructure.uploads import safe_extension as _safe_ext
from infrastructure.uploads import unique_upload_path as _unique_upload_path
from memberships.models import (
    INTERN_HALF_CHOICES,
    OTHERSTAFF_CLASSIFICATION_CHOICES,
    PHARMACIST_AWARD_LEVEL_CHOICES,
    STUDENT_YEAR_CHOICES,
)
from onboarding.models import GENDER_CHOICES


# Migration and pickle identity is bound at the historical compatibility owner.
from chat.uploads import chat_upload_path
from pharmacy_hub.uploads import hub_attachment_upload_path
chat_upload_path.__module__ = __name__
hub_attachment_upload_path.__module__ = __name__
