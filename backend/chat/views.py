"""Chat API: conversations, messages, reactions, participants and shift contacts."""
import logging

log = logging.getLogger(__name__)


"""Moved verbatim from client_profile/views.py (Stage 2 domain split). Behaviour is unchanged; client_profile/views.py re-exports these names."""
from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.pagination import PageNumberPagination
from client_profile.models import Membership, Pharmacy, PHARMACY_STAFF_EMPLOYMENT_TYPES, ShiftSlotAssignment
from chat.models import Conversation, make_dm_key, Message, MessageReaction, Participant
from django.core.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from client_profile.admin_helpers import CAPABILITY_MANAGE_COMMS, has_admin_capability
from django.shortcuts import get_object_or_404
from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone
from client_profile.utils import sanitize_chat_text
from chat.realtime import broadcast_message_badge, broadcast_message_read
from client_profile.file_validation import ATTACHMENT_UPLOAD_POLICY, validate_uploaded_file
from datetime import date
from django.db import transaction
from users.models import OrganizationMembership, User
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from chat.serializers import (
    ChatParticipantSerializer,
    ConversationCreateSerializer,
    ConversationDetailSerializer,
    ConversationListSerializer,
    MessageSerializer,
    ShiftContactSerializer,
)
# Shared helpers that still live in the legacy module until their own domain is extracted:
from client_profile.domains.shifts.base import BaseShiftViewSet


class ChatMessagePagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 100


class ConversationViewSet(mixins.ListModelMixin,
                          mixins.RetrieveModelMixin,
                          mixins.CreateModelMixin,
                          mixins.UpdateModelMixin,
                          mixins.DestroyModelMixin,
                          viewsets.GenericViewSet):
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = ChatMessagePagination 
    
    def get_queryset(self):
        user = self.request.user

        # Get all conversations where the current user is a participant
        user_conversations = Conversation.objects.filter(
            participants__membership__user=user
        )

        # From these, get all DMs and custom groups (not linked to a pharmacy)
        dms_and_custom_groups = user_conversations.filter(
            Q(type='DM') | Q(pharmacy__isnull=True)
        )

        # Hide only "me" ghost custom groups:
        #   - rooms with no other participants besides me, OR
        #   - legacy rooms literally titled "me"
        others_exist = Exists(
            Participant.objects.filter(
                conversation_id=OuterRef('pk')
            ).exclude(
                membership__user=user
            )
        )
        dms_and_custom_groups = dms_and_custom_groups.exclude(
            Q(type='GROUP') & Q(pharmacy__isnull=True) & (
                ~others_exist | Q(title__iexact='me')
            )
        )

        # --- Include community chats for pharmacies I belong to ---
        user_pharmacy_ids = Membership.objects.filter(
            user=user,
            is_active=True,
            employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
        ).values_list('pharmacy_id', flat=True).distinct()

        community_chats = Conversation.objects.filter(
            type='GROUP',
            pharmacy_id__in=user_pharmacy_ids
        )

        # Combine everything:
        # - DMs and custom groups
        # - Community chats
        return (dms_and_custom_groups | community_chats).distinct().order_by('-updated_at')

    def get_serializer_class(self):
        # All "create DM" actions will serialize the final conversation object
        if self.action in ['create', 'update', 'partial_update', 'get_or_create_dm', 'get_or_create_dm_by_user', 'get_or_create_group', 'toggle_pin']:
            return ConversationCreateSerializer
        if self.action in ['retrieve']:
            return ConversationDetailSerializer
        return ConversationListSerializer

    @action(detail=False, methods=['get'], url_path='shift-contacts')
    def shift_contacts(self, request):
        """
        Returns shift-related chat contacts for the current user.
        - If user manages a pharmacy (owner/org-admin/pharmacy-admin/roster admin): returns workers assigned to shifts at those pharmacies.
        - If user is a worker on shifts: returns owners/admins for those pharmacies.
        """
        user = request.user
        today = date.today()
        contacts = []
        seen = set()

        managed_pharmacies = BaseShiftViewSet._managed_pharmacies(user)
        managed_ids = list(managed_pharmacies.values_list('id', flat=True))

        if managed_ids:
            assignments = (
                ShiftSlotAssignment.objects.filter(
                    shift__pharmacy_id__in=managed_ids,
                    slot_date__gte=today,
                )
                .select_related('user', 'shift__pharmacy', 'shift')
            )
            for assn in assignments:
                contact_user = assn.user
                if not contact_user or contact_user.id == user.id:
                    continue
                key = (assn.shift.pharmacy_id, contact_user.id)
                if key in seen:
                    continue
                seen.add(key)
                contacts.append({
                    "pharmacy_id": assn.shift.pharmacy_id,
                    "pharmacy_name": getattr(assn.shift.pharmacy, "name", ""),
                    "shift_id": assn.shift_id,
                    "shift_date": assn.slot_date,
                    "role": "WORKER",
                    "user": contact_user,
                })
        else:
            # Worker view: show owners/admins of pharmacies where this user has upcoming assignments
            assignments = (
                ShiftSlotAssignment.objects.filter(
                    user=user,
                    slot_date__gte=today,
                )
                .select_related('shift__pharmacy', 'shift__pharmacy__owner__user')
            )
            for assn in assignments:
                pharmacy = assn.shift.pharmacy
                if not pharmacy:
                    continue
                # Owner
                owner_user = getattr(getattr(pharmacy, "owner", None), "user", None)
                if owner_user and owner_user.id != user.id:
                    key = (pharmacy.id, owner_user.id)
                    if key not in seen:
                        seen.add(key)
                        contacts.append({
                            "pharmacy_id": pharmacy.id,
                            "pharmacy_name": getattr(pharmacy, "name", ""),
                            "shift_id": assn.shift_id,
                            "shift_date": assn.slot_date,
                            "role": "OWNER",
                            "user": owner_user,
                        })
                # Org admins
                org_id = getattr(pharmacy, "organization_id", None)
                if org_id:
                    org_admins = OrganizationMembership.objects.filter(
                        organization_id=org_id,
                        role='ORG_ADMIN',
                    ).select_related('user')
                    for adm in org_admins:
                        if adm.user and adm.user.id != user.id:
                            key = (pharmacy.id, adm.user.id)
                            if key not in seen:
                                seen.add(key)
                                contacts.append({
                                    "pharmacy_id": pharmacy.id,
                                    "pharmacy_name": getattr(pharmacy, "name", ""),
                                    "shift_id": assn.shift_id,
                                    "shift_date": assn.slot_date,
                                    "role": "ADMIN",
                                    "user": adm.user,
                                })
                # Pharmacy admins
                if hasattr(pharmacy, "admin_assignments"):
                    pharm_admins = pharmacy.admin_assignments.filter(is_active=True).select_related('user')
                    for adm in pharm_admins:
                        if adm.user and adm.user.id != user.id:
                            key = (pharmacy.id, adm.user.id)
                            if key not in seen:
                                seen.add(key)
                                contacts.append({
                                    "pharmacy_id": pharmacy.id,
                                    "pharmacy_name": getattr(pharmacy, "name", ""),
                                    "shift_id": assn.shift_id,
                                    "shift_date": assn.slot_date,
                                    "role": "ADMIN",
                                    "user": adm.user,
                                })

        # Deduplicate by user (or email) and aggregate pharmacies
        aggregated = {}
        for c in contacts:
            user_obj = c.get("user")
            user_id = getattr(user_obj, "id", None)
            email = (getattr(user_obj, "email", "") or "").lower()
            key = f"id:{user_id}" if user_id else (f"email:{email}" if email else None)
            if not key:
                continue
            entry = aggregated.get(key)
            if not entry:
                entry = {
                    "user": user_obj,
                    "pharmacies": {},
                    "shift_ids": set(),
                    "shift_dates": set(),
                    "role": c.get("role") or "",
                }
                aggregated[key] = entry
            pname = c.get("pharmacy_name") or ""
            pid = c.get("pharmacy_id")
            if pid:
                entry["pharmacies"][pid] = pname
            entry["shift_ids"].add(c.get("shift_id"))
            if c.get("shift_date"):
                entry["shift_dates"].add(c.get("shift_date"))

        normalized_contacts = []
        for entry in aggregated.values():
            user_obj = entry["user"]
            user_id = getattr(user_obj, "id", None)
            # If any contact had a photo, prefer that user object
            for other in contacts:
                ou = other.get("user")
                if ou and getattr(ou, "id", None) == user_id and getattr(ou, "profile_photo_url", None):
                    user_obj = ou
                    break
            pharmacy_items = list(entry["pharmacies"].items())
            primary_pid, primary_pname = (pharmacy_items[0] if pharmacy_items else (None, ""))
            pharmacy_names = [p for _, p in pharmacy_items if p]
            normalized_contacts.append({
                "pharmacy_id": primary_pid,
                "pharmacy_name": ", ".join(sorted(set(pharmacy_names))) if pharmacy_names else primary_pname,
                "pharmacies": [{"id": pid, "name": pname} for pid, pname in pharmacy_items],
                "shift_id": None,
                "shift_date": None,
                "role": entry["role"],
                "user": user_obj,
            })

        ser = ShiftContactSerializer(normalized_contacts, many=True, context={'request': request})
        return Response(ser.data)

    # --- NEW: Centralized DM Creation Logic ---
    def _get_or_create_dm_conversation(self, user_a, user_b):
        """
        Universal helper to create a DM between any two users.
        Handles creating an implicit 'Contact' membership for users without one.
        Returns (conversation, created, error_response).
        """
        if user_a.id == user_b.id:
            return None, False, Response({"detail": "Cannot create a DM with yourself."}, status=status.HTTP_400_BAD_REQUEST)

        # The sender MUST have an active membership to initiate a chat.
        membership_a = Membership.objects.filter(user=user_a, is_active=True).first()
        if not membership_a:
            return None, False, Response({"detail": "You must have an active role to start a chat."}, status=status.HTTP_403_FORBIDDEN)

        # For the receiver, find an active membership OR create a contact one.
        membership_b = Membership.objects.filter(user=user_b, is_active=True).first()
        if not membership_b:
            # If no active membership, create an inactive "Contact" record.
            # This links them to the SENDER'S pharmacy for context.
            membership_b, created = Membership.objects.get_or_create(
                user=user_b,
                pharmacy=membership_a.pharmacy, # Use sender's pharmacy for context
                defaults={
                    'role': 'STUDENT', # Sensible default role
                    'employment_type': 'CONTACT',
                    'is_active': False, # This is NOT a real, active membership
                    'invited_by': user_a,
                }
            )

        def _ensure_participants(conv, memberships):
            existing_ids = set(
                Participant.objects.filter(
                    conversation=conv,
                    membership__in=memberships
                ).values_list('membership_id', flat=True)
            )
            to_add = [
                Participant(conversation=conv, membership=m)
                for m in memberships
                if m and m.id not in existing_ids
            ]
            if to_add:
                Participant.objects.bulk_create(to_add, ignore_conflicts=True)

        # ---- LEGACY DM RESOLUTION (prevents duplicates) ----
        # There may be an older DM without a dm_key. Find any DM that has *both* users as participants.
        # If found, backfill dm_key and return it instead of creating a new conversation.
        legacy_dm = (
            Conversation.objects
            .filter(type=Conversation.Type.DM)
            .filter(participants__membership__user__in=[user_a, user_b])
            .annotate(
                user_count=Count('participants__membership__user', distinct=True)
            )
            .filter(user_count=2)
            .order_by('-updated_at')
            .first()
        )
        if legacy_dm:
            # Backfill dm_key if missing (or empty)
            if not getattr(legacy_dm, 'dm_key', None):
                legacy_dm.dm_key = make_dm_key(user_a.id, user_b.id)
                legacy_dm.save(update_fields=['dm_key'])
            # Safety: reattach requester/partner if their participant rows were deleted (delete-for-me case)
            _ensure_participants(legacy_dm, [membership_a, membership_b])
            return legacy_dm, False, None

        # The DM key is based on user IDs.
        dm_key = make_dm_key(user_a.id, user_b.id)

        with transaction.atomic():
            conversation, created = Conversation.objects.get_or_create(
                dm_key=dm_key,
                defaults={'type': Conversation.Type.DM, 'created_by': user_a}
            )
            if created:
                Participant.objects.bulk_create([
                    Participant(conversation=conversation, membership=membership_a),
                    Participant(conversation=conversation, membership=membership_b)
                ])
            else:
                # Safety: reattach missing participant rows if this DM already existed
                _ensure_participants(conversation, [membership_a, membership_b])
        
        return conversation, created, None

    # --- ACTION 1: Create DM by User ID (Primary Method) ---
    @action(detail=False, methods=['post'], url_path='get-or-create-dm-by-user')
    def get_or_create_dm_by_user(self, request):
        """
        Handles all new DM scenarios (Owner to Candidate, Anyone to Explorer).
        Takes a `partner_user_id`.
        """
        partner_user_id = request.data.get('partner_user_id')
        if not partner_user_id:
            return Response({"detail": "partner_user_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            partner_user = User.objects.get(pk=partner_user_id)
        except User.DoesNotExist:
            return Response({"detail": "Partner user not found."}, status=status.HTTP_404_NOT_FOUND)

        conversation, created, error = self._get_or_create_dm_conversation(request.user, partner_user)
        
        if error:
            return error

        serializer = self.get_serializer(conversation)
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    # --- ACTION 2: Create DM by Membership ID (Legacy/Internal Method) ---
    @action(detail=False, methods=['post'], url_path='get-or-create-dm')
    def get_or_create_dm(self, request):
        """
        Handles creating a DM with a user via one of their memberships.
        Takes a `partner_membership_id`.
        """
        partner_membership_id = request.data.get('partner_membership_id')
        if not partner_membership_id:
            return Response({"detail": "partner_membership_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # We only need the membership to find the target user.
            partner_membership = Membership.objects.select_related('user').get(pk=partner_membership_id)
        except Membership.DoesNotExist:
            return Response({"detail": "Partner membership not found."}, status=status.HTTP_404_NOT_FOUND)

        conversation, created, error = self._get_or_create_dm_conversation(request.user, partner_membership.user)

        if error:
            return error
        
        serializer = self.get_serializer(conversation)
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    # --- ACTION 3: Create/Update Group or Community Chat ---
    @action(detail=False, methods=['post'], url_path='get-or-create-group')
    def get_or_create_group(self, request):
        """
        Supports:
          - Creating a new custom group (title + participant_ids)
          - Updating an existing custom group (room_id + title/participant_ids)
          - Getting/creating a pharmacy community chat (pharmacy_id)
        """
        user = request.user
        data = request.data or {}
        pharmacy_id = data.get('pharmacy_id')
        room_id = data.get('room_id')
        participant_ids = data.get('participant_ids') or []
        title = data.get('title', '').strip()

        # Case A: Pharmacy community chat (one per pharmacy)
        if pharmacy_id:
            pharmacy = get_object_or_404(Pharmacy, pk=pharmacy_id)
            
            requester_membership = Membership.objects.filter(
                user=user,
                pharmacy=pharmacy,
                is_active=True,
                employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
            ).first()
            is_owner = getattr(pharmacy.owner, 'user', None) == user
            
            if not (requester_membership or is_owner):
                return Response({"detail": "Not authorized to access this pharmacy's community chat."}, status=status.HTTP_403_FORBIDDEN)

            conv, created = Conversation.objects.get_or_create(
                pharmacy=pharmacy,
                type=Conversation.Type.GROUP,
                defaults={
                    'title': pharmacy.name,
                    'created_by': user,
                },
            )
            # Ensure requester is a participant if they have a membership
            if requester_membership:
                Participant.objects.get_or_create(conversation=conv, membership=requester_membership, defaults={'is_admin': True})
            
            ser = ConversationCreateSerializer(conv, context={'request': request})
            return Response(ser.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

        # Case B: Update existing custom group
        if room_id:
            conv = get_object_or_404(Conversation, pk=room_id, type=Conversation.Type.GROUP)
            # Only allow updates on non-pharmacy groups here
            if conv.pharmacy_id:
                return Response({"detail": "Use pharmacy_id to manage community chats."}, status=status.HTTP_400_BAD_REQUEST)

            # Ensure user is creator or an admin participant
            is_creator = getattr(conv.created_by, 'id', None) == request.user.id
            is_admin = Participant.objects.filter(conversation=conv, membership__user=request.user, is_admin=True).exists()
            if not (is_creator or is_admin):
                return Response({"detail": "Not authorized to modify this group."}, status=status.HTTP_403_FORBIDDEN)

            serializer = ConversationCreateSerializer(
                conv,
                data={'title': title or conv.title, 'participants': participant_ids},
                partial=True,
                context={'request': request},
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)

        # Case C: Create new custom group
        serializer = ConversationCreateSerializer(
            data={'title': title, 'participants': participant_ids},
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        conv = serializer.save()
        return Response(ConversationCreateSerializer(conv, context={'request': request}).data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        # This method is now only for creating GROUP chats.
        conv = serializer.save(created_by=self.request.user)
        creator_membership = Membership.objects.filter(user=self.request.user, is_active=True).first()
        if creator_membership:
            # Normalise to a set of membership IDs (handles both Membership instances or IDs)
            raw = serializer.validated_data.get('participants', []) or []
            part_ids = set(
                [m.id if hasattr(m, 'id') else int(m) for m in raw]
            )
            part_ids.add(creator_membership.id)

            # Skip any membership already linked (prevents UNIQUE violation)
            existing_ids = set(
                Participant.objects.filter(conversation=conv).values_list('membership_id', flat=True)
            )
            new_ids = list(part_ids - existing_ids)

            if new_ids:
                new_memberships = list(Membership.objects.filter(id__in=new_ids))
                Participant.objects.bulk_create(
                    [
                        Participant(
                            conversation=conv,
                            membership=m,
                            is_admin=(m.id == creator_membership.id)
                        )
                        for m in new_memberships
                    ],
                    ignore_conflicts=True
                )



    @action(detail=True, methods=['post'], url_path='toggle-pin')
    def toggle_pin(self, request, pk=None):
        """
        Handles pinning/unpinning EITHER a conversation or a message within it.
        Payload: { "target": "conversation" }
        Payload: { "target": "message", "message_id": 123 }
        """
        conv = self.get_object()
        # A user can (historically) have multiple Participant rows in the same conversation.
        # Pick the first match instead of raising MultipleObjectsReturned.
        my_part = (
            Participant.objects
            .filter(conversation=conv, membership__user=request.user)
            .order_by('id')
            .first()
        )
        if not my_part:
            return Response({"detail": "Not a participant of this conversation."}, status=status.HTTP_403_FORBIDDEN)
        
        target = request.data.get('target')
        
        if target == 'conversation':
            my_part.is_pinned = not my_part.is_pinned
            my_part.save(update_fields=['is_pinned'])
            # Return the updated room so frontend state is consistent
            return Response(ConversationListSerializer(conv, context={'request': request}).data)

        elif target == 'message':
            message_id = request.data.get('message_id')
            if not message_id:
                # Unpin for current user only
                my_part.pinned_message = None
                my_part.save(update_fields=['pinned_message'])
            else:
                message_to_pin = get_object_or_404(Message, pk=message_id, conversation=conv)
                # Toggle per-user pin
                if my_part.pinned_message_id == message_to_pin.id:
                    my_part.pinned_message = None
                else:
                    my_part.pinned_message = message_to_pin
                my_part.save(update_fields=['pinned_message'])

            return Response(ConversationListSerializer(conv, context={'request': request}).data)

        return Response({'detail': 'Invalid target specified.'}, status=status.HTTP_400_BAD_REQUEST)

    def perform_destroy(self, instance):
        user = self.request.user
        my_participant = instance.participants.filter(membership__user=user).first()

        if not my_participant:
            # Allow the creator to delete even if their participant row is missing (legacy rooms)
            if instance.created_by_id == user.id and (instance.type == 'GROUP' and not instance.pharmacy):
                instance.delete()
                return
            raise PermissionDenied("You are not a member of this conversation.")

        # Case 1: Community Chat (linked to a pharmacy)
        if instance.type == 'GROUP' and instance.pharmacy:
            # Only pharmacy admins can delete the main community chat
            if not has_admin_capability(user, instance.pharmacy, CAPABILITY_MANAGE_COMMS):
                raise PermissionDenied("Only pharmacy admins can delete this community chat.")
        
        # Case 2: Custom Group Chat (not linked to a pharmacy)
        elif instance.type == 'GROUP' and not instance.pharmacy:
            # The creator can always delete their custom group
            if instance.created_by_id == user.id:
                pass
            elif not my_participant.is_admin:
                # Allow deletion when this is a self-only group ("me")
                if instance.participants.count() == 1 and instance.participants.filter(membership__user=user).exists():
                    pass  # allow delete
                else:
                    raise PermissionDenied("Only group admins can delete this conversation.")
            # Only the creator can delete a custom group.
            if instance.created_by_id != user.id:
                raise PermissionDenied("Only the creator can delete this group.")
        
        # Case 3: Direct Messages (DMs) can always be deleted by participants
        if instance.type == 'DM':
            # Delete-for-me ONLY: remove my participant row so the DM disappears for me,
            # but remains for the other subject.
            instance.participants.filter(membership__user=user).delete()

            # Optional safety: if no participants remain (edge case), clean up the convo.
            if not instance.participants.exists():
                instance.delete()
            return

        # Default (after passing the GROUP checks above): hard delete conversation
        instance.delete()
            
    @action(detail=True, methods=['get', 'post'])
    def messages(self, request, pk=None):
        conv = self.get_object()
        my_part = Participant.objects.filter(conversation=conv, membership__user=request.user).first()
        if not my_part:
            return Response({"detail": "Not a participant of this conversation."}, status=status.HTTP_403_FORBIDDEN)
        
        if request.method.lower() == 'get':
            qs = conv.messages.select_related('sender__user').order_by('-created_at')
            page = self.paginate_queryset(qs)
            ser = MessageSerializer(page if page is not None else qs, many=True, context={'request': request})
            return self.get_paginated_response(ser.data) if page else Response(ser.data)

        data = request.data or {}
        body = sanitize_chat_text(data.get('body') or '')
        attachments = request.FILES.getlist('attachment')
        if not body and not attachments:
            return Response({"detail": "Message body or attachment is required."}, status=status.HTTP_400_BAD_REQUEST)
        
        created_messages = []
        sender_membership = my_part.membership
        if attachments:
            for attachment_file in attachments:
                validate_uploaded_file(attachment_file, ATTACHMENT_UPLOAD_POLICY, "attachment")
                msg = Message.objects.create(conversation=conv, sender=sender_membership, body=body if not created_messages else "", attachment=attachment_file, attachment_filename=attachment_file.name)
                created_messages.append(msg)
        elif body:
            msg = Message.objects.create(conversation=conv, sender=sender_membership, body=body)
            created_messages.append(msg)
        
        if created_messages:
            Conversation.objects.filter(pk=conv.pk).update(updated_at=created_messages[-1].created_at)
            # Mark my read position up to my latest message so I don't badge myself
            my_part.last_read_at = created_messages[-1].created_at
            my_part.save(update_fields=["last_read_at"])

        http_payload = MessageSerializer(created_messages, many=True, context={'request': request}).data
        if len(created_messages) == 1:
            return Response(http_payload[0], status=status.HTTP_201_CREATED)
        return Response(http_payload, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def read(self, request, pk=None):
        conv = self.get_object()
        part = Participant.objects.filter(conversation=conv, membership__user=request.user).first()
        if not part:
            return Response({"detail": "Not a participant."}, status=status.HTTP_404_NOT_FOUND)
        part.last_read_at = timezone.now()
        part.save(update_fields=['last_read_at'])
        broadcast_message_read(part)
        return Response({"detail": "Read position updated.", "last_read_at": part.last_read_at})


class MessageViewSet(viewsets.ModelViewSet):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return (
            Message.objects
            .filter(conversation__participants__membership__user=user)
            .select_related("sender__user", "conversation")
        )

    def create(self, request, *args, **kwargs):
        user = request.user
        body = sanitize_chat_text(request.data.get("body") or "")
        if not body and not request.FILES.get("attachment"):
            return Response({"detail": "Message body or attachment is required."}, status=status.HTTP_400_BAD_REQUEST)

        conversation_id = self.kwargs.get("conversation_pk") or request.data.get("conversation") or request.data.get("conversation_id")
        try:
            conversation = Conversation.objects.get(pk=conversation_id)
        except Conversation.DoesNotExist:
            return Response({"detail": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)

        participant = Participant.objects.filter(conversation=conversation, membership__user=user).select_related("membership").first()
        if not participant:
            return Response({"detail": "You are not a participant in this conversation."}, status=status.HTTP_403_FORBIDDEN)

        attachment_file = request.FILES.get("attachment") if request.FILES else None
        if attachment_file:
            validate_uploaded_file(attachment_file, ATTACHMENT_UPLOAD_POLICY, "attachment")

        msg = Message.objects.create(
            conversation=conversation,
            sender=participant.membership,
            body=body,
            attachment=attachment_file,
            attachment_filename=attachment_file.name if attachment_file else None,
        )
        Conversation.objects.filter(pk=conversation.id).update(updated_at=msg.created_at)
        serializer = self.get_serializer(msg)

        # Broadcast immediately so clients see the message without waiting for the signal
        try:
            layer = get_channel_layer()
            if layer:
                payload = serializer.data
                async_to_sync(layer.group_send)(
                    f"room.{msg.conversation_id}",
                    {
                        "type": "message.created",
                        "message": payload,
                    },
                )
                sender_user_id = getattr(msg.sender, "user_id", None)
                for participant in Participant.objects.select_related("membership__user", "conversation").filter(conversation_id=msg.conversation_id):
                    # Skip notifying the sender
                    if sender_user_id and getattr(participant.membership, "user_id", None) == sender_user_id:
                        continue
                    broadcast_message_badge(participant, sender_membership_id=msg.sender_id, sender_user_id=sender_user_id)
        except Exception:
            log.exception("Error while broadcasting message from view")

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        """
        Handles editing a message (PATCH request).
        """
        message = self.get_object()
        
        my_participant = message.conversation.participants.filter(membership__user=request.user).first()
        if not my_participant or message.sender != my_participant.membership:
            raise PermissionDenied("You can only edit your own messages.")

        new_body = sanitize_chat_text(request.data.get("body", ""))
        if not new_body:
            raise ValidationError({"body": "Message body cannot be empty."})

        if not message.is_edited:
            message.original_body = message.body
        
        message.body = new_body
        message.is_edited = True
        message.save()
        
        layer = get_channel_layer()
        # --- FIX: Changed "chat_" back to "room." to match your consumers.py ---
        group_name = f"room.{message.conversation_id}"
        async_to_sync(layer.group_send)(
            group_name,
            {
                "type": "message.updated",
                "message": self.get_serializer(message).data,
            },
        )
        
        return Response(self.get_serializer(message).data)

    def destroy(self, request, *args, **kwargs):
        """
        Handles "deleting" a message (DELETE request) by marking it as deleted.
        """
        message = self.get_object()
        
        my_participant = message.conversation.participants.filter(membership__user=request.user).first()
        if not my_participant or message.sender != my_participant.membership:
            raise PermissionDenied("You can only delete your own messages.")

        attachment_name = message.attachment.name if message.attachment else None
        attachment_storage = message.attachment.storage if attachment_name else None
        with transaction.atomic():
            message.is_deleted = True
            message.body = ""
            message.original_body = None
            message.attachment = None
            message.attachment_filename = None
            message.save()
            if attachment_name:
                transaction.on_commit(
                    lambda: attachment_storage.delete(attachment_name), robust=True
                )
        
        layer = get_channel_layer()
        # --- FIX: Changed "chat_" back to "room." to match your consumers.py ---
        group_name = f"room.{message.conversation_id}"
        async_to_sync(layer.group_send)(
            group_name,
            {
                "type": "message.deleted",
                "message_id": message.id,
            },
        )
        
        return Response(status=status.HTTP_204_NO_CONTENT)


class MessageReactionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, message_id):
        message = get_object_or_404(Message, pk=message_id)

        # SECURITY FIX: Ensure the user is actually a participant in the conversation
        if not Participant.objects.filter(conversation=message.conversation, membership__user=request.user).exists():
            return Response({'error': 'Not authorized to react to messages in this conversation.'}, status=status.HTTP_403_FORBIDDEN)

        reaction_char = request.data.get('reaction')
        
        valid_reactions = [r[0] for r in MessageReaction.REACTION_CHOICES]
        if reaction_char not in valid_reactions:
            return Response({'detail': 'Invalid reaction.'}, status=status.HTTP_400_BAD_REQUEST)

        # ✨ FIX: New logic to handle changing an emoji
        
        # 1. Find any existing reaction by this user on this message
        existing_reaction = MessageReaction.objects.filter(message=message, user=request.user).first()

        status_code = status.HTTP_201_CREATED # Assume we are adding a new one

        if existing_reaction:
            # If the user is clicking the same emoji again, delete it.
            if existing_reaction.reaction == reaction_char:
                existing_reaction.delete()
                status_code = status.HTTP_204_NO_CONTENT
            # If the user is clicking a DIFFERENT emoji, update the existing one.
            else:
                existing_reaction.reaction = reaction_char
                existing_reaction.save()
        else:
            # If no reaction exists, create a new one.
            MessageReaction.objects.create(
                message=message,
                user=request.user,
                reaction=reaction_char
            )
        
        # After any change, fetch all current reactions and broadcast
        reactions = MessageReaction.objects.filter(message=message)
        reactions_data = [{'reaction': r.reaction, 'user_id': r.user_id} for r in reactions]
        
        layer = get_channel_layer()
        group_name = f"room.{message.conversation_id}"
        async_to_sync(layer.group_send)(
            group_name,
            {
                "type": "reaction.updated",
                "message_id": message.id,
                "reactions": reactions_data,
            },
        )
        
        return Response(status=status_code)


class ChatParticipantView(generics.ListAPIView):
    """
    Returns a flat list of all unique membership profiles that are participants
    in any of the requesting user's conversations. This includes inactive members
    to ensure their names are preserved in the chat history.
    """
    serializer_class = ChatParticipantSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Get all conversations the user is in
        user_conversations = Conversation.objects.filter(participants__membership__user=user)
        # Get all memberships participating in those conversations
        participant_memberships = Membership.objects.filter(
            chat_participations__conversation__in=user_conversations
        ).distinct()
        return participant_memberships.select_related('user')
