# client_profile/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import transaction
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from client_profile.models import Message
from django.utils.text import slugify
import logging
from client_profile.serializers import MessageSerializer
from client_profile.notifications import (
    broadcast_message_badge,
    notify_users,
    participant_can_receive_chat_updates,
)

from .models import (
    Membership,
    Conversation,
    Participant,
    Notification,
    OwnerOnboarding,
    PharmacistOnboarding,
    OtherStaffOnboarding,
    ExplorerOnboarding,
    PHARMACY_STAFF_EMPLOYMENT_TYPES,
)

log = logging.getLogger("client_profile.signals")

ROOM_GROUP_FMT = "room.{room_id}"
CHAT_ROUTE_BY_ROLE = {
    "OWNER": "/dashboard/owner/chat",
    "PHARMACIST": "/dashboard/pharmacist/chat",
    "OTHER_STAFF": "/dashboard/otherstaff/chat",
    "ORG_STAFF": "/dashboard/organization/chat",
    "ORG_ADMIN": "/dashboard/organization/chat",
    "ORG_OWNER": "/dashboard/organization/chat",
    "EXPLORER": "/dashboard/explorer/chat",
}

def _chat_action_url_for_user(user, conversation_id: int) -> str:
    role = (getattr(user, "role", "") or "").upper()
    base = CHAT_ROUTE_BY_ROLE.get(role, "/dashboard/owner/chat")
    return f"{base}?conversationId={conversation_id}"

def _user_initials(user):
    try:
        fn = (user.first_name or "").strip()[:1]
        ln = (user.last_name or "").strip()[:1]
        if not (fn or ln):
            # fallback: split full_name or username
            base = (getattr(user, "full_name", None) or user.get_username() or "").strip()
            parts = base.split()
            fn = (parts[0][:1] if parts else "") or "?"
            ln = (parts[1][:1] if len(parts) > 1 else "")
        return (fn + ln).upper() or "?"
    except Exception:
        return "?"

@receiver(post_save, sender=Message)
def broadcast_new_message(sender, instance, created, **kwargs):
    """
    Broadcast AFTER commit with fully-populated sender_details so the client
    can render name/avatar immediately (no extra fetch / no refresh needed).
    """
    if not created:
        return

    def _notify():
        try:
            layer = get_channel_layer()
            if not layer:
                log.warning("No channel layer configured; cannot broadcast message.created")
                return

            # Re-fetch with related user so the serializer can include user_details
            msg = (
                Message.objects
                .select_related("sender__user")
                .get(pk=instance.pk)
            )

            # 🔄 Build payload exactly like REST does
            payload = MessageSerializer(msg).data  # matches fields: id, conversation, sender{ id, user_details{...} }, body, attachment, attachment_url, created_at

            group_name = ROOM_GROUP_FMT.format(room_id=msg.conversation_id)
            async_to_sync(layer.group_send)(
                group_name,
                {
                    "type": "message.created",   # consumer.message_created
                    "message": payload,          # keep nested "message" as before
                },
            )
            sender_user = getattr(msg.sender, "user", None)
            sender_user_id = getattr(sender_user, "id", None)
            sender_name = (sender_user.get_full_name() or sender_user.email) if sender_user else ""
            body_preview = (msg.body or "").strip()
            if not body_preview:
                body_preview = "Sent an attachment." if msg.attachment else "New message."
            conversation_title = ""
            conversation = getattr(msg, "conversation", None)
            if conversation:
                if getattr(conversation, "pharmacy", None) and getattr(conversation.pharmacy, "name", ""):
                    conversation_title = conversation.pharmacy.name
                elif getattr(conversation, "title", ""):
                    conversation_title = conversation.title

            recipient_user_ids = set()
            for participant in Participant.objects.select_related("membership__user", "conversation").filter(conversation_id=msg.conversation_id):
                if not participant_can_receive_chat_updates(participant):
                    continue
                # Skip notifying the sender (membership or user) so they don't get self-badges
                if participant.membership_id == msg.sender_id:
                    continue
                if sender_user_id and getattr(participant.membership, "user_id", None) == sender_user_id:
                    continue
                broadcast_message_badge(participant, sender_user_id=sender_user_id)
                participant_user = getattr(participant.membership, "user", None)
                if participant_user and participant_user.is_active:
                    recipient_user_ids.add(participant_user.id)

            if recipient_user_ids:
                action_url = None
                if recipient_user_ids:
                    # Use any recipient user to resolve the correct chat route; all recipients share role-based routes.
                    sample_user = None
                    for participant in Participant.objects.select_related("membership__user").filter(conversation_id=msg.conversation_id):
                        participant_user = getattr(participant.membership, "user", None)
                        if participant_user and participant_user.id in recipient_user_ids:
                            sample_user = participant_user
                            break
                    if sample_user:
                        action_url = _chat_action_url_for_user(sample_user, msg.conversation_id)
                notify_users(
                    recipient_user_ids,
                    title=sender_name or "New message",
                    body=(body_preview or "New message.")[:200],
                    notification_type=Notification.Type.MESSAGE,
                    action_url=action_url,
                    payload={
                        "conversation_id": msg.conversation_id,
                        "roomId": msg.conversation_id,
                        "message_id": msg.id,
                        "sender_user_id": sender_user_id,
                        "sender_name": sender_name,
                        "conversation_title": conversation_title,
                    },
                )
        except Exception:
            log.exception("Error while broadcasting message.created")

    transaction.on_commit(_notify)


@receiver(post_save, sender=Membership)
def sync_membership_to_community_chat(sender, instance, created, **kwargs):
    if (
        instance.is_active
        and instance.status == Membership.Status.ACCEPTED
        and instance.pharmacy
        and instance.employment_type in PHARMACY_STAFF_EMPLOYMENT_TYPES
    ):
        community_chat, chat_created = Conversation.objects.get_or_create(
            pharmacy=instance.pharmacy,
            type=Conversation.Type.GROUP,
            defaults={
                'title': instance.pharmacy.name,
                'created_by': instance.invited_by or instance.user
            }
        )
        Participant.objects.get_or_create(
            conversation=community_chat,
            membership=instance
        )
    elif instance.pharmacy_id:
        Participant.objects.filter(
            conversation__type=Conversation.Type.GROUP,
            conversation__pharmacy_id=instance.pharmacy_id,
            membership=instance,
        ).delete()


def _award_verified_referrals_after_commit(instance):
    if not getattr(instance, "verified", False):
        return
    user_id = getattr(instance, "user_id", None)
    if not user_id:
        return

    def _award():
        try:
            from django.contrib.auth import get_user_model
            from client_profile.rewards import award_verified_referrals_for_user
            user = get_user_model().objects.get(id=user_id)
            award_verified_referrals_for_user(user)
        except Exception:
            log.exception("Failed to award verified referral pills for user %s", user_id)

    transaction.on_commit(_award)


@receiver(post_save, sender=OwnerOnboarding)
@receiver(post_save, sender=PharmacistOnboarding)
@receiver(post_save, sender=OtherStaffOnboarding)
@receiver(post_save, sender=ExplorerOnboarding)
def award_pill_referrals_when_onboarding_verified(sender, instance, **kwargs):
    _award_verified_referrals_after_commit(instance)
