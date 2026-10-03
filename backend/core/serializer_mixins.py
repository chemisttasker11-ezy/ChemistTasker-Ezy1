"""Serializer mixins shared across backend domains."""
from rest_framework import serializers

from core.file_validation import validate_upload_mapping


class UploadValidationMixin:
    upload_validation_map = {}

    def validate(self, attrs):
        attrs = super().validate(attrs)
        return validate_upload_mapping(attrs, self.upload_validation_map)
