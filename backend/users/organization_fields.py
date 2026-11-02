"""Identity form fields whose querysets are owned by organization selectors."""
from rest_framework import serializers

from users.organization_port import organization_reads


class OrganizationPrimaryKeyField(serializers.PrimaryKeyRelatedField):
    def get_queryset(self):
        return organization_reads().all_organizations()


class PharmacyPrimaryKeyField(serializers.PrimaryKeyRelatedField):
    def get_queryset(self):
        return organization_reads().all_pharmacies()
