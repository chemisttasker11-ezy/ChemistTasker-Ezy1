"""pharmacy_hub: cohesive profiles serializers."""
from rest_framework import serializers
from organizations.models import Organization, Pharmacy
from django.db import transaction
from infrastructure.file_validation import IMAGE_UPLOAD_POLICY
from users.presentation import _build_absolute_media_url
from core.serializer_mixins import UploadValidationMixin


def _delete_profile_file_if_unreferenced(model, field_name, instance_pk, storage, name):
    if not name:
        return
    if model.objects.filter(**{field_name: name}).exclude(pk=instance_pk).exists():
        return
    try:
        storage.delete(name)
    except Exception:
        pass


class HubProfileFileCleanupMixin:
    file_fields = ("cover_image",)

    def update(self, instance, validated_data):
        cleanup = []
        for field_name in self.file_fields:
            if field_name not in validated_data:
                continue
            old_file = getattr(instance, field_name, None)
            old_name = getattr(old_file, "name", None)
            if not old_name:
                continue
            incoming_name = getattr(validated_data.get(field_name), "name", None)
            if incoming_name == old_name:
                continue
            cleanup.append(
                (
                    type(instance),
                    field_name,
                    instance.pk,
                    getattr(old_file, "storage", None),
                    old_name,
                )
            )

        response = super().update(instance, validated_data)
        for model, field_name, instance_pk, storage, name in cleanup:
            if not storage:
                continue
            transaction.on_commit(
                lambda model=model,
                field_name=field_name,
                instance_pk=instance_pk,
                storage=storage,
                name=name: _delete_profile_file_if_unreferenced(
                    model,
                    field_name,
                    instance_pk,
                    storage,
                    name,
                )
            )
        return response


class HubPharmacySerializer(serializers.ModelSerializer):
    cover_image = serializers.ImageField(read_only=True)
    cover_image_url = serializers.SerializerMethodField()
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    can_manage_profile = serializers.SerializerMethodField()
    can_create_group = serializers.SerializerMethodField()
    can_create_post = serializers.SerializerMethodField()

    class Meta:
        model = Pharmacy
        fields = [
            "id",
            "name",
            "about",
            "cover_image",
            "cover_image_url",
            "organization_id",
            "organization_name",
            "can_manage_profile",
            "can_create_group",
            "can_create_post",
        ]
        read_only_fields = fields

    def _permission_for(self, obj, key, default=False):
        perms = self.context.get("pharmacy_permissions", {})
        return perms.get(obj.id, {}).get(key, default)

    def get_cover_image_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), obj.cover_image)

    def get_can_manage_profile(self, obj):
        return self._permission_for(obj, "can_manage_profile")

    def get_can_create_group(self, obj):
        return self._permission_for(obj, "can_create_group")

    def get_can_create_post(self, obj):
        return self._permission_for(obj, "can_create_post", True)


class HubOrganizationSerializer(serializers.ModelSerializer):
    cover_image = serializers.ImageField(read_only=True)
    cover_image_url = serializers.SerializerMethodField()
    can_manage_profile = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    is_org_admin = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "about",
            "cover_image",
            "cover_image_url",
            "can_manage_profile",
            "is_org_admin",
            "member_count",
        ]
        read_only_fields = fields

    def get_cover_image_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), obj.cover_image)

    def get_can_manage_profile(self, obj):
        perms = self.context.get("organization_permissions", {})
        return perms.get(obj.id, {}).get("can_manage_profile", False)

    def get_member_count(self, obj):
        counts = self.context.get("organization_member_counts", {})
        return counts.get(obj.id, 0)

    def get_is_org_admin(self, obj):
        perms = self.context.get("organization_permissions", {})
        return perms.get(obj.id, {}).get("is_org_admin", False)


class HubPharmacyProfileSerializer(HubProfileFileCleanupMixin, UploadValidationMixin, serializers.ModelSerializer):
    upload_validation_map = {
        "cover_image": IMAGE_UPLOAD_POLICY,
    }

    class Meta:
        model = Pharmacy
        fields = ["about", "cover_image"]


class HubOrganizationProfileSerializer(HubProfileFileCleanupMixin, UploadValidationMixin, serializers.ModelSerializer):
    upload_validation_map = {
        "cover_image": IMAGE_UPLOAD_POLICY,
    }

    class Meta:
        model = Organization
        fields = ["about", "cover_image"]
