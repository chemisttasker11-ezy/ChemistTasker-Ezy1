import { FC, useRef, useState, useMemo, useCallback, type DragEvent } from 'react';
import { Box } from '@mui/material';
import { AlertColor } from '@mui/material/Alert';
import type { ChatMessage, ChatRoom, MemberCache, PharmacyRef, UserLite } from './types';
import { ConversationHeader, PinnedMessageBar } from './ConversationHeader';
import { ConversationMessageList } from './ConversationMessageList';
import { MessageComposer, ALL_MENTION_ID, type MentionOption, type MessageComposerHandle } from './MessageComposer';
import { DeleteMessageDialog } from './DeleteMessageDialog';
import { useConversationScroll } from './useConversationScroll';
import './chat.css';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

type Membership = {
  id: number;
  pharmacy: number;
  user: { id: number };
};

type ShiftContactUser = Omit<UserLite, 'first_name' | 'last_name' | 'email'> & {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};


type Props = {
  activeRoom: ChatRoom;
  pharmacies: PharmacyRef[];
  myMemberships: Membership[];
  messages: ChatMessage[];
  myMembershipId?: number;
  currentUserId?: number;
  participantCache: Record<number, { details: UserLite; invited_name?: string }>;
  memberCache: MemberCache;
  shiftContacts?: Array<{ user?: ShiftContactUser | null }>;
  onSendText: (body: string) => void | Promise<void>;
  onSendAttachment: (files: File[], body?: string) => void | Promise<void>;
  isLoadingMessages: boolean;
  onStartDm: (partnerMembershipId: number) => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onEditMessage: (messageId: number, newBody: string) => void | Promise<void>;
  onDeleteMessage: (messageId: number) => void | Promise<void>;
  onReact: (messageId: number, reaction: string) => void;
  onTogglePin: (target: 'conversation' | 'message', messageId?: number) => void;
  isMobile: boolean;
  onBack: () => void;
  onTyping: (isTyping: boolean) => void;
  onNotify: (severity: AlertColor, message: string) => void;
  typingMembers?: string[];
};

/**
 * One conversation: works out who is in it and what to call it, then composes the header, the message list
 * (scroll behaviour in useConversationScroll), the composer and the delete dialog. API calls stay with the caller.
 */
export const ConversationPanel: FC<Props> = ({
  activeRoom,
  pharmacies,
  myMemberships,
  messages,
  myMembershipId,
  currentUserId,
  participantCache,
  memberCache,
  shiftContacts = [],
  onSendText,
  onSendAttachment,
  isLoadingMessages,
  onStartDm,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onEditMessage,
  onDeleteMessage,
  onReact,
  isMobile,
  onBack,
  onTogglePin,
  onTyping,
  onNotify,
  typingMembers = [],
}) => {
  const composerRef = useRef<MessageComposerHandle | null>(null);
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [deleting, setDeleting] = useState<ChatMessage | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handlePinnedJump = useCallback(() => {
    const pinnedId = activeRoom.pinned_message?.id;
    if (!pinnedId) return;
    const target = messageRefs.current[pinnedId];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeRoom?.pinned_message?.id]);

  const mentionOptions = useMemo<MentionOption[]>(() => {
    const map = new Map<number, string>();
    const participantIds = activeRoom.participant_ids || [];

    participantIds.forEach(membershipId => {
      if (myMembershipId && membershipId === myMembershipId) return;
      for (const pharmacyId in memberCache) {
        const record = memberCache[Number(pharmacyId)]?.[membershipId];
        if (record?.details) {
          const details = record.details;
          const label = `${details.first_name || ''} ${details.last_name || ''}`.trim() || record.invited_name || 'Team member';
          map.set(membershipId, label);
          break;
        }
      }
    });

    messages.forEach(message => {
      const membershipId = message.sender?.id;
      if (!membershipId || (myMembershipId && membershipId === myMembershipId) || map.has(membershipId)) return;
      const details = message.sender?.user_details;
      if (details) {
        const label = `${details.first_name || ''} ${details.last_name || ''}`.trim() || 'Team member';
        map.set(membershipId, label);
      }
    });

    const people = Array.from(map.entries()).map(([membershipId, label]) => ({ membershipId, label }));
    // Group chats offer @all first. Every group participant is already notified of each message
    // (backend chat/signals.py); @all tells them the message is meant for everyone.
    return activeRoom.type === 'GROUP' ? [{ membershipId: ALL_MENTION_ID, label: 'all' }, ...people] : people;
  }, [activeRoom, memberCache, messages, myMembershipId]);

  const resolveMemberDetails = useCallback(
    (membershipId: number | null): UserLite | null => {
      if (!membershipId) {
        return null;
      }
      const participant = participantCache[membershipId]?.details;
      if (participant) {
        return participant;
      }
      for (const pharmacyId in memberCache) {
        const record = memberCache[Number(pharmacyId)]?.[membershipId];
        if (record?.details) {
          return record.details;
        }
      }
      return null;
    },
    [memberCache, participantCache],
  );

  const resolveMemberDetailsForMessage = useCallback(
    (message: ChatMessage): UserLite | null => {
      const membershipId = message.sender?.id ?? null;
      const byMembership = resolveMemberDetails(membershipId);
      const senderUserId = message.sender?.user_details?.id;
      const hasUsefulMembershipDetails = Boolean(
        byMembership?.profile_photo_url ||
        `${byMembership?.first_name || ''} ${byMembership?.last_name || ''}`.trim()
      );
      if (hasUsefulMembershipDetails) {
        return byMembership;
      }
      if (senderUserId) {
        const shiftContact = shiftContacts.find((contact) => contact?.user?.id === senderUserId);
        if (shiftContact?.user) {
          return {
            ...byMembership,
            ...shiftContact.user,
            first_name: shiftContact.user.first_name || byMembership?.first_name,
            last_name: shiftContact.user.last_name || byMembership?.last_name,
            profile_photo_url: shiftContact.user.profile_photo_url || byMembership?.profile_photo_url,
          } as UserLite;
        }
        for (const cached of Object.values(participantCache)) {
          if (cached?.details?.id === senderUserId) {
            return cached.details;
          }
        }
        for (const pharmacyId in memberCache) {
          const inner = memberCache[Number(pharmacyId)];
          for (const rec of Object.values(inner)) {
            if (rec?.details?.id === senderUserId) {
              return rec.details;
            }
          }
        }
      }
      return byMembership;
    },
    [memberCache, participantCache, resolveMemberDetails, shiftContacts],
  );

  const isMessageFromMe = useCallback(
    (message: ChatMessage) => {
      if (myMembershipId && message.sender?.id === myMembershipId) {
        return true;
      }
      const senderUserId = message.sender?.user_details?.id;
      return Boolean(currentUserId && senderUserId && senderUserId === currentUserId);
    },
    [currentUserId, myMembershipId],
  );

  const headerTitle = useMemo(() => {
    if (activeRoom.type === 'GROUP') {
        if (activeRoom.title) return activeRoom.title;
        // Fallback for old groups that are tied to a pharmacy
        const pharmacy = pharmacies.find(p => p.id === activeRoom.pharmacy);
        return pharmacy?.name || 'Group Chat';
    }
    // Logic for DM titles
// DM title logic
// Never trust a generic "Group Chat" string for DMs
if (
  activeRoom.title &&
  activeRoom.title !== 'Direct Message' &&
  !activeRoom.title.startsWith('DM between') &&
  !/^group\s*chat$/i.test(activeRoom.title)
) {
  return activeRoom.title;
}

const myMembershipInRoom = myMemberships.find(myMem => activeRoom.participant_ids?.includes(myMem.id));
if (!myMembershipInRoom) {
  return 'Direct Message';
}

const partnerMembershipId = activeRoom.participant_ids?.find(pId => pId !== myMembershipInRoom.id);
if (partnerMembershipId) {
  for (const pharmacyId in memberCache) {
    if (memberCache[pharmacyId][partnerMembershipId]) {
      const partnerUser = memberCache[pharmacyId][partnerMembershipId].details;
      const fullName = `${partnerUser.first_name || ''} ${partnerUser.last_name || ''}`.trim();
      return fullName || 'Direct Message';
    }
  }
}

// Fallback: infer from visible messages (when the partner participant row no longer exists)
const lastFromPartner = [...messages].reverse().find(m => m.sender?.id !== myMembershipInRoom.id)?.sender?.user_details;
if (lastFromPartner) {
  const fullName = `${lastFromPartner.first_name || ''} ${lastFromPartner.last_name || ''}`.trim();
  return fullName || 'Direct Message';
}

return 'Direct Message';
  }, [activeRoom, pharmacies, myMemberships, memberCache, messages]);

  const firstUnreadIndex = useMemo(() => {
    const lastReadTime = activeRoom?.my_last_read_at ? dayjs.utc(activeRoom.my_last_read_at).valueOf() : 0;
    if (!lastReadTime) return -1;
    return messages.findIndex(msg =>
      (dayjs.utc(msg.created_at).valueOf() > lastReadTime) &&
      (msg.sender.user_details.id !== currentUserId)
    );
  }, [activeRoom?.my_last_read_at, messages, currentUserId]);

  const resolveUserName = useCallback(
    (userId: number): string | null => {
      const fromDetails = (d?: UserLite | null) => (d ? `${d.first_name || ''} ${d.last_name || ''}`.trim() || null : null);
      for (const cached of Object.values(participantCache)) {
        if (cached?.details?.id === userId) return fromDetails(cached.details);
      }
      for (const pharmacyId in memberCache) {
        for (const rec of Object.values(memberCache[Number(pharmacyId)] || {})) {
          if (rec?.details?.id === userId) return fromDetails(rec.details);
        }
      }
      const fromMessages = messages.find((m) => m.sender?.user_details?.id === userId)?.sender?.user_details;
      return fromDetails(fromMessages);
    },
    [participantCache, memberCache, messages],
  );

  const isGroupRoom = activeRoom.type === 'GROUP';
  const memberCount = activeRoom.participant_ids?.length || 0;
  const typingLine = typingMembers.length === 0
    ? null
    : typingMembers.length === 1
      ? `${typingMembers[0]} is typing…`
      : typingMembers.length === 2
        ? `${typingMembers[0]} and ${typingMembers[1]} are typing…`
        : `${typingMembers.length} people are typing…`;

  const { scrollRef, handleScroll, showJump, unseenCount, scrollToBottom } = useConversationScroll({
    roomId: activeRoom.id,
    messages,
    hasMore,
    isLoadingMore,
    onLoadMore,
    isMessageFromMe,
    typingCount: typingMembers.length,
  });

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    composerRef.current?.dropFiles(Array.from(event.dataTransfer?.files || []));
  };

  const pinned = activeRoom.pinned_message;

  return (
    <Box
      className="chatpage-main"
      sx={{ position: 'relative' }}
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); if (!dragActive) setDragActive(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragActive(false); }}
      onDrop={handleDrop}
    >
      {dragActive && <div className="conversation-dropzone">Drop files to attach</div>}

      <ConversationHeader
        title={headerTitle}
        statusLine={typingLine || (isLoadingMessages ? 'Loading messages…' : isGroupRoom ? `Group · ${memberCount} ${memberCount === 1 ? 'member' : 'members'}` : 'Direct message')}
        statusIsTyping={Boolean(typingLine)}
        isMobile={isMobile}
        onBack={onBack}
        isPinned={Boolean(activeRoom.is_pinned)}
        onTogglePin={() => onTogglePin('conversation')}
      />

      {pinned && <PinnedMessageBar pinned={pinned} onJump={handlePinnedJump} onUnpin={() => onTogglePin('message', pinned.id)} />}

      <ConversationMessageList
        title={headerTitle}
        isGroupRoom={isGroupRoom}
        messages={messages}
        firstUnreadIndex={firstUnreadIndex}
        isLoadingMessages={isLoadingMessages}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        typing={typingMembers.length > 0}
        scrollRef={scrollRef}
        onScroll={handleScroll}
        showJump={showJump}
        unseenCount={unseenCount}
        onJumpToLatest={() => scrollToBottom(true)}
        onWave={() => { void onSendText('👋'); }}
        isMessageFromMe={isMessageFromMe}
        resolveMemberDetailsForMessage={resolveMemberDetailsForMessage}
        onRequestEdit={(message) => composerRef.current?.startEdit(message)}
        onRequestDelete={setDeleting}
        registerMessage={(id, el) => { if (el) messageRefs.current[id] = el; else delete messageRefs.current[id]; }}
        bubbleActions={{ currentUserId, onStartDm, onReact, onTogglePin, resolveUserName }}
      />

      <MessageComposer
        ref={composerRef}
        roomId={activeRoom.id}
        title={headerTitle}
        isGroupRoom={isGroupRoom}
        memberCount={memberCount}
        isMobile={isMobile}
        mentionOptions={mentionOptions}
        onSendText={onSendText}
        onSendAttachment={onSendAttachment}
        onEditMessage={onEditMessage}
        onTyping={onTyping}
        onNotify={onNotify}
      />

      <DeleteMessageDialog message={deleting} onClose={() => setDeleting(null)} onDelete={onDeleteMessage} onError={(text) => onNotify('error', text)} />
    </Box>
  );
};
