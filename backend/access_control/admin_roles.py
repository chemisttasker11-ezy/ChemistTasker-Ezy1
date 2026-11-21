"""Eligibility shared by organisation and pharmacy admin assignment writers."""
from django.core.exceptions import ValidationError
from rest_framework.exceptions import ValidationError as APIValidationError


def validate_admin_user(user, *, assignment=None, changes=None):
    if user is not None and user.is_explorer():
        # Historical assignments may be maintained or revoked, but cannot grant new access.
        if assignment is not None and assignment.pk and not assignment._state.adding:
            changes = changes or {}
            proposed = {}
            for field in assignment._meta.concrete_fields:
                if field.name in {"user", "organization", "pharmacy", "role", "admin_level", "is_active"}:
                    value = changes.get(field.name, getattr(assignment, field.attname))
                    proposed[field.attname] = getattr(value, "pk", value)
            stored = type(assignment)._default_manager.using(assignment._state.db).filter(
                pk=assignment.pk,
            ).values(*proposed).first()
            scope = changes.get("pharmacy_ids", changes.get("pharmacies"))
            scope_added = scope is not None and bool(
                {getattr(item, "pk", item) for item in scope}
                - set(assignment.pharmacies.values_list("pk", flat=True))
            )
            if stored is not None and not scope_added and all(
                value == stored[name] or (name == "is_active" and not value)
                for name, value in proposed.items()
            ):
                return
        raise ValidationError("Explorer accounts cannot be admins.")


def validate_admin_user_for_api(user, *, assignment=None, changes=None):
    try:
        validate_admin_user(user, assignment=assignment, changes=changes)
    except ValidationError as exc:
        raise APIValidationError({"detail": exc.messages[0]}) from exc
