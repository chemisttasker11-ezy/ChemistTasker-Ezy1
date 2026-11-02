"""Domain-neutral serializer input parsing."""
import json

from rest_framework import serializers


def json_list(value, name):
    if isinstance(value, str):
        try:
            value = json.loads(value or "[]")
        except ValueError:
            raise serializers.ValidationError(f"{name} must be a JSON list.")
    if not isinstance(value, list):
        raise serializers.ValidationError(f"{name} must be a list.")
    return value
