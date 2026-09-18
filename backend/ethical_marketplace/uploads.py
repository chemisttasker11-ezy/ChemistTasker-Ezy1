from pathlib import Path

from rest_framework.exceptions import ValidationError


_ALLOWED_PRIVATE_DOCUMENTS = {
    '.pdf': {
        'types': {'application/pdf', 'application/octet-stream'},
        'signatures': (b'%PDF-',),
    },
    '.png': {
        'types': {'image/png', 'application/octet-stream'},
        'signatures': (b'\x89PNG\r\n\x1a\n',),
    },
    '.jpg': {
        'types': {'image/jpeg', 'application/octet-stream'},
        'signatures': (b'\xff\xd8\xff',),
    },
    '.jpeg': {
        'types': {'image/jpeg', 'application/octet-stream'},
        'signatures': (b'\xff\xd8\xff',),
    },
    '.docx': {
        'types': {
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/zip',
            'application/octet-stream',
        },
        'signatures': (b'PK\x03\x04',),
    },
}


def validate_private_transfer_document(upload, *, max_bytes=5 * 1024 * 1024):
    if not upload:
        raise ValidationError({'file': 'A document is required.'})
    if upload.size > max_bytes:
        raise ValidationError({'file': 'Document must be 5 MB or smaller.'})

    suffix = Path(upload.name or '').suffix.lower()
    policy = _ALLOWED_PRIVATE_DOCUMENTS.get(suffix)
    if not policy:
        raise ValidationError({'file': 'Use PDF, PNG, JPEG, or DOCX documents only.'})

    content_type = (getattr(upload, 'content_type', '') or '').lower()
    if content_type and content_type not in policy['types']:
        raise ValidationError({'file': 'The document type does not match its filename.'})

    header = upload.read(16)
    upload.seek(0)
    if not any(header.startswith(signature) for signature in policy['signatures']):
        raise ValidationError({'file': 'The document contents do not match the declared file type.'})

    return upload
