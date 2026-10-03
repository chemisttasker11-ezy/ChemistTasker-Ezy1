"""Backward-compatible shared choices and upload-path helpers of the client_profile models.

The choices are owned by the domain that uses them (`onboarding.models`, `memberships.models`) and the generic
upload-path helpers by `core.uploads`. The names below keep the historical import paths working.
"""
from core.uploads import safe_extension as _safe_ext
from core.uploads import unique_upload_path as _unique_upload_path
from memberships.models import (
    INTERN_HALF_CHOICES,
    OTHERSTAFF_CLASSIFICATION_CHOICES,
    PHARMACIST_AWARD_LEVEL_CHOICES,
    STUDENT_YEAR_CHOICES,
)
from onboarding.models import GENDER_CHOICES


# Upload paths of the chat and pharmacy-hub attachments. They live here (not next to their models) because the
# squashed baseline migration refers to them as client_profile.models.<name> and chat.0001_initial as
# client_profile.models.common.<name>; that must keep working after the models moved into their own apps.
def chat_upload_path(instance, filename):
    conversation_id = instance.conversation_id or "new"
    return _unique_upload_path(f"chat/{conversation_id}", filename)


def hub_attachment_upload_path(instance, filename):
    return _unique_upload_path("pharmacy_hub/attachments", filename)
