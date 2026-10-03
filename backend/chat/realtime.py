"""Chat realtime helpers: unread-message badges, read receipts and who may receive chat updates."""
from typing import Optional
from memberships.models import Membership, PHARMACY_STAFF_EMPLOYMENT_TYPES
from chat.models import Message, Participant
from notifications.services import _broadcast

ROOM_GROUP_FMT = "room.{room_id}"   # channel-layer group of one chat room


def broadcast_message_badge(
    participant: Participant,
    sender_membership_id: Optional[int] = None,
    sender_user_id: Optional[int] = None,
) -> None:
    if not participant_can_receive_chat_updates(participant):
        return
    # Skip notifying the sender (by membership or user id) if provided
    if sender_membership_id and participant.membership_id == sender_membership_id:
        return
    if sender_user_id and getattr(participant.membership, "user_id", None) == sender_user_id:
        return
    user = getattr(participant.membership, "user", None)
    if not user or not user.is_active:
        return
    unread = _calculate_unread_messages(participant)
    latest = (
        Message.objects
        .filter(conversation_id=participant.conversation_id)
        .select_related("sender__user")
        .order_by("-created_at")
        .first()
    )
    sender_name = ""
    body_preview = ""
    if latest:
        sender_user = getattr(latest.sender, "user", None)
        if sender_user:
            sender_name = sender_user.get_full_name() or sender_user.email or ""
        body_preview = (latest.body or "").strip()
    conversation_title = getattr(participant.conversation, "title", "") if hasattr(participant, "conversation") else ""
    _broadcast(user.id, "message.badge", {
        "conversation_id": participant.conversation_id,
        "unread": unread,
        "sender_name": sender_name,
        "body_preview": body_preview[:160] if body_preview else "",
        "conversation_title": conversation_title or "",
    })


def broadcast_message_read(participant: Participant) -> None:
    user = getattr(participant.membership, "user", None)
    if not user or not user.is_active:
        return
    _broadcast(user.id, "message.read", {"conversation_id": participant.conversation_id})
    unread = _calculate_unread_messages(participant)
    _broadcast(user.id, "message.badge", {"conversation_id": participant.conversation_id, "unread": unread})


def _calculate_unread_messages(participant: Participant) -> int:
    qs = Message.objects.filter(conversation_id=participant.conversation_id).exclude(sender=participant.membership)
    if participant.last_read_at:
        qs = qs.filter(created_at__gt=participant.last_read_at)
    return qs.count()


def participant_can_receive_chat_updates(participant: Participant) -> bool:
    """
    Keep realtime/push chat delivery aligned with ConversationViewSet visibility.
    Favorite locum memberships are intentionally not members of pharmacy community
    chats, even if a legacy Participant row exists.
    """
    membership = getattr(participant, "membership", None)
    conversation = getattr(participant, "conversation", None)
    if not membership or not conversation:
        return False
    if (
        getattr(conversation, "type", None) == "GROUP"
        and getattr(conversation, "pharmacy_id", None)
    ):
        return (
            getattr(membership, "is_active", False)
            and getattr(membership, "status", None) == Membership.Status.ACCEPTED
            and getattr(membership, "pharmacy_id", None) == conversation.pharmacy_id
            and getattr(membership, "employment_type", None) in PHARMACY_STAFF_EMPLOYMENT_TYPES
        )
    return True
