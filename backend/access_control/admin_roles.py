"""Eligibility shared by organisation and pharmacy admin assignment writers."""
from django.core.exceptions import ValidationError
from rest_framework.exceptions import ValidationError as APIValidationError


def validate_admin_user(user):
    if user is not None and user.is_explorer():
        raise ValidationError("Explorer accounts cannot be admins.")


def validate_admin_user_for_api(user):
    try:
        validate_admin_user(user)
    except ValidationError as exc:
        raise APIValidationError({"detail": exc.messages[0]}) from exc
