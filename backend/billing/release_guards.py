"""Release controls for new shift collection; historical payment reconciliation stays available."""
import os
import re

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from rest_framework.exceptions import APIException


class LiveCollectionRestricted(APIException):
    status_code = 503

    def __init__(self, code, message):
        super().__init__({"code": code, "detail": message})


def get_stripe_mode(secret_key=None):
    key = getattr(settings, "STRIPE_SECRET_KEY", "") if secret_key is None else secret_key
    match = re.fullmatch(r"(?:sk|rk)_(test|live)_[A-Za-z0-9]{8,}", key) if isinstance(key, str) else None
    return match.group(1) if match else "invalid"


def validate_provider_preflight():
    if os.environ.get("APP_ENV", "local").strip().lower() == "staging" and get_stripe_mode() == "live":
        raise ImproperlyConfigured("Staging must use Stripe test-mode credentials.")


def assert_can_create_shift_charge(charge_type):
    flags = {
        "fulfillment": "BILLING_LIVE_SHIFT_FULFILLMENT_ENABLED",
        "cancellation": "BILLING_LIVE_SHIFT_PENALTY_ENABLED",
    }
    if charge_type not in flags:
        raise LiveCollectionRestricted("collection_kind_invalid", "Unsupported shift collection operation.")
    mode = get_stripe_mode()
    if mode == "invalid":
        raise LiveCollectionRestricted("provider_configuration_invalid", "Shift collection is not configured.")
    if mode == "test":
        environment = os.environ.get("APP_ENV", "").strip().lower()
        if environment not in {"local", "dev", "development", "test", "staging"}:
            raise LiveCollectionRestricted(
                "test_provider_environment_rejected",
                "Test payments require an explicitly configured non-production environment.",
            )
        return
    if os.environ.get("APP_ENV", "local").strip().lower() == "staging":
        raise LiveCollectionRestricted("staging_live_provider_rejected", "Live payments are unavailable in staging.")
    if getattr(settings, flags[charge_type], False) is not True:
        raise LiveCollectionRestricted("live_collection_disabled", "This live shift payment feature is not enabled.")
