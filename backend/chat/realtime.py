"""Chat realtime helpers: unread-message badges, read receipts and who may receive chat updates."""
from typing import Optional
from django.db.models import Q
from chat.models import Conversation
from memberships.models import Membership, PHARMACY_STAFF_EMPLOYMENT_TYPES
from chat.models import Message, Participant
from notifications.services import _broadcast

ROOM_GROUP_FMT = "room.{room_id}"   # channel-layer group of one chat room
USER_GROUP_FMT = "chat.user.{user_id}"


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
    if not participant_can_receive_chat_updates(participant):
        return
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
    user = getattr(membership, "user", None)
    if not membership or not conversation or not user or not user.is_active:
        return False
    if membership.status != Membership.Status.ACCEPTED:
        return False
    if conversation.type == Conversation.Type.DM and membership.role == "CONTACT":
        # External contacts have intentionally inactive CONTACT memberships,
        # not the same as a revoked pharmacy staff membership.
        return True
    if not membership.is_active:
        return False
    if conversation.type == Conversation.Type.GROUP and conversation.pharmacy_id:
        return (
            membership.pharmacy_id == conversation.pharmacy_id
            and membership.employment_type in PHARMACY_STAFF_EMPLOYMENT_TYPES
        )
    return True


def accessible_conversations_queryset(user):
    """REST visibility and WS membership must agree after role revocation.

    Preserve DM-only inactive CONTACT users, but never grant a revoked
    pharmacy staff membership access to community, custom or direct rooms.
    """
    if not user or not getattr(user, "is_authenticated", False) or not user.is_active:
        return Conversation.objects.none()
    active = Membership.objects.filter(
        user=user, is_active=True, status=Membership.Status.ACCEPTED,
    )
    active_participants = Participant.objects.filter(
        membership__in=active,
    ).values_list("conversation_id", flat=True)
    contacts = Participant.objects.filter(
        membership__user=user,
        membership__role="CONTACT",
        membership__status=Membership.Status.ACCEPTED,
        conversation__type=Conversation.Type.DM,
    ).values_list("conversation_id", flat=True)
    staff_pharmacies = active.filter(
        employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
    ).values_list("pharmacy_id", flat=True)
    return Conversation.objects.filter(
        Q(pk__in=active_participants, pharmacy__isnull=True)
        | Q(pk__in=contacts, type=Conversation.Type.DM)
        | Q(type=Conversation.Type.GROUP, pharmacy_id__in=staff_pharmacies)
    ).distinct()
