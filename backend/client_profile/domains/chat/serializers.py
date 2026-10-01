from django.contrib.auth import get_user_model

User = get_user_model()


"""Moved verbatim from client_profile/serializers.py (Stage 2 domain split). Behaviour is unchanged; client_profile/serializers.py re-exports these names."""
from rest_framework import serializers
from client_profile.models import Conversation, Membership, Message, MessageReaction, Participant
# Shared helpers that still live in the legacy module until their own domain is extracted:
from client_profile.serializers import _chat_member_identity


# --- Chat Serializers --------------------------------------------------------
class ChatMemberSerializer(serializers.ModelSerializer):
    profile_photo_url = serializers.SerializerMethodField()
    first_name = serializers.SerializerMethodField()
    last_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "first_name", "last_name", "email", "profile_photo_url"]

    def _identity(self, obj):
        return _chat_member_identity(obj, self.context.get("request"), self.context.get("membership"))

    def get_first_name(self, obj):
        return self._identity(obj)["first_name"]

    def get_last_name(self, obj):
        return self._identity(obj)["last_name"]

    def get_profile_photo_url(self, obj):
        return self._identity(obj)["profile_photo_url"]


class ChatMembershipSerializer(serializers.ModelSerializer):
    user_details = serializers.SerializerMethodField()

    class Meta:
        model = Membership
        fields = ["id", "user_details"]

    def get_user_details(self, obj):
        return _chat_member_identity(
            getattr(obj, "user", None),
            self.context.get("request"),
            obj,
        )


class ReactionSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source='user.id')
    class Meta:
        model = MessageReaction
        fields = ['reaction', 'user_id']


class MessageSerializer(serializers.ModelSerializer):
    sender = ChatMembershipSerializer(read_only=True)
    attachment_url = serializers.SerializerMethodField()
    reactions = ReactionSerializer(many=True, read_only=True)
    attachment_filename = serializers.SerializerMethodField()
    is_pinned = serializers.SerializerMethodField()
    class Meta:
        model = Message
        fields = [
            "id", "conversation", "sender", "body", "attachment", "attachment_url",
            "attachment_filename", "created_at", "is_deleted", "is_edited",
            "original_body", "reactions",  "is_pinned",
        ]
        read_only_fields = fields
    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.is_deleted:
            data["body"] = ""
            data["original_body"] = None
            data["attachment"] = None
            data["attachment_url"] = None
            data["attachment_filename"] = None
        return data
    def get_attachment_url(self, obj):
        try:
            return obj.attachment.url if obj.attachment else None
        except Exception:
            return None
 
    def get_attachment_filename(self, obj):
        if obj.attachment and hasattr(obj.attachment, 'name'):
            import os
            return os.path.basename(obj.attachment.name)
        return None
 
    def get_is_pinned(self, obj):
        request = self.context.get("request")
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            part = Participant.objects.filter(conversation=obj.conversation, membership__user=request.user).first()
            if part and part.pinned_message_id:
                return part.pinned_message_id == obj.id
        # Fallback to legacy conversation-level pin if present
        return obj.conversation.pinned_message_id == obj.id


class ConversationListSerializer(serializers.ModelSerializer):
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    participant_ids = serializers.SerializerMethodField()
    my_last_read_at = serializers.SerializerMethodField()
    title = serializers.SerializerMethodField()
    my_membership_id = serializers.SerializerMethodField()
    is_pinned = serializers.SerializerMethodField()
    pinned_message = serializers.SerializerMethodField()
    created_by_user_id = serializers.IntegerField(source='created_by_id', read_only=True)
    my_is_admin = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id", "created_by", "type", "title","pharmacy","updated_at", "last_message",
            "unread_count", "participant_ids", "my_last_read_at", "my_membership_id",
            "is_pinned", "pinned_message", "created_by_user_id",
            "my_is_admin", "can_manage", "can_delete",

        ]

    def get_title(self, obj: Conversation) -> str:
            # --- START OF FIX ---
            # Prioritize the pharmacy link to guarantee the correct name for community chats.
        if hasattr(obj, 'pharmacy') and obj.pharmacy:
            return obj.pharmacy.name
        
        # Fallback for DMs and custom groups that use the title field.
        if obj.type == Conversation.Type.DM:
            request = self.context.get("request")
            if request and hasattr(request, 'user'):
                # This correctly finds the other user's name for DMs
                other_participant = obj.participants.exclude(membership__user=request.user).first()
                if other_participant and getattr(other_participant, "membership", None):
                    partner_user = getattr(other_participant.membership, "user", None)
                    if partner_user:
                        return partner_user.get_full_name() or partner_user.email
        
        # If it's a custom group or a DM where the partner can't be found, use the stored title.
        if obj.title:
            return obj.title
            
            # Final fallback.
            return "Group Chat"

    def _get_my_participant(self, obj):
        request = self.context.get("request")
        if not request or not hasattr(request, 'user') or not request.user.is_authenticated:
            return None
        if not hasattr(self, '_participant_cache'):
            self._participant_cache = {}
        cache_key = (request.user.id, obj.id)
        if cache_key not in self._participant_cache:
            self._participant_cache[cache_key] = Participant.objects.filter(conversation=obj, membership__user=request.user).first()
        return self._participant_cache[cache_key]
    
    def get_is_pinned(self, obj):
        my_part = self._get_my_participant(obj)
        return my_part.is_pinned if my_part else False

    def get_my_membership_id(self, obj):
        my_part = self._get_my_participant(obj)
        return my_part.membership_id if my_part else None

    def get_my_last_read_at(self, obj):
        my_part = self._get_my_participant(obj)
        return my_part.last_read_at.isoformat() if my_part and my_part.last_read_at else None

    def get_last_message(self, obj):
        msg = obj.messages.order_by("-created_at").first()
        if not msg: return None
        return {"id": msg.id, "body": msg.body[:200], "created_at": msg.created_at.isoformat(), "sender": msg.sender_id}

    def get_pinned_message(self, obj):
        request = self.context.get("request")
        if not request or not getattr(request, "user", None) or not request.user.is_authenticated:
            # fallback to legacy conversation-level pinned message
            pm = obj.pinned_message
            return MessageSerializer(pm, context=self.context).data if pm else None
        part = Participant.objects.filter(conversation=obj, membership__user=request.user).first()
        if part and part.pinned_message:
            return MessageSerializer(part.pinned_message, context=self.context).data
        # legacy fallback
        pm = obj.pinned_message
        return MessageSerializer(pm, context=self.context).data if pm else None

    def get_unread_count(self, obj):
        my_part = self._get_my_participant(obj)
        if not my_part: return 0
        since = my_part.last_read_at
        qs = obj.messages
        # Never count my own messages as unread
        qs = qs.exclude(sender_id=my_part.membership_id)
        if not since:
            return qs.count()
        return qs.filter(created_at__gt=since).count()

    def get_participant_ids(self, obj):
        return list(obj.participants.values_list("membership_id", flat=True))

    def get_my_is_admin(self, obj):
        my_part = self._get_my_participant(obj)
        return bool(getattr(my_part, "is_admin", False)) if my_part else False

    def get_can_manage(self, obj):
        """
        Match ConversationViewSet logic:
        - Pharmacy chat: require comms admin capability.
        - Custom group: creator or participant admin.
        """
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return False
        my_part = self._get_my_participant(obj)
        if obj.pharmacy_id:
            try:
                from client_profile.admin_helpers import has_admin_capability, CAPABILITY_MANAGE_COMMS
                return has_admin_capability(user, obj.pharmacy, CAPABILITY_MANAGE_COMMS)
            except Exception:
                return False
        if obj.created_by_id == user.id:
            return True
        return bool(getattr(my_part, "is_admin", False))

    def get_can_delete(self, obj):
        """
        Align with perform_destroy:
        - Pharmacy chat: comms admin only.
        - Custom group: creator or admin (or self-only group).
        - DM: participants can delete-for-me (handled server-side); expose true so client can show delete-for-me.
        """
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return False
        my_part = self._get_my_participant(obj)
        if obj.type == Conversation.Type.DM:
            return True
        if obj.pharmacy_id:
            try:
                from client_profile.admin_helpers import has_admin_capability, CAPABILITY_MANAGE_COMMS
                return has_admin_capability(user, obj.pharmacy, CAPABILITY_MANAGE_COMMS)
            except Exception:
                return False
        if obj.created_by_id == user.id:
            return True
        if my_part and getattr(my_part, "is_admin", False):
            return True
        try:
            if obj.participants.count() == 1 and my_part:
                return True
        except Exception:
            pass
        return False


class ConversationCreateSerializer(serializers.ModelSerializer):
    participants = serializers.PrimaryKeyRelatedField(
        queryset=Membership.objects.filter(is_active=True), 
        many=True, 
        write_only=True,
        required=False
    )

    class Meta:
        model = Conversation
        fields = ["id", "type", "title", "participants", "created_by"]
        read_only_fields = ["id", "created_by", "type"]

    def create(self, validated_data):
        participants_data = validated_data.pop("participants", [])
        validated_data['created_by'] = self.context['request'].user

        conv = Conversation.objects.create(**validated_data)

        # Add creator + dedupe, mark creator admin
        creator_membership = (
            Membership.objects.filter(user=self.context['request'].user, is_active=True).first()
        )
        if creator_membership:
            # Normalise & dedupe incoming participants (can be Membership instances)
            participant_memberships = {m if isinstance(m, Membership) else None for m in participants_data}
            participant_memberships = {m for m in participant_memberships if isinstance(m, Membership)}
            participant_memberships.add(creator_membership)

            # Insert; mark creator as admin; ignore conflicts if client sent creator too
            Participant.objects.bulk_create(
                [
                    Participant(
                        conversation=conv,
                        membership=m,
                        is_admin=(m.id == creator_membership.id)
                    )
                    for m in participant_memberships
                    if getattr(m, "is_active", True)
                ],
                ignore_conflicts=True,
            )
        return conv


    def update(self, instance, validated_data):
        if 'participants' in validated_data:
            # Incoming can be a queryset or list of Membership objects
            new_participants_qs = validated_data.pop('participants')
            new_participant_ids = {p.id for p in new_participants_qs}

            # Current links
            current_participant_ids = set(
                instance.participants.values_list('membership_id', flat=True)
            )

            # Ensure creator is always included
            creator_user = instance.created_by
            creator_mem = (
                Membership.objects.filter(user=creator_user, is_active=True).first()
                or Membership.objects.filter(user=creator_user).first()
            )
            if creator_mem:
                new_participant_ids.add(creator_mem.id)

            # Add missing memberships (keep creator admin)
            ids_to_add = new_participant_ids - current_participant_ids
            if ids_to_add:
                memberships_to_add = list(Membership.objects.filter(id__in=ids_to_add))
                Participant.objects.bulk_create(
                    [
                        Participant(
                            conversation=instance,
                            membership=m,
                            is_admin=(creator_mem and m.id == creator_mem.id)
                        )
                        for m in memberships_to_add
                    ],
                    ignore_conflicts=True,
                )

            # Remove those no longer present (but never remove creator)
            if creator_mem:
                current_participant_ids.discard(creator_mem.id)
            ids_to_remove = current_participant_ids - new_participant_ids
            if ids_to_remove:
                instance.participants.filter(membership_id__in=ids_to_remove).delete()

        return super().update(instance, validated_data)


class ConversationDetailSerializer(ConversationListSerializer):
    class Meta(ConversationListSerializer.Meta):
        fields = ConversationListSerializer.Meta.fields


class ChatParticipantSerializer(serializers.ModelSerializer):
    """
    A specific serializer to provide user details for all participants
    in a user's conversations, regardless of their active status.
    """
    user_details = serializers.SerializerMethodField()
    is_admin = serializers.SerializerMethodField()

    def get_user_details(self, obj):
        return _chat_member_identity(
            getattr(obj, "user", None),
            self.context.get("request"),
            obj,
        )

    def get_is_admin(self, obj):
        # A membership can have multiple participant rows; return True if any mark this membership as admin.
        from client_profile.models import Participant  # local import to avoid cycles
        return Participant.objects.filter(membership=obj, is_admin=True).exists()

    class Meta:
        model = Membership
        fields = [
            "id",
            "user_details",
            "role",
            "employment_type",
            "invited_name",
            "is_admin",
        ]


class ShiftContactSerializer(serializers.Serializer):
    """
    Lightweight serializer for shift-related chat contacts.
    Includes aggregated pharmacy info for users with multiple shifts.
    """
    pharmacy_id = serializers.IntegerField(required=False, allow_null=True)
    pharmacy_name = serializers.CharField(required=False, allow_blank=True)
    pharmacies = serializers.ListField(child=serializers.DictField(), required=False)
    shift_id = serializers.IntegerField(required=False, allow_null=True)
    shift_date = serializers.DateField(required=False, allow_null=True)
    role = serializers.CharField()
    user = ChatMemberSerializer()
