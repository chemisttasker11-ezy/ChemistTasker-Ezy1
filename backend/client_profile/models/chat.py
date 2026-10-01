"""client_profile models: chat (split verbatim from client_profile/models.py)."""
from django.db import models
from django.conf import settings
from client_profile.models.common import _unique_upload_path
from client_profile.models.memberships import Membership


class Conversation(models.Model):
    class Type(models.TextChoices):
        GROUP = "GROUP", "Group"
        DM = "DM", "Direct"

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_conversations'
    )
    type = models.CharField(max_length=8, choices=Type.choices, default=Type.GROUP)
    title = models.CharField(max_length=255, blank=True)
    dm_key = models.CharField(max_length=63, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    pinned_message = models.ForeignKey(
        'Message',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+' # No reverse relation needed
    )

    # 👇 THIS IS THE MISSING FIELD TO ADD
    # This links a conversation to a pharmacy, identifying it as a "community" chat.
    pharmacy = models.ForeignKey(
        'client_profile.Pharmacy',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='group_conversations'
    )

    class Meta:
        indexes = [
            models.Index(fields=['created_by', 'updated_at']),
            models.Index(fields=['updated_at']),
            models.Index(fields=['pharmacy']),
            models.Index(fields=['dm_key']),
        ]
        constraints = [
            # This rule prevents duplicate community chats for the same pharmacy.
            models.UniqueConstraint(
                fields=['pharmacy'],
                name='uniq_community_chat_per_pharmacy',
                condition=models.Q(pharmacy__isnull=False)
            ),
            models.UniqueConstraint(fields=['dm_key'],
                                    name='uniq_dm_per_user_pair',
                                    condition=~models.Q(dm_key="")),
        ]

    def __str__(self):
        return self.title or f"Conversation {self.id}"


class Participant(models.Model):
    conversation = models.ForeignKey('client_profile.Conversation',
                                     on_delete=models.CASCADE,
                                     related_name='participants')
    membership = models.ForeignKey(Membership, on_delete=models.SET_NULL, null=True, blank=True, related_name='chat_participations')
    is_admin = models.BooleanField(default=False)
    joined_at = models.DateTimeField(auto_now_add=True)
    last_read_at = models.DateTimeField(null=True, blank=True)

    # FIX: Add is_pinned field to track pinning on a per-user basis.
    is_pinned = models.BooleanField(default=False)
    # Per-user pinned message (replaces global conversation.pinned_message for user-specific pins)
    pinned_message = models.ForeignKey(
        'client_profile.Message',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pinned_by_participants'
    )

    class Meta:
        unique_together = [('conversation', 'membership')]
        indexes = [
            models.Index(fields=['conversation']),
            models.Index(fields=['membership']),
        ]

    def __str__(self):
        return f"Participant m#{self.membership_id} in c#{self.conversation_id}"


def chat_upload_path(instance, filename):
    conversation_id = instance.conversation_id or "new"
    return _unique_upload_path(f"chat/{conversation_id}", filename)


class Message(models.Model):
    """
    A message in a conversation.
    Attachments use your existing MEDIA storage config.
    """
    conversation = models.ForeignKey('client_profile.Conversation',
                                     on_delete=models.CASCADE,
                                     related_name='messages')
    sender = models.ForeignKey('client_profile.Membership',
                               on_delete=models.CASCADE,
                               related_name='sent_messages')
    body = models.TextField(blank=True)
    attachment = models.FileField(upload_to=chat_upload_path, null=True, blank=True)
    attachment_filename = models.CharField(max_length=255, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    is_deleted = models.BooleanField(default=False)
    is_edited = models.BooleanField(default=False)
    original_body = models.TextField(blank=True, null=True, help_text="Stores the original message body before an edit.")

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['conversation', 'created_at']),
            models.Index(fields=['sender']),
            models.Index(fields=['conversation', 'id']),
        ]

    def __str__(self):
        return f"Msg#{self.id} by m#{self.sender_id} in c#{self.conversation_id}"


class MessageReaction(models.Model):
    REACTION_CHOICES = [
        ('👍', 'Thumbs Up'),
        ('❤️', 'Heart'),
        ('🔥', 'Fire'),
        ('💩', 'Poop'),
    ]

    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='reactions')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='message_reactions')
    reaction = models.CharField(max_length=4, choices=REACTION_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Ensures a user can only give one type of reaction per message
        unique_together = ('message', 'user', 'reaction')
        ordering = ['created_at']

    def __str__(self):
        return f"{self.user} reacted with {self.reaction} to message {self.message.id}"


# --- Helper for DM key -------------------------------------------------------
def make_dm_key(user_id_a: int, user_id_b: int) -> str:
    """
    Deterministic pair key so the same two users map to the same DM room.
    e.g., make_dm_key(45, 12) -> '12:45'
    """
    a, b = sorted([int(user_id_a), int(user_id_b)])
    return f"{a}:{b}"
