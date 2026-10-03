"""Backward-compatible chat identity facade.

Shared user presentation helpers are owned by `users.presentation`.
"""
from users.presentation import (
    _build_absolute_media_url,
    _chat_member_identity,
    _resolve_user_profile_photo,
    _split_chat_display_name,
)

__all__ = [
    "_build_absolute_media_url",
    "_chat_member_identity",
    "_resolve_user_profile_photo",
    "_split_chat_display_name",
]
