import { FC, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, Button, Divider, IconButton, Tooltip, TextField, InputAdornment } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import { ChatListItem } from './ChatListItem';
import type { ChatRoom, PharmacyRef, CachedMember, ChatMessage, MemberCache } from './types';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

type Membership = {
  id: number;
  pharmacy: number;
  user: { id: number };
  role?: string; 
};

type SidebarFilter = 'all' | 'group' | 'dm' | 'shift';

interface ChatSidebarProps {
  rooms: ChatRoom[];
  pharmacies: PharmacyRef[];
  myMemberships: Membership[];
  activeRoomId: number | null;
  currentUserId?: number;
  onSelectRoom: (details: { type: 'dm' | 'group'; id: number } | { type: 'pharmacy'; id: number }) => void;
  participantCache: Record<number, CachedMember & { is_admin?: boolean }>;
  memberCache: MemberCache;
  getLatestMessage: (roomId: number) => ChatMessage | undefined;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onNewChat: () => void;
  onEdit: (room: ChatRoom) => void;
  onDelete: (roomId: number, roomName: string) => void;
  canCreateChat: boolean;
  onTogglePinConversation: (roomId: number) => void;
  initialFilter?: SidebarFilter;
  shiftContacts?: Array<{
    pharmacy_id: number | null;
    pharmacy_name: string;
    pharmacies?: Array<{ id: number; name: string }>;
    shift_id?: number | null;
    shift_date?: string | null;
    role: string;
    user: {
      id: number;
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      profile_photo_url?: string | null;
    };
  }>;
  onSelectShiftContact?: (contact: {
    pharmacy_id: number | null;
    pharmacy_name: string;
    pharmacies?: Array<{ id: number; name: string }>;
    shift_id?: number | null;
    shift_date?: string | null;
    role: string;
    user: {
      id: number;
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      profile_photo_url?: string | null;
    };
  }) => void;
}

const initialsFromParts = (first?: string | null, last?: string | null, fallback?: string | null) => {
  const safeFirst = (first || '').trim();
  const safeLast = (last || '').trim();
  if (safeFirst || safeLast) {
    return `${safeFirst.charAt(0)}${safeLast.charAt(0) || safeFirst.charAt(1) || ''}`.toUpperCase();
  }
  const alt = (fallback || '').trim();
  if (!alt) {
    return '?';
  }
  const parts = alt.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase() || '?';
  }
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
};

export const ChatSidebar: FC<ChatSidebarProps> = ({
  rooms,
  pharmacies,
  myMemberships,
  activeRoomId,
  onSelectRoom,
  participantCache,
  memberCache,
  getLatestMessage,
  isCollapsed,
  onToggleCollapse,
  onNewChat,
  onEdit,
  onDelete,
  canCreateChat,
  onTogglePinConversation,
  currentUserId,
  initialFilter,
  shiftContacts,
  onSelectShiftContact,
}) => {
  const [filter, setFilter] = useState<SidebarFilter>(initialFilter ?? 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    if (initialFilter) {
      setFilter(initialFilter);
    }
  }, [initialFilter]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(searchQuery.trim().toLowerCase());
    }, 200);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  const shiftContactsList = shiftContacts || [];

  const shiftContactByUserId = useMemo(() => {
    const map = new Map<number, typeof shiftContactsList[number]>();
    shiftContactsList.forEach((c) => {
      if (c?.user?.id) {
        const existing = map.get(c.user.id);
        // Prefer entry with profile photo; otherwise keep first
        if (!existing || (!existing.user.profile_photo_url && c.user.profile_photo_url)) {
          map.set(c.user.id, c);
        }
      }
    });
    return map;
  }, [shiftContactsList]);

  const shiftContactByEmail = useMemo(() => {
    const map = new Map<string, typeof shiftContactsList[number]>();
    shiftContactsList.forEach((c) => {
      const email = (c?.user?.email || '').toLowerCase();
      if (!email) return;
      const existing = map.get(email);
      if (!existing || (!existing.user.profile_photo_url && c.user.profile_photo_url)) {
        map.set(email, c);
      }
    });
    return map;
  }, [shiftContactsList]);

  const unifiedShiftContacts = useMemo(() => {
    const map = new Map<string, typeof shiftContactsList[number]>();
    shiftContactsList.forEach((c) => {
      const email = (c?.user?.email || '').trim().toLowerCase();
      const key =
        (c?.user?.id && `id:${c.user.id}`) ||
        (email && `email:${email}`);
      if (!key) return;
      const existing = map.get(key);
      if (!existing || (!existing.user?.profile_photo_url && c?.user?.profile_photo_url)) {
        map.set(key, c);
      }
    });
    return Array.from(map.values());
  }, [shiftContactsList]);

  const shiftContactUserMap = useMemo(() => {
    const map = new Map<number, { first_name?: string | null; last_name?: string | null; email?: string | null; profile_photo_url?: string | null }>();
    unifiedShiftContacts.forEach((c) => {
      const u = c?.user;
      if (u?.id) {
        const existing = map.get(u.id);
        if (!existing || (!existing.profile_photo_url && u.profile_photo_url)) {
          map.set(u.id, {
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            profile_photo_url: u.profile_photo_url,
          });
        }
      }
    });
    return map;
  }, [unifiedShiftContacts]);

  const resolveUserDetailsByMembership = useCallback(
    (membershipId: number | null) => {
      if (!membershipId) return null;
      const participant = participantCache[membershipId]?.details;
      if (participant) return participant;
      for (const pid in memberCache) {
        const candidate = memberCache[Number(pid)]?.[membershipId]?.details;
        if (candidate) {
          return candidate;
        }
      }
      return null;
    },
    [participantCache, memberCache],
  );

  const resolveUserDetailsByUserId = useCallback(
    (userId: number | null | undefined) => {
      if (!userId) return null;
      for (const mid in participantCache) {
        const d = participantCache[Number(mid)]?.details;
        if (d && d.id === userId) return d;
      }
      const fromShift = shiftContactUserMap.get(userId);
      if (fromShift) return fromShift as any;
      for (const pid in memberCache) {
        const inner = memberCache[Number(pid)];
        for (const mid in inner) {
          const d = inner[Number(mid)]?.details;
          if (d && d.id === userId) return d;
        }
      }
      return null;
    },
    [participantCache, memberCache, shiftContactUserMap],
  );

  const mergeUserDetails = useCallback(
    (user: any, userId?: number | null) => {
      const fallback = userId ? resolveUserDetailsByUserId(userId) : null;
      if (!fallback) return user;
      return {
        ...user,
        first_name: user?.first_name || fallback.first_name,
        last_name: user?.last_name || fallback.last_name,
        email: user?.email || fallback.email,
        profile_photo_url: user?.profile_photo_url || fallback.profile_photo_url,
      };
    },
    [resolveUserDetailsByUserId],
  );

  const getMembershipRecord = useCallback(
    (membershipId: number | null | undefined) => {
      if (!membershipId) return null;
      // participantCache does not carry invited_name, so only memberCache helps here
      for (const pid in memberCache) {
        const rec = memberCache[Number(pid)]?.[membershipId];
        if (rec) return rec;
      }
      return null;
    },
    [memberCache],
  );

  const formatUserName = useCallback(
    (details?: { first_name?: string | null; last_name?: string | null; email?: string | null }, invitedName?: string | null) => {
      const full = `${details?.first_name || ''} ${details?.last_name || ''}`.trim();
      if (full) return full;
      const invited = (invitedName || '').trim();
      if (invited) return invited;
      return (details?.email || '').trim() || 'Direct Message';
    },
    [],
  );

  // Only group admins can edit/delete.
  // Custom groups (no pharmacy): creator OR my participant admin flag.
  const isRoomAdmin = useCallback((room: ChatRoom): boolean => {
    // No edit/delete for DMs
    if (room.type !== 'GROUP') return false;
    // Show for creator OR my participant admin flag (pharmacy or not)
    const resolveCreatorId = (r: any): number | undefined => {
      const candidates = [
        r?.created_by_user_id,
        r?.createdByUserId,
        r?.created_by,
        r?.createdBy,
        r?.created_by_user,
        r?.createdByUser,
        // Some payloads carry membership and not user; try to resolve via cache below
        r?.created_by_membership_id,
        r?.createdByMembershipId,
        r?.created_by_membership,
        r?.createdByMembership,
        r?.creator,
        r?.creator_id,
        r?.creatorId,
        r?.owner,
        r?.owner_id,
        r?.ownerId,
      ];
      const dynamicMatches =
        r && typeof r === 'object'
          ? Object.entries(r)
              .filter(([k]) => {
                const key = k.toLowerCase();
                return key.includes('creator') || key.includes('owner') || key.includes('created_by');
              })
              .map(([, v]) => v)
          : [];

      for (const c of [...candidates, ...dynamicMatches]) {
        if (typeof c === 'number') return c;
        if (typeof c === 'string' && c.trim() && !Number.isNaN(Number(c))) return Number(c);
        if (c && typeof c === 'object' && 'id' in c) {
          const idVal = (c as any).id;
          if (typeof idVal === 'number') return idVal;
          if (typeof idVal === 'string' && idVal.trim() && !Number.isNaN(Number(idVal))) {
            return Number(idVal);
          }
        }
      }
      return undefined;
    };

    const creatorUserIdFromRoom = resolveCreatorId(room as any);

    // If creator is stored as membership id, try to translate to user id via caches
    const resolveMembershipUserId = (membershipId: number | undefined | null): number | undefined => {
      if (!membershipId) return undefined;
      const cached = participantCache[membershipId]?.details;
      if (cached?.id) return cached.id;
      for (const pid in memberCache) {
        const rec = memberCache[Number(pid)]?.[membershipId]?.details;
        if (rec?.id) return rec.id;
      }
      return undefined;
    };

    const creatorUserId =
      creatorUserIdFromRoom ??
      resolveMembershipUserId((room as any)?.created_by_membership_id ?? (room as any)?.createdByMembershipId);

    // Fallback: if creator user id is missing, infer from earliest participant membership id.
    let inferredCreatorMembershipId: number | null = null;
    if (!creatorUserId && Array.isArray(room.participant_ids) && room.participant_ids.length > 0) {
      inferredCreatorMembershipId = room.participant_ids.reduce((min, id) => (id < min ? id : min), room.participant_ids[0]);
    }
    const inferredCreatorUserId = creatorUserId ? undefined : resolveMembershipUserId(inferredCreatorMembershipId);

    const isCreator =
      currentUserId !== null &&
      currentUserId !== undefined &&
      creatorUserId !== undefined &&
      Number(creatorUserId) === Number(currentUserId);
    const isInferredCreator =
      currentUserId !== null &&
      currentUserId !== undefined &&
      inferredCreatorUserId !== undefined &&
      Number(inferredCreatorUserId) === Number(currentUserId);

    let myMembershipId: number | null = null;
    if (typeof room.my_membership_id === 'number') {
      myMembershipId = room.my_membership_id;
    } else if (Array.isArray(room.participant_ids) && room.participant_ids.length) {
      const mine = myMemberships.find((m) => room.participant_ids?.includes(m.id));
      myMembershipId = mine?.id ?? null;
    }
    const amParticipantAdmin = myMembershipId ? participantCache[myMembershipId]?.is_admin === true : false;

    return Boolean(isCreator || isInferredCreator || amParticipantAdmin);
  }, [currentUserId, myMemberships, participantCache]);

  const resolveParticipants = useCallback(
    (room: ChatRoom): { myMembershipId: number | null; partnerMembershipId: number | null } => {
      let myMembershipId = room.my_membership_id ?? null;
      if (!myMembershipId && Array.isArray(room.participant_ids) && room.participant_ids.length) {
        const mine = myMemberships.find((m) => room.participant_ids?.includes(m.id));
        myMembershipId = mine?.id ?? null;
      }
      const partnerMembershipId =
        room.participant_ids?.find((id) => id !== myMembershipId) ?? null;
      return { myMembershipId, partnerMembershipId };
    },
    [myMemberships],
  );

  const getDisplayName = useCallback((room: ChatRoom): string => {
    if (room.type === 'GROUP') {
        if (room.pharmacy) {
            const pharmacy = pharmacies.find(p => p.id === room.pharmacy);
            return pharmacy?.name || room.title || 'Group Chat';
        }
        return room.title || 'Group Chat';
    }
    const { myMembershipId, partnerMembershipId } = resolveParticipants(room);
    const myMembershipInRoom = myMembershipId
      ? myMemberships.find((m) => m.id === myMembershipId)
      : null;
    if (!myMembershipInRoom) {
      const t = (room.title || '').trim();
      return !t || /^group\s*chat$/i.test(t) ? 'Direct Message' : t;
    }

    if (partnerMembershipId) {
      const partnerRecord = getMembershipRecord(partnerMembershipId);
      const userDetails = partnerRecord?.details || resolveUserDetailsByMembership(partnerMembershipId);
      if (userDetails) {
        const merged = mergeUserDetails(userDetails, userDetails.id);
        const name = formatUserName(merged, partnerRecord?.invited_name);
        return name;
      }
      const partnerUserId = resolveUserDetailsByMembership(partnerMembershipId)?.id;
      if (partnerUserId) {
        const d = resolveUserDetailsByUserId(partnerUserId);
        if (d) return formatUserName(d);
      }
    }

    // Fallback from latest message sender (has user_details once messages were fetched)
    const last = getLatestMessage(room.id);
    if (last && last.sender?.user_details && last.sender.id !== myMembershipId) {
      const u = last.sender.user_details;
      return formatUserName(u);
    }

    // Fallback: use shift contact data if available for this user
    const partnerUserId = partnerMembershipId
      ? resolveUserDetailsByMembership(partnerMembershipId)?.id
      : undefined;
    if (partnerUserId) {
      const contact = shiftContactByUserId.get(partnerUserId);
      if (contact?.user) {
        const merged = mergeUserDetails(contact.user, partnerUserId);
        const name = formatUserName(merged);
        return name;
      }
      const byUserId = resolveUserDetailsByUserId(partnerUserId);
      if (byUserId) {
        const merged = mergeUserDetails(byUserId, partnerUserId);
        const name = formatUserName(merged);
        return name;
      }
    }
    // Fallback: by email if we have no user id
    if (room.title) {
      const contact = shiftContactByEmail.get(room.title.toLowerCase());
      if (contact?.user) return formatUserName(contact.user);
    }
    // Avoid using my own sender details for naming; rely on partner/contacts above

    // Final fallback
    const t = (room.title || '').trim();
    return t || 'Direct Message';
  }, [pharmacies, myMemberships, resolveParticipants, resolveUserDetailsByMembership, resolveUserDetailsByUserId, getLatestMessage, shiftContactByUserId, shiftContactByEmail, formatUserName, getMembershipRecord]);

  const getRoomAvatar = useCallback(
    (room: ChatRoom, fallbackName: string): { url: string | null; label: string } => {
      if (room.type === 'GROUP') {
        return {
          url: null,
          label: initialsFromParts(undefined, undefined, fallbackName || room.title || 'Group Chat'),
        };
      }
      const { myMembershipId, partnerMembershipId } = resolveParticipants(room);
      const partnerRecord = getMembershipRecord(partnerMembershipId);
      const memberDetails = partnerRecord?.details || resolveUserDetailsByMembership(partnerMembershipId);
      if (memberDetails) {
        const hasPhoto = !!memberDetails.profile_photo_url;
        if (hasPhoto) {
          return {
            url: memberDetails.profile_photo_url ?? null,
            label: initialsFromParts(
              memberDetails.first_name,
              memberDetails.last_name,
              memberDetails.email || fallbackName,
            ),
          };
        }
        // No photo on participant; try shift contact/user-id fallbacks before giving up
        const partnerUserId = memberDetails.id;
        if (partnerUserId) {
          const contact = shiftContactByUserId.get(partnerUserId);
          if (contact?.user) {
            const u = mergeUserDetails(contact.user, partnerUserId);
            return {
              url: u.profile_photo_url ?? null,
              label: initialsFromParts(u.first_name, u.last_name, u.email || fallbackName),
            };
          }
          const byUserId = resolveUserDetailsByUserId(partnerUserId);
          if (byUserId) {
            return {
              url: byUserId.profile_photo_url ?? null,
              label: initialsFromParts(byUserId.first_name, byUserId.last_name, byUserId.email || fallbackName),
            };
          }
        }
      }
      const last = getLatestMessage(room.id);
      if (last && last.sender?.user_details && last.sender.id !== myMembershipId) {
        const details = last.sender.user_details;
        return {
          url: details.profile_photo_url ?? null,
          label: initialsFromParts(details.first_name, details.last_name, details.email || fallbackName),
        };
      }
      const partnerUserId = partnerMembershipId ? resolveUserDetailsByMembership(partnerMembershipId)?.id : undefined;
      if (partnerUserId) {
        const contact = shiftContactByUserId.get(partnerUserId);
        if (contact?.user) {
          const u = mergeUserDetails(contact.user, partnerUserId);
          return {
            url: u.profile_photo_url ?? null,
            label: initialsFromParts(u.first_name, u.last_name, u.email || fallbackName),
          };
        }
        const byUserId = resolveUserDetailsByUserId(partnerUserId);
        if (byUserId) {
          const merged = mergeUserDetails(byUserId, partnerUserId);
          return {
            url: merged.profile_photo_url ?? null,
            label: initialsFromParts(merged.first_name, merged.last_name, merged.email || fallbackName),
          };
        }
      }
      if (room.title) {
        const contact = shiftContactByEmail.get(room.title.toLowerCase());
        if (contact?.user) {
          const u = contact.user;
          return {
            url: u.profile_photo_url ?? null,
            label: initialsFromParts(u.first_name, u.last_name, u.email || fallbackName),
          };
        }
      }
      const lastEmail = last && last.sender?.user_details?.email;
      if (lastEmail) {
        const contact = shiftContactByEmail.get(lastEmail.toLowerCase());
        if (contact?.user) {
          const u = contact.user;
          return {
            url: u.profile_photo_url ?? null,
            label: initialsFromParts(u.first_name, u.last_name, u.email || fallbackName),
          };
        }
      }
      return {
        url: null,
        label: initialsFromParts(undefined, undefined, fallbackName || 'Direct Message'),
      };
    },
    [resolveParticipants, resolveUserDetailsByMembership, getLatestMessage, shiftContactByUserId, shiftContactByEmail],
  );

  const roomCategory = useCallback((room: ChatRoom): SidebarFilter => {
    if (room.type === 'DM') return 'dm';
    const rawKind =
      ((room as any)?.kind as string | undefined) ??
      ((room as any)?.category as string | undefined) ??
      ((room as any)?.chat_type as string | undefined);
    if (rawKind && rawKind.toLowerCase().includes('shift')) return 'shift';
    if ((room as any)?.shift || (room as any)?.shift_id) return 'shift';
    const inferredTitle = (room.title || '').toLowerCase();
    if (!room.pharmacy && inferredTitle.includes('shift')) return 'shift';
    return 'group';
  }, []);

  const filteredRooms = useMemo(() => {
    if (!debouncedQuery) return rooms;
    return rooms.filter(room => {
      const name = getDisplayName(room).toLowerCase();
      if (name.includes(debouncedQuery)) return true;
      const preview = (getLatestMessage(room.id)?.body || room.last_message?.body || '').toLowerCase();
      return preview.includes(debouncedQuery);
    });
  }, [rooms, debouncedQuery, getDisplayName, getLatestMessage]);

  const sortedRooms = useMemo(
    () =>
      [...filteredRooms].sort(
        (a, b) => dayjs.utc(b.updated_at || 0).valueOf() - dayjs.utc(a.updated_at || 0).valueOf()
      ),
    [filteredRooms]
  );

  const matchesFilter = useCallback(
    (room: ChatRoom) => {
      if (filter === 'all') return true;
      return roomCategory(room) === filter;
    },
    [filter, roomCategory]
  );

  const { pinnedChats, groupChats, shiftChats, dmChats } = useMemo(() => {
    const finalPinned: ChatRoom[] = [];
    const finalGroupChats: ChatRoom[] = [];
    const finalShiftChats: ChatRoom[] = [];
    const finalDmChats: ChatRoom[] = [];

    for (const room of sortedRooms) {
      if (!matchesFilter(room)) continue;

      if (room.is_pinned) {
        finalPinned.push(room);
        continue;
      }

      const category = roomCategory(room);
      if (category === 'group') {
        finalGroupChats.push(room);
      } else if (category === 'shift') {
        finalShiftChats.push(room);
      } else {
        finalDmChats.push(room);
      }
    }

    return { pinnedChats: finalPinned, groupChats: finalGroupChats, shiftChats: finalShiftChats, dmChats: finalDmChats };
  }, [sortedRooms, matchesFilter, roomCategory]);

  const unreadRooms = useMemo(
    () => sortedRooms.filter(room => (room.unread_count || 0) > 0),
    [sortedRooms]
  );

  const chatsToDisplay = useMemo(() => {
    if (filter === 'group') return { pinnedChats, groupChats, shiftChats: [], dmChats: [] };
    if (filter === 'dm') return { pinnedChats, groupChats: [], shiftChats: [], dmChats };
    if (filter === 'shift') return { pinnedChats, groupChats: [], shiftChats, dmChats: [] };
    return { pinnedChats, groupChats, shiftChats, dmChats };
  }, [filter, pinnedChats, groupChats, shiftChats, dmChats]);

  const renderUnreadAvatar = useCallback(
    (room: ChatRoom) => {
      const preview = getLatestMessage(room.id)?.body || room.last_message?.body || 'No messages yet.';
      const initials =
        getDisplayName(room)
          .split(/\s+/)
          .map(part => part[0])
          .join('')
          .slice(0, 2)
          .toUpperCase() || '?';

      return (
        <Tooltip
          key={`collapsed-unread-${room.id}`}
          title={
            <Box sx={{ maxWidth: 260 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {getDisplayName(room)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {preview}
              </Typography>
            </Box>
          }
          arrow
          placement="right"
        >
          <IconButton
            sx={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              position: 'relative',
              '&:hover': { bgcolor: 'primary.dark' },
            }}
            onClick={() =>
              onSelectRoom({ type: room.type === 'DM' ? 'dm' : 'group', id: room.id })
            }
            aria-label={`Open ${getDisplayName(room)}`}
          >
            <Typography variant="button" sx={{ fontWeight: 700 }}>
              {initials}
            </Typography>
            {(room.unread_count || 0) > 0 && (
              <Box
                sx={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 18,
                  height: 18,
                  borderRadius: '50%',
                  bgcolor: 'error.main',
                  color: 'common.white',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  px: 0.5,
                  border: theme => `2px solid ${theme.palette.background.paper}`,
                }}
              >
                {room.unread_count}
              </Box>
            )}
          </IconButton>
        </Tooltip>
      );
    },
    [getDisplayName, getLatestMessage, onSelectRoom]
  );

  return (
    <Box className={`chatpage-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <Box className="sidebar-header">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flexShrink: 1 }}>
            <Tooltip title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"} placement="right">
                <IconButton onClick={onToggleCollapse} className="sidebar-toggle-button" size="small">
                    <ChevronLeftIcon />
                </IconButton>
            </Tooltip>
            {!isCollapsed && <Typography variant="h6" fontWeight={700} noWrap>Messages</Typography>}
        </Box>
        {!isCollapsed && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                    size="small"
                    placeholder="Search (Ctrl+K)"
                    variant="outlined"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    inputRef={searchInputRef}
                    InputProps={{
                        startAdornment: (
                        <InputAdornment position="start">
                            <SearchIcon fontSize="small" />
                        </InputAdornment>
                        ),
                    }}
                    sx={{ width: '150px' }}
                />
                {canCreateChat && (
                  <IconButton
                    color="primary"
                    onClick={onNewChat}
                    sx={{ bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } }}
                  >
                      <AddIcon />
                  </IconButton>
                )}
            </Box>
        )}
      </Box>
      {isCollapsed && unreadRooms.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
            py: 2,
          }}
          aria-label="Unread conversations"
        >
          {unreadRooms.map(renderUnreadAvatar)}
        </Box>
      )}
      {!isCollapsed && (
        <Box className="sidebar-filter" sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant={filter === 'all' ? 'contained' : 'outlined'} onClick={() => setFilter('all')} aria-pressed={filter === 'all'}>
              All
            </Button>
            <Button size="small" variant={filter === 'group' ? 'contained' : 'outlined'} onClick={() => setFilter('group')} aria-pressed={filter === 'group'}>
              Group
            </Button>
            <Button size="small" variant={filter === 'dm' ? 'contained' : 'outlined'} onClick={() => setFilter('dm')} aria-pressed={filter === 'dm'}>
              DM
            </Button>
            <Button size="small" variant={filter === 'shift' ? 'contained' : 'outlined'} onClick={() => setFilter('shift')} aria-pressed={filter === 'shift'}>
              Shift
            </Button>
        </Box>
      )}
      <Box className="sidebar-list">
        {chatsToDisplay.pinnedChats.length > 0 && (
          <>
            {!isCollapsed && <Box className="sidebar-section-label">PINNED</Box>}
            {chatsToDisplay.pinnedChats.map(room => {
              const displayName = getDisplayName(room);
              const avatar = getRoomAvatar(room, displayName);
              const allowEditDelete = !room.pharmacy && isRoomAdmin(room);
              return (
                <ChatListItem
                  key={`pinned-${room.id}`}
                  room={room}
                  isActive={activeRoomId === room.id}
                  onSelect={(roomId) => onSelectRoom({ type: room.type.toLowerCase() as 'group' | 'dm', id: roomId })}
                  previewOverride={getLatestMessage(room.id)?.body}
                  displayName={displayName}
                  avatarUrl={avatar.url}
                  avatarLabel={avatar.label}
                  isCollapsed={isCollapsed}
                  currentUserId={currentUserId}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  canEditDelete={allowEditDelete}
                  onTogglePin={onTogglePinConversation}
                />
              );
            })}
            {!isCollapsed && <Divider sx={{ my: 1 }} />}
          </>
        )}
        {(shiftContacts && shiftContacts.length > 0 && filter === 'shift') ? (
          <>
            {!isCollapsed && <Box className="sidebar-section-label">SHIFTS</Box>}
            {unifiedShiftContacts.map((contact, idx) => {
              const user = contact.user || {};
              const displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'Shift Contact';
              const pharmacyLabel =
                contact.pharmacy_name ||
                (contact.pharmacies && contact.pharmacies.length
                  ? contact.pharmacies.map((p: any) => p.name).filter(Boolean).join(', ')
                  : contact.pharmacy_name);
              const avatarLabel = initialsFromParts(user.first_name, user.last_name, user.email);
              const syntheticRoom = {
                id: -100000 - idx,
                type: 'GROUP',
                title: displayName,
                pharmacy: contact.pharmacy_id,
                unread_count: 0,
                is_pinned: false,
                participant_ids: [],
                updated_at: contact.shift_date,
              } as any as ChatRoom;
              return (
                <ChatListItem
                  key={`shift-contact-${contact.pharmacy_id ?? 'none'}-${user.id}-${idx}`}
                  room={syntheticRoom}
                  isActive={false}
                  onSelect={(_id: number) => onSelectShiftContact && onSelectShiftContact(contact as any)}
                  previewOverride={pharmacyLabel}
                  displayName={displayName}
                  avatarUrl={user.profile_photo_url}
                  avatarLabel={avatarLabel}
                  isCollapsed={isCollapsed}
                  currentUserId={currentUserId}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  canEditDelete={false}
                  onTogglePin={() => {}}
                />
              );
            })}
          </>
        ) : (filter === 'shift' && chatsToDisplay.shiftChats.length > 0) && (
          <>
            {!isCollapsed && <Box className="sidebar-section-label">SHIFTS</Box>}
            {chatsToDisplay.shiftChats.map(room => {
              const displayName = getDisplayName(room);
              const avatar = getRoomAvatar(room, displayName);
              const allowEditDelete = !room.pharmacy && isRoomAdmin(room);
              return (
                <ChatListItem
                  key={`shift-${room.id}`}
                  room={room}
                  isActive={activeRoomId === room.id}
                  onSelect={(roomId) => onSelectRoom({ type: 'group', id: roomId })}
                  previewOverride={getLatestMessage(room.id)?.body}
                  displayName={displayName}
                  avatarUrl={avatar.url}
                  avatarLabel={avatar.label}
                  isCollapsed={isCollapsed}
                  currentUserId={currentUserId}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  canEditDelete={allowEditDelete}
                  onTogglePin={onTogglePinConversation}
                />
              );
            })}
            {!isCollapsed && <Divider sx={{ my: 1 }} />}
          </>
        )}
        {chatsToDisplay.groupChats.length > 0 && (
          <>
            {!isCollapsed && <Box className="sidebar-section-label">MY COMMUNITY</Box>}
            {chatsToDisplay.groupChats.map(room => {
              const displayName = getDisplayName(room);
              const avatar = getRoomAvatar(room, displayName);
              const allowEditDelete = !room.pharmacy && isRoomAdmin(room);
              return (
                <ChatListItem
                  key={`group-${room.id}`}
                  room={room}
                  isActive={activeRoomId === room.id}
                  onSelect={(roomId) => onSelectRoom({ type: 'group', id: roomId })}
                  previewOverride={getLatestMessage(room.id)?.body}
                  displayName={displayName}
                  avatarUrl={avatar.url}
                  avatarLabel={avatar.label}
                  isCollapsed={isCollapsed}
                  currentUserId={currentUserId}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  canEditDelete={allowEditDelete}
                  onTogglePin={onTogglePinConversation}
                />
              );
            })}
          </>
        )}
        {chatsToDisplay.dmChats.length > 0 && (
          <>
            {filter === 'all' && (chatsToDisplay.groupChats.length > 0 || chatsToDisplay.pinnedChats.length > 0) && !isCollapsed && <Divider sx={{ my: 1 }} />}
            {!isCollapsed && <Box className="sidebar-section-label">DIRECT MESSAGES</Box>}
            {chatsToDisplay.dmChats.map(room => {
              const displayName = getDisplayName(room);
              const avatar = getRoomAvatar(room, displayName);
              const allowEditDelete = !room.pharmacy && isRoomAdmin(room);
              return (
                <ChatListItem
                  key={`dm-${room.id}`}
                  room={room}
                  isActive={activeRoomId === room.id}
                  onSelect={(roomId) => onSelectRoom({ type: 'dm', id: roomId })}
                  previewOverride={getLatestMessage(room.id)?.body}
                  displayName={displayName}
                  avatarUrl={avatar.url}
                  avatarLabel={avatar.label}
                  isCollapsed={isCollapsed}
                  currentUserId={currentUserId}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  canEditDelete={allowEditDelete}
                  onTogglePin={onTogglePinConversation}
                />
              );
            })}
          </>
        )}
      </Box>
    </Box>
  );
};
