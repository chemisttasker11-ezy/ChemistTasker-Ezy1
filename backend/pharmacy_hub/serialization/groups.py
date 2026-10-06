"""pharmacy_hub: cohesive groups serializers."""
from rest_framework import serializers
from memberships.models import Membership, PHARMACY_STAFF_EMPLOYMENT_TYPES
from pharmacy_hub.models import PharmacyCommunityGroup, PharmacyCommunityGroupMembership
from django.db import transaction
from .common import HubMembershipSerializer


class PharmacyCommunityGroupMemberSerializer(serializers.ModelSerializer):
    membership_id = serializers.IntegerField(read_only=True)
    member = HubMembershipSerializer(source="membership", read_only=True)
    pharmacy_id = serializers.IntegerField(source="membership.pharmacy_id", read_only=True)
    pharmacy_name = serializers.CharField(
        source="membership.pharmacy.name", read_only=True
    )
    job_title = serializers.CharField(
        source="membership.job_title", read_only=True, allow_blank=True
    )

    class Meta:
        model = PharmacyCommunityGroupMembership
        fields = [
            "membership_id",
            "member",
            "is_admin",
            "joined_at",
            "pharmacy_id",
            "pharmacy_name",
            "job_title",
        ]
        read_only_fields = [
            "membership_id",
            "member",
            "joined_at",
            "pharmacy_id",
            "pharmacy_name",
            "job_title",
        ]


class HubCommunityGroupSerializer(serializers.ModelSerializer):
    members = serializers.SerializerMethodField()
    member_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    member_count = serializers.SerializerMethodField()
    is_admin = serializers.SerializerMethodField()
    is_member = serializers.SerializerMethodField()
    pharmacy_name = serializers.CharField(source="pharmacy.name", read_only=True)
    organization_id = serializers.IntegerField(
        source="pharmacy.organization_id", read_only=True
    )
    is_creator = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyCommunityGroup
        fields = [
            "id",
            "pharmacy",
            "pharmacy_name",
            "organization_id",
            "name",
            "description",
            "created_at",
            "updated_at",
            "members",
            "member_ids",
            "member_count",
            "is_admin",
            "is_member",
            "is_creator",
        ]
        read_only_fields = [
            "id",
            "pharmacy",
            "pharmacy_name",
            "organization_id",
            "created_at",
            "updated_at",
            "members",
            "member_count",
            "is_admin",
            "is_member",
            "is_creator",
        ]

    def _resolve_memberships(self, pharmacy, member_ids):
        if not member_ids:
            return []
        allowed_pharmacy_ids = set(
            self.context.get("allowed_pharmacy_ids") or []
        )
        if pharmacy:
            allowed_pharmacy_ids.add(pharmacy.id)
        memberships_qs = Membership.objects.filter(
            id__in=member_ids,
            is_active=True,
            employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
        )
        if allowed_pharmacy_ids:
            memberships_qs = memberships_qs.filter(
                pharmacy_id__in=allowed_pharmacy_ids
            )
        memberships = list(memberships_qs)
        found_ids = {m.id for m in memberships}
        missing = sorted(set(member_ids) - found_ids)
        if missing:
            raise serializers.ValidationError(
                {
                    "member_ids": (
                        "Invalid membership IDs for manageable pharmacies: "
                        f"{missing}"
                    )
                }
            )
        return memberships

    def _ensure_creator_membership(self, pharmacy):
        request_membership = self.context.get("request_membership")
        if request_membership and request_membership.pharmacy_id == pharmacy.id:
            return request_membership
        user = self.context["request"].user if "request" in self.context else None
        if not user:
            return None
        return (
            Membership.objects.filter(
                user=user,
                pharmacy=pharmacy,
                is_active=True,
                employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
            )
            .order_by("id")
            .first()
        )

    def create(self, validated_data):
        member_ids = set(validated_data.pop("member_ids", []) or [])
        pharmacy = validated_data["pharmacy"]
        creator_membership = self._ensure_creator_membership(pharmacy)
        if creator_membership:
            member_ids.add(creator_membership.id)
        memberships = self._resolve_memberships(pharmacy, member_ids)
        with transaction.atomic():
            group = PharmacyCommunityGroup.objects.create(**validated_data)
            bulk_links = [
                PharmacyCommunityGroupMembership(
                    group=group,
                    membership=membership,
                    is_admin=(membership == creator_membership),
                )
                for membership in memberships
            ]
            PharmacyCommunityGroupMembership.objects.bulk_create(bulk_links)
        return group

    def update(self, instance, validated_data):
        membership_ids = validated_data.pop("member_ids", None)
        memberships = None
        if membership_ids is not None:
            membership_ids = set(membership_ids)
            memberships = self._resolve_memberships(instance.pharmacy, membership_ids)

        with transaction.atomic():
            locked_instance = PharmacyCommunityGroup.objects.select_for_update().get(
                pk=instance.pk
            )
            self.instance = locked_instance
            response = super().update(locked_instance, validated_data)
            if memberships is not None:
                desired_ids = {membership.id for membership in memberships}
                existing_links = {
                    link.membership_id: link
                    for link in PharmacyCommunityGroupMembership.objects.select_for_update().filter(
                        group=locked_instance
                    )
                }
                new_links = []
                for membership in memberships:
                    if membership.id in existing_links:
                        continue
                    new_links.append(
                        PharmacyCommunityGroupMembership(
                            group=instance,
                            membership=membership,
                        )
                    )
                if new_links:
                    PharmacyCommunityGroupMembership.objects.bulk_create(new_links)
                to_remove = set(existing_links.keys()) - desired_ids
                if to_remove:
                    PharmacyCommunityGroupMembership.objects.filter(
                        group=locked_instance, membership_id__in=to_remove
                    ).delete()
        return response

    def get_member_count(self, obj):
        return getattr(
            obj,
            "staff_member_count",
            obj.memberships.filter(
                membership__is_active=True,
                membership__employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
            ).count(),
        )

    def get_members(self, obj):
        links = getattr(obj, "_prefetched_objects_cache", {}).get("staff_memberships")
        if links is None:
            links = obj.memberships.filter(
                membership__is_active=True,
                membership__employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
            ).select_related("membership", "membership__user", "membership__pharmacy")
        serializer = PharmacyCommunityGroupMemberSerializer(
            links,
            many=True,
            context=self.context,
        )
        return serializer.data

    def get_is_admin(self, obj):
        admin_map = self.context.get("group_admin_map", {})
        return admin_map.get(obj.id, False)

    def get_is_member(self, obj):
        member_map = self.context.get("group_member_map", {})
        return member_map.get(obj.id, False)

    def get_is_creator(self, obj):
        request = self.context.get("request")
        if request and getattr(request, "user", None):
            return obj.created_by_id == request.user.id
        return False

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not self.context.get("include_members", True):
            data.pop("members", None)
        return data
