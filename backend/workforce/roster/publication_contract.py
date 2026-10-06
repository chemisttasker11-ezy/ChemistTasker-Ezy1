"""Shared validation identity and conflicts for the existing publication command."""
import hashlib
import json

from django.core.exceptions import ValidationError


class RosterCommandConflict(ValidationError):
    """A reviewable domain conflict with a stable, structured HTTP representation."""
    def __init__(self, code, message, **details):
        self.payload = {"code": code, "message": message, **details}
        super().__init__(message, code=code)


def warning_key(item):
    # Acknowledgement covers the facts actually shown to the manager, not only
    # an assignment ID. Exclude our own derived key when normalizing a response.
    facts = {key: value for key, value in item.items() if key != "warning_key"}
    raw = json.dumps(facts, sort_keys=True, separators=(",", ":"), default=str).encode()
    return hashlib.sha256(raw).hexdigest()[:24]


def reviewed_validation(validation, acknowledged_warning_keys):
    if validation.get("errors"):
        raise RosterCommandConflict(
            "ROSTER_BLOCKING_ERRORS", "Resolve the blocking roster errors before publishing.",
            errors=validation["errors"],
        )
    warnings = [{**item, "warning_key": warning_key(item)} for item in validation.get("warnings", [])]
    missing = sorted({item["warning_key"] for item in warnings} - set(acknowledged_warning_keys))
    if missing:
        raise RosterCommandConflict(
            "ROSTER_WARNINGS_REQUIRE_ACKNOWLEDGEMENT", "Review and acknowledge each current warning.",
            missing_warning_keys=missing, warnings=warnings,
        )
    return {**validation, "warnings": warnings}
