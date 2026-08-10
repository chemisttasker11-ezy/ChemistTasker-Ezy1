import { useEffect, useMemo, useRef, useState, FC, useCallback, SyntheticEvent } from 'react';
import { Box, CircularProgress, Typography, Snackbar, Button } from '@mui/material';
import Alert, { AlertColor } from '@mui/material/Alert';
import ChatIcon from '@mui/icons-material/Chat';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../../../constants/api';
import { fetchWsTicket } from '../../../../utils/tokenService';
import { useAuth } from '../../../../contexts/AuthContext';
import { ChatRoom, ChatMessage, MemberCache, CachedMember } from './types';
import { ChatSidebar } from './ChatSidebar';
import { ConversationPanel } from './ConversationPanel';
import { NewChatModal } from './NewChatModal';
import './chat.css';
import {
  fetchRooms,
  fetchShiftContacts,
  fetchRoomMessagesService,
  fetchRoomMessagesByUrl,
  sendRoomMessageService,
  markRoomAsReadService,
  startDirectMessageByMembership,
  startDirectMessageByUser,
  getOrCreatePharmacyGroup,
  deleteRoomService,
  toggleRoomPinService,
  fetchChatParticipants,
  fetchMyMemberships,
  fetchMembershipsByPharmacy,
  updateMessageService,
  deleteMessageService,
  reactToMessageService,
} from '@chemisttasker/shared-core';

dayjs.extend(utc);

type Pharmacy = { id: number; name: string };
type ShiftContact = {
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
};

type RoomMessagesState = {
  messages: ChatMessage[];
  nextUrl: string | null;
  hasMore: boolean;
};

const useIsMobile = (breakpoint = 768) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);
  return isMobile;
};

const BACKEND_MEDIA_URL = API_BASE_URL.endsWith('/api') ? API_BASE_URL.slice(0, -4) : API_BASE_URL;

const makeWsTicketUrl = (path: string, ticket: string) => {
  const base = API_BASE_URL || window.location.origin;
  const url = new URL(path, base);
  url.protocol = url.protocol.replace('http', 'ws');
  if (ticket) {
    url.searchParams.set('ticket', ticket);
  }
  return url.toString();
};

type ChatPageProps = {
  initialFilter?: 'all' | 'group' | 'dm' | 'shift';
};

const ChatPage: FC<ChatPageProps> = ({ initialFilter }) => {
  const { user, refreshUnreadCount, isAdminUser } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [myMemberships, setMyMemberships] = useState<any[]>([]);
  const [memberCache, setMemberCache] = useState<MemberCache>({});
  const [shiftContacts, setShiftContacts] = useState<ShiftContact[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [messagesMap, setMessagesMap] = useState<Record<number, RoomMessagesState>>({});
  const [myMembershipIdInActiveRoom, setMyMembershipIdInActiveRoom] = useState<number | null>(null);

  // --- FIX: Explicit loading states ---
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const isMobile = useIsMobile();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [participantCache, setParticipantCache] = useState<Record<number, CachedMember>>({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<ChatRoom | null>(null);
  const [toast, setToast] = useState<{ message: string; severity: AlertColor; roomId?: number } | null>(null);
  const [typingState, setTypingState] = useState<Record<number, string[]>>({});

  const handleToastClose = useCallback(
    (_event?: SyntheticEvent | Event, reason?: string) => {
      if (reason === 'clickaway') return;
      setToast(null);
    },
    []
  );

  const getErrorMessage = useCallback((error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) return error.message;
    return fallback;
  }, []);

  const pushToast = useCallback(
    (message: string, severity: AlertColor, roomId?: number) => {
      setToast({ message, severity, roomId });
    },
    []
  );

  const resolveRoomName = useCallback(
    (room?: ChatRoom | null): string => {
      if (!room) return 'Chat';
      if (room.type === 'GROUP') {
        if (room.pharmacy) {
          const pharmacy = pharmacies.find(p => p.id === room.pharmacy);
          if (pharmacy?.name) {
            return pharmacy.name;
          }
        }
        return room.title || 'Group Chat';
      }
      const myMembershipInRoom = myMemberships.find(m => room.participant_ids?.includes(m.id));
      if (!myMembershipInRoom) {
        return room.title || 'Direct Message';
      }
      const partnerMembershipId = room.participant_ids?.find(id => id !== myMembershipInRoom.id);
      if (partnerMembershipId) {
        const cachedParticipant = participantCache[partnerMembershipId]?.details;
        if (cachedParticipant) {
          const fullName = `${cachedParticipant.first_name || ''} ${cachedParticipant.last_name || ''}`.trim();
          return fullName || cachedParticipant.email || 'Direct Message';
        }
        for (const pharmacyId in memberCache) {
          const member = memberCache[Number(pharmacyId)]?.[partnerMembershipId];
          if (member?.details) {
            const details = member.details;
            const fullName = `${details.first_name || ''} ${details.last_name || ''}`.trim();
            return fullName || details.email || 'Direct Message';
          }
        }
      }
      return room.title || 'Direct Message';
    },
    [pharmacies, myMemberships, participantCache, memberCache]
  );

  const lastTypingSentRef = useRef(false);

  const sendTypingUpdate = useCallback(
    (isTyping: boolean) => {
      const socket = wsRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      if (lastTypingSentRef.current === isTyping) return;
      try {
        socket.send(JSON.stringify({ type: 'typing', is_typing: isTyping }));
        lastTypingSentRef.current = isTyping;
      } catch (error) {
        console.error('Failed to send typing event', error);
      }
    },
    []
  );

  const canCreateChat = useMemo(() => {
    if (!user) return false;
    if (['OWNER', 'ORG_ADMIN'].includes(user.role)) return true;
    return isAdminUser;
  }, [user, isAdminUser]);

  useEffect(() => {
    const loadInitial = async () => {
      setIsLoading(true);
      try {
        const [memberships, roomsList, participants, shifts] = await Promise.all([
          fetchMyMemberships({}),
          fetchRooms(),
          fetchChatParticipants(),
          fetchShiftContacts(),
        ]);

        const pCache = participants.reduce((acc: Record<number, CachedMember>, participant: any) => {
          const details = participant.userDetails || participant.user_details || participant.user || {};
          acc[participant.id] = {
            details: {
              id: details.id,
              first_name: details.first_name ?? details.firstName ?? null,
              last_name: details.last_name ?? details.lastName ?? null,
              email: details.email ?? null,
              profile_photo_url: details.profile_photo_url ?? details.profilePhotoUrl ?? null,
            },
            role: participant.role ?? '',
            employment_type: participant.employmentType ?? '',
            invited_name: participant.invitedName,
            is_admin: participant.isAdmin,
          };
          return acc;
        }, {});
        setParticipantCache(pCache);

        setMyMemberships(memberships);

        const uniquePharmacies = new Map<number, Pharmacy>();
        memberships.forEach((membership: any) => {
          const detail = membership.pharmacyDetail;
          if (detail) {
            uniquePharmacies.set(detail.id, { id: detail.id, name: detail.name });
          }
        });
        const pharms = Array.from(uniquePharmacies.values());
        setPharmacies(pharms);

        const cacheParts = await Promise.all(
          pharms.map(async (pharmacy) => {
            const items = await fetchMembershipsByPharmacy(pharmacy.id);
            const map = items.reduce((acc: Record<number, CachedMember>, m: any) => {
              const details = m.userDetails || m.user_details || m.user || {};
              acc[m.id] = {
                details: {
                  id: details.id,
                  first_name: details.first_name ?? details.firstName ?? null,
                  last_name: details.last_name ?? details.lastName ?? null,
                  email: details.email ?? null,
                  profile_photo_url: details.profile_photo_url ?? details.profilePhotoUrl ?? null,
                },
                role: m.role ?? '',
                employment_type: m.employmentType ?? '',
                invited_name: m.invitedName ?? m.invited_name ?? undefined,
              };
              return acc;
            }, {});
            return { pid: pharmacy.id, map };
          }),
        );
        setMemberCache(Object.fromEntries(cacheParts.map(({ pid, map }) => [pid, map])));
        setShiftContacts((shifts as any) || []);

        const initialRooms = [...roomsList].sort(
          (a, b) => dayjs.utc(b.updated_at || 0).valueOf() - dayjs.utc(a.updated_at || 0).valueOf(),
        );
        setRooms(initialRooms);
      } catch (e) {
        console.error('loadInitial error', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadInitial();
  }, []);


  useEffect(() => {
    return () => {
      if (lastTypingSentRef.current) {
        sendTypingUpdate(false);
        lastTypingSentRef.current = false;
      }
    };
  }, [activeRoomId, sendTypingUpdate]);

  useEffect(() => {
    if (!activeRoomId) return;

    setTypingState(prev => {
      if (prev[activeRoomId]) {
        return { ...prev, [activeRoomId]: [] };
      }
      return prev;
    });

    if (messagesMap[activeRoomId]) {
      markRoomAsReadService(activeRoomId).catch(() => { });
      return;
    };

    const run = async () => {
      setIsLoadingMessages(true); // <-- FIX: Set loading ON
      try {
        const { messages, next } = await fetchRoomMessagesService(activeRoomId);
        const mappedMessages = messages
          .reverse()
          .map((msg: ChatMessage) =>
            msg.attachment_url && msg.attachment_url.startsWith('/')
              ? { ...msg, attachment_url: `${BACKEND_MEDIA_URL}${msg.attachment_url}` }
              : msg,
          );

        setMessagesMap((prev) => ({
          ...prev,
          [activeRoomId]: {
            messages: mappedMessages,
            nextUrl: next ?? null,
            hasMore: Boolean(next),
          },
        }));
      } catch (e) {
        console.error('fetch messages error', e);
      } finally {
        setIsLoadingMessages(false); // <-- FIX: Set loading OFF
      }
    };

    run();
  }, [activeRoomId]);

  // Keep my membership id for the active room in sync without re-triggering the websocket effect.
  useEffect(() => {
    const nextId = rooms.find(r => r.id === activeRoomId)?.my_membership_id || null;
    setMyMembershipIdInActiveRoom(prev => (prev === nextId ? prev : nextId));
  }, [rooms, activeRoomId]);

  useEffect(() => {
    let isCancelled = false;
    if (wsRef.current) wsRef.current.close();
    if (!activeRoomId || !user) return;

    const setupWs = async () => {
      const ticket = await fetchWsTicket();
      if (isCancelled || !ticket) return;

      const ws = new WebSocket(makeWsTicketUrl(`/ws/chat/rooms/${activeRoomId}/`, ticket));
      wsRef.current = ws;

      ws.onopen = () => {
        markRoomAsReadService(activeRoomId)
          .then((newLastRead) => {
            if (isCancelled) return;
            setRooms((prev) =>
              prev.map((r) =>
                r.id === activeRoomId ? { ...r, unread_count: 0, my_last_read_at: newLastRead ?? null } : r,
              ),
            );
            refreshUnreadCount();
          })
          .catch(() => { });
      };

      ws.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data);
          if (payload.type === 'ready' && payload.membership) {
            // Only set once; avoid triggering websocket re-creations
            setMyMembershipIdInActiveRoom(prev => prev ?? payload.membership);
            return;
          }
          if (payload.type === 'message.created') {
            const newMsg: ChatMessage = payload.message;
            if (newMsg.attachment_url && newMsg.attachment_url.startsWith('/')) {
              newMsg.attachment_url = `${BACKEND_MEDIA_URL}${newMsg.attachment_url}`;
            }
            let toastRoomName: string | null = null;
            setMessagesMap(prevMap => {
              const current = prevMap[newMsg.conversation]?.messages || [];
              if (current.some(m => m.id === newMsg.id)) return prevMap;
              const currentRoomState = prevMap[newMsg.conversation] || { messages: [], hasMore: false, nextUrl: null };
              return {
                ...prevMap,
                [newMsg.conversation]: { ...currentRoomState, messages: [...current, newMsg] },
              };
            });
            setRooms(prevRooms => {
              if (!prevRooms.some(r => r.id === newMsg.conversation)) {
                return prevRooms;
              }
              const updatedRooms = prevRooms.map(r => {
                if (r.id === newMsg.conversation) {
                  const isUnread = newMsg.conversation !== activeRoomId;
                  return {
                    ...r,
                    last_message: { id: newMsg.id, body: newMsg.body, created_at: newMsg.created_at, sender: newMsg.sender?.id ?? 0 },
                    unread_count: isUnread ? (r.unread_count || 0) + 1 : 0,
                    updated_at: newMsg.created_at,
                  };
                }
                return r;
              });
              const sorted = [...updatedRooms].sort((a, b) => dayjs.utc(b.updated_at || 0).valueOf() - dayjs.utc(a.updated_at || 0).valueOf());
              if (newMsg.conversation !== activeRoomId) {
                const targetRoom = sorted.find(r => r.id === newMsg.conversation);
                toastRoomName = resolveRoomName(targetRoom);
              }
              return sorted;
            });
            if (newMsg.conversation !== activeRoomId) {
              refreshUnreadCount();
              if (toastRoomName) {
                pushToast(`New message in ${toastRoomName}`, 'info', newMsg.conversation);
              }
            }
            return;
          }
          if (payload.type === 'message.updated') {
            const updatedMsg: ChatMessage = payload.message;
            setMessagesMap(prevMap => {
              const roomState = prevMap[updatedMsg.conversation];
              if (!roomState) return prevMap;
              const updatedMessages = roomState.messages.map(m => m.id === updatedMsg.id ? updatedMsg : m);
              return { ...prevMap, [updatedMsg.conversation]: { ...roomState, messages: updatedMessages } };
            });
            return;
          }
          if (payload.type === 'message.deleted') {
            const { message_id } = payload;
            setMessagesMap(prevMap => {
              let targetRoomId: number | null = null;
              for (const roomId in prevMap) {
                if (prevMap[roomId].messages.some(m => m.id === message_id)) {
                  targetRoomId = parseInt(roomId);
                  break;
                }
              }
              if (!targetRoomId) return prevMap;
              const roomState = prevMap[targetRoomId];
              const updatedMessages = roomState.messages.map(m =>
                m.id === message_id ? { ...m, is_deleted: true } : m
              );
              return { ...prevMap, [targetRoomId]: { ...roomState, messages: updatedMessages } };
            });
            return;
          }
          if (payload.type === 'reaction.updated') {
            const { message_id, reactions } = payload;
            setMessagesMap(prevMap => {
              let targetRoomId: number | null = null;
              for (const roomId in prevMap) {
                if (prevMap[roomId].messages.some(m => m.id === message_id)) {
                  targetRoomId = parseInt(roomId);
                  break;
                }
              }
              if (!targetRoomId) return prevMap;
              const roomState = prevMap[targetRoomId];
              const updatedMessages = roomState.messages.map(m =>
                m.id === message_id ? { ...m, reactions: reactions } : m
              );
              return {
                ...prevMap,
                [targetRoomId]: { ...roomState, messages: updatedMessages }
              };
            });
            return;
          }
          if (payload.type === 'typing') {
            const roomId =
              payload.conversation_id ??
              payload.conversation ??
              payload.room_id ??
              null;
            if (typeof roomId === 'number') {
              if (payload.user_id && user?.id && Number(payload.user_id) === Number(user.id)) {
                return;
              }
              const name = (payload.name || '').trim();
              setTypingState(prev => {
                const existing = prev[roomId] ?? [];
                const nextSet = new Set(existing);
                if (payload.is_typing) {
                  if (name) nextSet.add(name);
                } else {
                  if (name) {
                    nextSet.delete(name);
                  } else {
                    nextSet.clear();
                  }
                }
                const nextNames = Array.from(nextSet);
                if (nextNames.length === 0) {
                  const { [roomId]: _omit, ...rest } = prev;
                  return rest;
                }
                return { ...prev, [roomId]: nextNames };
              });
            }
            return;
          }
        } catch (e) { console.error('ws onmessage error', e); }
      };
      ws.onerror = (_err) => { };
      ws.onclose = () => {
        lastTypingSentRef.current = false;
      };

    };

    setupWs();

    return () => {
      isCancelled = true;
      if (wsRef.current) wsRef.current.close();
    };
  }, [activeRoomId, refreshUnreadCount, resolveRoomName, pushToast, user?.id]);


  useEffect(() => {
    const startDmWithUser = searchParams.get('startDmWithUser');

    if (startDmWithUser) {
      const partnerUserId = Number(startDmWithUser);

      startDirectMessageByUser(partnerUserId)
        .then((room) => {
          setRooms((prevRooms) => {
            if (prevRooms.some((r) => r.id === room.id)) {
              return prevRooms;
            }
            return [room, ...prevRooms];
          });
          setActiveRoomId(room.id);
        })
        .catch((err) => {
          console.error('Failed to start DM from URL', err);
          const message = err instanceof Error ? err.message : 'Could not start the chat.';
          pushToast(message, 'error');
        })
        .finally(() => {
          searchParams.delete('startDmWithUser');
          setSearchParams(searchParams);
        });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const raw =
      searchParams.get('conversationId') ||
      searchParams.get('conversation_id') ||
      searchParams.get('roomId');
    if (!raw) return;
    const roomId = Number(raw);
    if (!Number.isFinite(roomId)) {
      searchParams.delete('conversationId');
      searchParams.delete('conversation_id');
      searchParams.delete('roomId');
      setSearchParams(searchParams);
      return;
    }
    if (rooms.some((room) => room.id === roomId) || !isLoading) {
      setActiveRoomId(roomId);
      searchParams.delete('conversationId');
      searchParams.delete('conversation_id');
      searchParams.delete('roomId');
      setSearchParams(searchParams);
    }
  }, [rooms, isLoading, searchParams, setSearchParams]);

  const handleSendText = async (body: string) => {
    const targetRoom = activeRoomId ? rooms.find(r => r.id === activeRoomId) : null;
    if (!targetRoom) {
      pushToast('Select or create a conversation first.', 'error');
      return;
    }
    try {
      await sendRoomMessageService(targetRoom.id, { body });
      // Rely on the websocket message.created event to update UI (prevents sender duplicates)
    } catch (e) {
      console.error('send text error', e);
      setToast({ message: getErrorMessage(e, 'Failed to send message'), severity: 'error' });
    }
  };

  const handleSendAttachment = async (files: File[], body?: string) => {
    if (!activeRoomId) return;
    try {
      const form = new FormData();
      if (body) form.append('body', body);
      files.forEach(file => {
        form.append('attachment', file);
      });
      await sendRoomMessageService(activeRoomId, form);
      // Rely on websocket delivery to render the attachment once created
    } catch (e) {
      console.error('send attachment error', e);
      setToast({ message: getErrorMessage(e, 'Failed to send attachment'), severity: 'error' });
    }
  };

  const handleLoadMore = async () => {
    if (!activeRoomId || isLoadingMore) return;
    const roomState = messagesMap[activeRoomId];
    if (!roomState || !roomState.hasMore || !roomState.nextUrl) return;
    setIsLoadingMore(true);
    try {
      const { messages, next } = await fetchRoomMessagesByUrl(roomState.nextUrl);
      const mappedMessages = messages.reverse().map((msg: ChatMessage) =>
        msg.attachment_url && msg.attachment_url.startsWith('/')
          ? { ...msg, attachment_url: `${BACKEND_MEDIA_URL}${msg.attachment_url}` }
          : msg,
      );
      setMessagesMap(prev => {
        const currentRoom = prev[activeRoomId];
        return {
          ...prev,
          [activeRoomId]: {
            messages: [...mappedMessages, ...currentRoom.messages],
            nextUrl: next ?? null,
            hasMore: Boolean(next),
          }
        };
      });
    } catch (e) {
      console.error("Failed to load more messages", e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleStartDm = async (partnerMembershipId: number, partnerPharmacyId: number) => {
    const partnerDetails = memberCache[partnerPharmacyId]?.[partnerMembershipId]?.details;
    if (!partnerDetails || !user) {
      pushToast('Could not find user details to start chat.', 'error');
      return;
    }
    const partnerUserId = partnerDetails.id;

    setParticipantCache(prev => {
      if (prev[partnerMembershipId]) return prev;
      const entry = memberCache[partnerPharmacyId]?.[partnerMembershipId];
      if (!entry) return prev;
      return { ...prev, [partnerMembershipId]: { ...entry } };
    });

    const findExistingDm = (targetUserId: number) => {
      for (const room of rooms) {
        if (room.type === 'DM' && room.participant_ids.length === 2) {
          const myMem = myMemberships.find(m => room.participant_ids.includes(m.id));
          const partnerMemId = room.participant_ids.find(id => id !== myMem?.id);

          if (partnerMemId && participantCache[partnerMemId]) {
            const partnerInRoom = participantCache[partnerMemId].details;
            if (partnerInRoom.id === targetUserId) {
              return room;
            }
          }
        }
      }
      return null;
    };

    const existingRoom = findExistingDm(partnerUserId);

    if (existingRoom) {
      setActiveRoomId(existingRoom.id);
    } else {
      try {
        const room = await startDirectMessageByMembership(partnerMembershipId, null);
        handleSaveRoom(room);
        setActiveRoomId(room.id);
        pushToast(`Direct message with ${resolveRoomName(room)} ready`, 'success', room.id);
      } catch (e) {
        console.error('Failed to get or create DM', e);
        const message = e instanceof Error ? e.message : 'Could not start the chat.';
        pushToast(message, 'error');
      }
    }
  };

  const resolveUserIdFromMembership = useCallback(
    (membershipId: number | null | undefined): number | undefined => {
      if (!membershipId) return undefined;
      const cached = participantCache[membershipId]?.details;
      if (cached?.id) return cached.id;
      for (const pid in memberCache) {
        const rec = memberCache[Number(pid)]?.[membershipId]?.details;
        if (rec?.id) return rec.id;
      }
      return undefined;
    },
    [participantCache, memberCache],
  );

  const handleSelectRoom = async (d: { type: 'dm' | 'group'; id: number } | { type: 'pharmacy'; id: number }) => {
    if ('type' in d && d.type === 'pharmacy') {
      const existing = rooms.find(r => r.type === 'GROUP' && r.pharmacy === d.id);
      if (existing) { setActiveRoomId(existing.id); return; }
      try {
        const room = await getOrCreatePharmacyGroup(d.id);
        const enrichedRoom = (room as any).created_by_user_id
          ? room
          : { ...(room as any), created_by_user_id: user?.id ?? (room as any)?.created_by ?? (room as any)?.createdBy };
        setRooms(prev => (prev.some(r => r.id === enrichedRoom.id) ? prev : [enrichedRoom, ...prev]));
        setActiveRoomId(enrichedRoom.id);
      } catch (e) { console.error('get-or-create-group error', e); }
      return;
    }
    setActiveRoomId(d.id);
  };

  const handleSelectShiftContact = async (contact: ShiftContact) => {
    const partnerUserId = contact.user.id;

    // Try to find an existing DM with this user.
    const existingDm = rooms.find((room) => {
      if (room.type !== 'DM' || !Array.isArray(room.participant_ids)) return false;
      // Prefer the non-me participant if my_membership_id is known.
      const partnerMembershipId = room.participant_ids.find((id) => id !== room.my_membership_id);
      const partnerId = resolveUserIdFromMembership(partnerMembershipId);
      if (partnerId && partnerId === partnerUserId) return true;
      // Fallback: scan all participant memberships for a matching user id.
      for (const mid of room.participant_ids) {
        const uid = resolveUserIdFromMembership(mid);
        if (uid === partnerUserId) return true;
      }
      return false;
    });
    if (existingDm) {
      await handleSelectRoom({ type: 'dm', id: existingDm.id });
      return;
    }

    try {
      const room = await startDirectMessageByUser(partnerUserId);
      handleSaveRoom(room);
      await handleSelectRoom({ type: 'dm', id: room.id });
    } catch (error) {
      console.error('Failed to open shift contact chat', error);
      pushToast('Could not open chat for this shift contact', 'error');
    }
  };

  const handleEditMessage = async (messageId: number, newBody: string) => {
    try {
      await updateMessageService(messageId, newBody);
    } catch (e) {
      console.error('Failed to edit message', e);
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    if (window.confirm('Are you sure you want to delete this message? This cannot be undone.')) {
      try {
        await deleteMessageService(messageId);
      } catch (e) {
        console.error('Failed to delete message', e);
      }
    }
  };

  const handleReact = async (messageId: number, reaction: string) => {
    try {
      await reactToMessageService(messageId, reaction);
    } catch (e) {
      console.error('Failed to send reaction', e);
    }
  };

  const handleTogglePin = async (roomId: number, target: 'conversation' | 'message', messageId?: number) => {
    try {
      // API expects snake_case for message_id
      const body: any = { target };
      if (target === 'message') {
        body.message_id = messageId;
      }
      const response = await toggleRoomPinService(roomId, body);

      // Optimistically update the UI
      setRooms(prevRooms => {
        return prevRooms.map(room => {
          if (room.id !== roomId) return room;
          if (target === 'conversation') {
            const isPinned = typeof response?.is_pinned === 'boolean' ? response.is_pinned : room.is_pinned;
            return { ...room, is_pinned: isPinned };
          }
          // message pin returns updated room (with pinned_message)
          return response?.id ? response : room;
        });
      });

      if (target === 'message') {
        // Update pinned_message and message flags in the active room state
        const pinnedId = response?.pinned_message?.id ?? null;
        setMessagesMap(prev => {
          const roomState = prev[roomId];
          if (!roomState) return prev;
          return {
            ...prev,
            [roomId]: {
              ...roomState,
              messages: roomState.messages.map(m => ({
                ...m,
                is_pinned: m.id === pinnedId,
              })),
            },
          };
        });

        // Also ensure the active room object carries the updated pinned_message immediately
        setRooms(prev => prev.map(r => (r.id === roomId && response?.id ? response : r)));
      }
    } catch (e) {
      console.error('Failed to toggle pin', e);
      pushToast('Unable to update pin state. Please try again.', 'error');
    }
  };

  const handleOpenEditModal = (room: ChatRoom) => {
    setEditingRoom(room);
    setIsModalOpen(true);
  };

  const handleDeleteChat = async (roomId: number, roomName: string) => {
    const target = rooms.find(r => r.id === roomId);
    if (!target) return;

    const isDm = target.type === 'DM';
    const question = isDm
      ? `Delete this direct message with "${roomName}" for you? The other person will keep the conversation.`
      : `Are you sure you want to delete the chat "${roomName}" for everyone? This cannot be undone.`;

    if (!window.confirm(question)) return;

    try {
      await deleteRoomService(roomId);

      setRooms(prevRooms => prevRooms.filter(r => r.id !== roomId));
      if (activeRoomId === roomId) {
        setActiveRoomId(null);
      }
      pushToast(`${roomName} deleted`, 'success');
    } catch (e) {
      console.error('Failed to delete chat', e);
      pushToast('Failed to delete chat.', 'error');
    }
  };


  const handleSaveRoom = (savedRoom: ChatRoom) => {
    // Ensure creator id is present locally when we know it (helps UI permissions)
    const creatorId =
      (savedRoom as any).created_by_user_id ??
      (savedRoom as any).createdByUserId ??
      (savedRoom as any).created_by ??
      (savedRoom as any).createdBy ??
      user?.id;
    const enrichedRoom =
      creatorId && !(savedRoom as any).created_by_user_id ? { ...(savedRoom as any), created_by_user_id: creatorId } : savedRoom;

    setRooms(prevRooms => {
      const roomExists = prevRooms.some(room => room.id === enrichedRoom.id);
      if (roomExists) {
        const updatedRooms = prevRooms.map(r => (r.id === enrichedRoom.id ? enrichedRoom : r));
        return [...updatedRooms].sort((a, b) => dayjs.utc(b.updated_at || 0).valueOf() - dayjs.utc(a.updated_at || 0).valueOf());
      }
      const newRooms = [enrichedRoom, ...prevRooms];
      return newRooms.sort((a, b) => dayjs.utc(b.updated_at || 0).valueOf() - dayjs.utc(a.updated_at || 0).valueOf());
    });
    setActiveRoomId(enrichedRoom.id);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTimeout(() => setEditingRoom(null), 300);
  };

  const activeRoom = rooms.find(r => r.id === activeRoomId) || null;
  const activeTypingMembers = activeRoomId ? typingState[activeRoomId] ?? [] : [];
  const activeRoomMessagesState = activeRoom ? (messagesMap[activeRoom.id] || { messages: [], hasMore: false, nextUrl: null }) : { messages: [], hasMore: false, nextUrl: null };

  const showConversation = isMobile ? !!activeRoomId : true;
  const rootClassName = `chatpage-root ${isMobile && activeRoomId ? 'mobile-conversation-active' : ''} ${isSidebarCollapsed ? 'sidebar-collapsed-view' : ''}`;

  if (isLoading) { return (<Box className="chatpage-loading"><CircularProgress /></Box>); }

  return (
    <Box className={rootClassName}>
      <ChatSidebar
        rooms={rooms}
        pharmacies={pharmacies}
        myMemberships={myMemberships}
        activeRoomId={activeRoomId}
        onSelectRoom={handleSelectRoom}
        participantCache={participantCache}
        memberCache={memberCache}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
        onNewChat={() => setIsModalOpen(true)}
        onEdit={handleOpenEditModal}
        onDelete={handleDeleteChat}
        onTogglePinConversation={(roomId) => handleTogglePin(roomId, 'conversation')}
        canCreateChat={canCreateChat}
        currentUserId={user?.id}
        initialFilter={initialFilter}
        shiftContacts={shiftContacts}
        onSelectShiftContact={handleSelectShiftContact}
        getLatestMessage={(roomId) => {
          const roomState = messagesMap[roomId];
          const arr = roomState?.messages;
          return arr && arr.length ? arr[arr.length - 1] : undefined;
        }}
      />

      {showConversation ? (
        activeRoom ? (
          <ConversationPanel
            key={activeRoom.id}
            activeRoom={activeRoom}
            pharmacies={pharmacies}
            messages={activeRoomMessagesState.messages}
            myMemberships={myMemberships}
            myMembershipId={myMembershipIdInActiveRoom ?? undefined}
            currentUserId={user?.id}
            participantCache={participantCache}
            memberCache={memberCache}
            shiftContacts={shiftContacts}
            onSendText={handleSendText}
            onSendAttachment={handleSendAttachment}
            isLoadingMessages={isLoadingMessages} // <-- FIX: Use explicit loading state
            onStartDm={(partnerMembershipId) => {
              for (const pharmId in memberCache) {
                if (memberCache[pharmId][partnerMembershipId]) {
                  handleStartDm(partnerMembershipId, Number(pharmId));
                  return;
                }
              }
            }}
            hasMore={activeRoomMessagesState.hasMore}
            isLoadingMore={isLoadingMore}
            onLoadMore={handleLoadMore}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onReact={handleReact}
            onTogglePin={(target, messageId) => handleTogglePin(activeRoom.id, target, messageId)}
            isMobile={isMobile}
            onBack={() => setActiveRoomId(null)}
            onTyping={sendTypingUpdate}
            onNotify={(severity, message) => pushToast(message, severity)}
            typingMembers={activeTypingMembers}
          />
        ) : (
          !isMobile && (
            <Box className="chatpage-empty">
              <ChatIcon sx={{ fontSize: 64, mb: 1, color: 'grey.400' }} />
              <Box>
                <Typography variant="h5" fontWeight={700} color="text.secondary">Welcome to Chemist Tasker Chat</Typography>
                <Typography color="text.secondary" sx={{ mt: .5 }}>Select a conversation to start chatting.</Typography>
              </Box>
            </Box>
          )
        )
      ) : null}

      <NewChatModal
        open={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveRoom}
        pharmacies={pharmacies}
        memberCache={memberCache}
        currentUserId={user?.id}
        editingRoom={editingRoom}
        onDmSelect={handleStartDm}
        onNotify={(severity, message) => pushToast(message, severity)}
      />
      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={handleToastClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert
            onClose={handleToastClose}
            severity={toast.severity}
            sx={{ width: '100%' }}
            action={
              toast.roomId ? (
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    setActiveRoomId(toast.roomId!);
                    setToast(null);
                  }}
                >
                  Open
                </Button>
              ) : undefined
            }
          >
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
};

export { ChatPage };
export default ChatPage;
