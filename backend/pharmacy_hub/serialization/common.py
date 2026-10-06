"""pharmacy_hub: cohesive common serializers."""
from rest_framework import serializers
from memberships.models import Membership
from onboarding.models import OtherStaffOnboarding
from pharmacy_hub.models import PharmacyHubReaction
from users.presentation import _build_absolute_media_url, _chat_member_identity, _resolve_user_profile_photo


def _serialize_user_summary(user, request):
    if not user:
        return None
    photo = _resolve_user_profile_photo(user)
    return {
        "id": user.id,
        "username": getattr(user, "username", None),
        "first_name": getattr(user, "first_name", None),
        "last_name": getattr(user, "last_name", None),
        "profile_photo_url": _build_absolute_media_url(request, photo),
    }


def _serialize_hub_author(membership, user, request):
    def _display_role(target_user):
        if not target_user:
            return ""
        top_role = (getattr(target_user, "role", "") or "").upper()
        if top_role == "OWNER":
            return "Owner"
        if top_role == "PHARMACIST":
            return "Pharmacist"
        if top_role == "OTHER_STAFF":
            role_type = (
                OtherStaffOnboarding.objects.filter(user=target_user)
                .values_list("role_type", flat=True)
                .first()
            )
            if (role_type or "").upper() == "INTERN":
                return "Intern"
            return "Staff"
        if top_role == "ORG_STAFF":
            return "Staff"
        if top_role == "EXPLORER":
            return "Explorer"
        return ""

    target_user = user or getattr(membership, "user", None)
    summary = _serialize_user_summary(target_user, request)
    if membership:
        return {
            "id": membership.id,
            "role": _display_role(target_user),
            "employment_type": getattr(membership, "employment_type", "") or "",
            "job_title": getattr(membership, "job_title", "") or "",
            "user_details": summary,
        }
    if not summary:
        return None
    return {
        "id": 0,
        "role": _display_role(target_user),
        "employment_type": "",
        "job_title": "",
        "user_details": summary,
    }


class HubMembershipSerializer(serializers.ModelSerializer):
    user_details = serializers.SerializerMethodField()

    class Meta:
        model = Membership
        fields = ["id", "role", "employment_type", "job_title", "user_details"]
        read_only_fields = fields

    def get_user_details(self, obj):
        identity = _chat_member_identity(
            getattr(obj, "user", None),
            self.context.get("request"),
            obj,
        )
        return {key: value for key, value in identity.items() if key != "email"} if identity else identity


class HubReactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PharmacyHubReaction
        fields = ["reaction_type"]
        # the model default (LIKE) is for stored rows; a reaction request must say which reaction it is
        extra_kwargs = {"reaction_type": {"required": True}}
