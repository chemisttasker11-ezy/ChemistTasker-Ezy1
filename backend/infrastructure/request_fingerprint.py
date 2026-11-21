"""Canonical request hashing shared by pharmacy and talent creation, independent of Django app ownership."""
import hashlib
import json

from django.core.files.uploadedfile import UploadedFile
from rest_framework.exceptions import ValidationError


def request_fingerprint(data, invalid_message='Expected an object of fields.'):
    fields, files = {}, {}
    if not isinstance(data, dict):
        raise ValidationError(invalid_message)
    items = data.lists() if hasattr(data, 'lists') else ((key, [value]) for key, value in data.items())
    for key, values in items:
        for value in values:
            if isinstance(value, UploadedFile):
                position = value.tell()
                digest = hashlib.sha256()
                try:
                    for chunk in value.chunks():
                        digest.update(chunk)
                finally:
                    value.seek(position)
                files.setdefault(key, []).append({
                    'name': value.name, 'size': value.size, 'sha256': digest.hexdigest(),
                })
            else:
                fields.setdefault(key, []).append(value)
    canonical = json.dumps({'fields': fields, 'files': files}, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()
