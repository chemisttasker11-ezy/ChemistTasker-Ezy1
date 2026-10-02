"""Shared user identity and presentation helpers for backend serializers."""


def _resolve_user_profile_photo(user):
    if not user:
        return None
    for attr in (
        "pharmacistonboarding",
        "otherstaffonboarding",
        "exploreronboarding",
        "owneronboarding",
    ):
        profile = getattr(user, attr, None)
        photo = getattr(profile, "profile_photo", None) if profile else None
        if photo:
            return photo
    return None


def _split_chat_display_name(value):
    parts = (value or "").strip().split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def _build_absolute_media_url(request, file_field):
    if not file_field:
        return None
    try:
        url = file_field.url
    except Exception:
        return None
    if request:
        try:
            return request.build_absolute_uri(url)
        except Exception:
            return url
    return url


def _chat_member_identity(user, request=None, membership=None):
    first_name = (getattr(user, "first_name", "") or "").strip() if user else ""
    last_name = (getattr(user, "last_name", "") or "").strip() if user else ""

    if not (first_name or last_name) and membership:
        first_name, last_name = _split_chat_display_name(getattr(membership, "invited_name", "") or "")

    if not (first_name or last_name) and user:
        fallback_name = (getattr(user, "get_full_name", lambda: "")() or getattr(user, "username", "") or "").strip()
        first_name, last_name = _split_chat_display_name(fallback_name)

    photo = _resolve_user_profile_photo(user)
    return {
        "id": getattr(user, "id", None),
        "first_name": first_name,
        "last_name": last_name,
        "email": getattr(user, "email", None),
        "profile_photo_url": _build_absolute_media_url(request, photo),
    }
