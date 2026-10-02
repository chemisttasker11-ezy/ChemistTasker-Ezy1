import os
import zipfile
from dataclasses import dataclass

from rest_framework.exceptions import ValidationError


@dataclass(frozen=True)
class UploadPolicy:
    label: str
    allowed_extensions: tuple[str, ...]
    allowed_content_types: tuple[str, ...]
    max_size_bytes: int


IMAGE_UPLOAD_POLICY = UploadPolicy(
    label="image",
    allowed_extensions=("jpg", "jpeg", "png", "webp", "gif"),
    allowed_content_types=("image/jpeg", "image/png", "image/webp", "image/gif"),
    max_size_bytes=10 * 1024 * 1024,
)

DOCUMENT_UPLOAD_POLICY = UploadPolicy(
    label="document",
    allowed_extensions=("pdf", "docx", "jpg", "jpeg", "png"),
    allowed_content_types=(
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/jpeg",
        "image/png",
    ),
    max_size_bytes=10 * 1024 * 1024,
)

ATTACHMENT_UPLOAD_POLICY = UploadPolicy(
    label="attachment",
    allowed_extensions=("pdf", "docx", "jpg", "jpeg", "png", "webp", "gif"),
    allowed_content_types=(
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
    ),
    max_size_bytes=15 * 1024 * 1024,
)


def _read_head(uploaded_file, size: int = 8192) -> bytes:
    pos = uploaded_file.tell() if hasattr(uploaded_file, "tell") else None
    try:
        head = uploaded_file.read(size)
    finally:
        if pos is not None and hasattr(uploaded_file, "seek"):
            uploaded_file.seek(pos)
    return head or b""


def _sniff_kind(uploaded_file) -> str | None:
    head = _read_head(uploaded_file)
    if not head:
        return None
    if head.startswith(b"%PDF-"):
        return "application/pdf"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if head.startswith(b"RIFF") and head[8:12] == b"WEBP":
        return "image/webp"

    name = (getattr(uploaded_file, "name", "") or "").lower()
    if name.endswith(".docx"):
        pos = uploaded_file.tell() if hasattr(uploaded_file, "tell") else None
        try:
            with zipfile.ZipFile(uploaded_file) as archive:
                names = set(archive.namelist())
                if "[Content_Types].xml" in names and any(
                    member.startswith("word/") for member in names
                ):
                    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        except Exception:
            return None
        finally:
            if pos is not None and hasattr(uploaded_file, "seek"):
                uploaded_file.seek(pos)
    return None


def validate_uploaded_file(uploaded_file, policy: UploadPolicy, field_label: str | None = None) -> None:
    if not uploaded_file:
        return

    label = field_label or policy.label
    file_name = getattr(uploaded_file, "name", "") or ""
    extension = os.path.splitext(file_name)[1].lower().lstrip(".")
    if extension not in policy.allowed_extensions:
        allowed = ", ".join(f".{ext}" for ext in policy.allowed_extensions)
        raise ValidationError(f"{label} must be one of: {allowed}.")

    size = getattr(uploaded_file, "size", None)
    if size is not None and size > policy.max_size_bytes:
        max_mb = int(policy.max_size_bytes / (1024 * 1024))
        raise ValidationError(f"{label} must be {max_mb} MB or smaller.")

    sniffed_type = _sniff_kind(uploaded_file)
    content_type = getattr(uploaded_file, "content_type", None)
    effective_type = sniffed_type or content_type
    if effective_type not in policy.allowed_content_types:
        raise ValidationError(f"{label} type is not allowed.")


def validate_upload_mapping(attrs: dict, field_policies: dict[str, UploadPolicy]) -> dict:
    for field_name, policy in field_policies.items():
        uploaded_file = attrs.get(field_name)
        if uploaded_file:
            validate_uploaded_file(uploaded_file, policy, field_name.replace("_", " "))
    return attrs
