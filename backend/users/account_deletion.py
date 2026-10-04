"""Deleting an account: anonymising the user, revoking sessions and tokens and removing identity
documents.

Logs go to the historical "users.views" channel that operators filter on."""
import logging
from django.utils import timezone
from django.contrib.sessions.models import Session
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken


def _delete_verification_docs_for_user(user):
    from onboarding.models import ExplorerOnboarding, OtherStaffOnboarding, OwnerOnboarding, PharmacistOnboarding

    onboarding_configs = [
        (PharmacistOnboarding, ["government_id", "identity_secondary_file"]),
        (OtherStaffOnboarding, ["government_id", "identity_secondary_file"]),
        (ExplorerOnboarding, ["government_id", "identity_secondary_file"]),
        (OwnerOnboarding, ["government_id", "identity_secondary_file"]),
    ]

    for model, file_fields in onboarding_configs:
        instance = model.objects.filter(user=user).first()
        if not instance:
            continue
        updated_fields = []
        for field_name in file_fields:
            file_field = getattr(instance, field_name, None)
            if file_field:
                try:
                    file_field.delete(save=False)
                except Exception:
                    logging.getLogger("users.views").exception(
                        "Failed deleting verification file %s for user %s", field_name, user.id
                    )
                setattr(instance, field_name, None)
                updated_fields.append(field_name)

        if hasattr(instance, "government_id_type"):
            instance.government_id_type = None
            updated_fields.append("government_id_type")
        if hasattr(instance, "identity_meta"):
            instance.identity_meta = {}
            updated_fields.append("identity_meta")

        if updated_fields:
            instance.save(update_fields=sorted(set(updated_fields)))


def _revoke_user_sessions(user):
    try:
        active_sessions = Session.objects.filter(expire_date__gte=timezone.now())
        for session in active_sessions:
            data = session.get_decoded()
            if str(data.get("_auth_user_id")) == str(user.id):
                session.delete()
    except Exception:
        logging.getLogger("users.views").exception("Failed to revoke Django sessions for user %s", user.id)


def _revoke_user_tokens(user):
    try:
        for token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=token)
    except Exception:
        logging.getLogger("users.views").exception("Failed to revoke JWT tokens for user %s", user.id)


def _anonymize_user(user):
    original_email = (user.email or "").strip()
    update_fields = ["is_active", "deleted_at"]

    user.is_active = False
    user.deleted_at = timezone.now()
    user.set_unusable_password()
    update_fields.append("password")

    if original_email:
        user.email = f"deleted+{user.id}@chemisttasker.invalid"
        update_fields.append("email")

    user.username = None
    user.first_name = ""
    user.last_name = ""
    update_fields.extend(["username", "first_name", "last_name"])

    user.mobile_number = None
    user.mobile_otp_code = None
    user.mobile_otp_created_at = None
    user.is_mobile_verified = False
    update_fields.extend(
        ["mobile_number", "mobile_otp_code", "mobile_otp_created_at", "is_mobile_verified"]
    )

    user.save(update_fields=sorted(set(update_fields)))
    return original_email
