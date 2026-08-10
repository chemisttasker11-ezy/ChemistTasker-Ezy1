import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { Text, TextInput, IconButton, Surface, ActivityIndicator, Menu, Divider, Snackbar, Avatar } from 'react-native-paper';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import {
    getRoomMessages,
    sendRoomMessageService,
    markRoomAsRead,
    reactToMessageService,
    updateMessageService,
    deleteMessageService,
    toggleRoomPinService,
    fetchChatParticipants,
    fetchShiftContacts,
    type ChatMessage,
} from '@chemisttasker/shared-core';
import { useAuth } from '../../../context/AuthContext';
import { useLiveMessages } from './useLiveMessages';
import debounce from 'lodash.debounce';
import { useFocusEffect } from '@react-navigation/native';
import { triggerUnreadBump } from '@/utils/pushNotifications';
import { setActiveRoomId } from '../chat/activeRoomState';
import { displayNameFromUser } from '../chat/displayName';

type MessageDisplay = ChatMessage & { is_me: boolean };
type ChatIdentity = {
    id?: number;
    first_name?: string | null;
    firstName?: string | null;
    last_name?: string | null;
    lastName?: string | null;
    email?: string | null;
    profile_photo_url?: string | null;
    profilePhotoUrl?: string | null;
    profile_photo?: string | null;
    profilePhoto?: string | null;
};
type IdentityRecord = { details: ChatIdentity; invited_name?: string | null };

const messageKey = (item: MessageDisplay) => item.id ?? `${item.created_at}-${item.body}`;
const messageTime = (item: MessageDisplay) => {
    const time = item.created_at ? new Date(item.created_at).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
};
const senderMembershipIdOf = (item: MessageDisplay) => {
    const sender: any = item.sender;
    return typeof sender?.id === 'number' ? sender.id : null;
};
const senderUserIdOf = (item: MessageDisplay) => {
    const sender: any = item.sender;
    return sender?.user_details?.id ?? sender?.user?.id ?? null;
};
const senderPayloadIdentityOf = (item: MessageDisplay): ChatIdentity => {
    const sender: any = item.sender;
    return sender?.user_details || sender?.user || sender || {};
};
const photoOf = (identity?: ChatIdentity | null) => {
    return identity?.profile_photo_url || identity?.profilePhotoUrl || identity?.profile_photo || identity?.profilePhoto || null;
};
const hasName = (identity?: ChatIdentity | null) => {
    return Boolean(`${identity?.first_name || identity?.firstName || ''} ${identity?.last_name || identity?.lastName || ''}`.trim());
};
const initialsOf = (name: string) => {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const upsertSortedMessage = (list: MessageDisplay[], incoming: MessageDisplay) => {
    const key = messageKey(incoming);
    const existingIndex = list.findIndex((msg) => messageKey(msg) === key);
    if (existingIndex >= 0) {
        const next = [...list];
        next[existingIndex] = { ...next[existingIndex], ...incoming };
        return next;
    }

    const next = [...list];
    const incomingTime = messageTime(incoming);
    if (next.length === 0 || incomingTime >= messageTime(next[next.length - 1])) {
        next.push(incoming);
        return next;
    }

    const insertAt = next.findIndex((msg) => messageTime(msg) > incomingTime);
    if (insertAt === -1) {
        next.push(incoming);
    } else {
        next.splice(insertAt, 0, incoming);
    }
    return next;
};

const updateMessageById = (list: MessageDisplay[], messageId: number, updater: (msg: MessageDisplay) => MessageDisplay) => {
    const index = list.findIndex((msg) => msg.id === messageId);
    if (index === -1) return list;
    const next = [...list];
    next[index] = updater(next[index]);
    return next;
};

export default function SharedMessageDetailScreen() {
    const { id, name } = useLocalSearchParams();
    const router = useRouter();
    const { user, access } = useAuth();
    const insets = useSafeAreaInsets();

    const [messages, setMessages] = useState<MessageDisplay[]>([]);
    const [participantCache, setParticipantCache] = useState<Record<number, IdentityRecord>>({});
    const [shiftContactByUserId, setShiftContactByUserId] = useState<Record<number, ChatIdentity>>({});
    const [newMessage, setNewMessage] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [menuFor, setMenuFor] = useState<number | null>(null);
    const [snackbar, setSnackbar] = useState<string | null>(null);
    const [roomPinned, setRoomPinned] = useState<boolean>(false);
    const [typingUsernames, setTypingUsernames] = useState<string[]>([]);
    const typingSentRef = useRef(0);
    const [lastReadAt, setLastReadAt] = useState<string | null>(null);
    const shouldScrollRef = useRef<boolean>(false);

    const parseRoomId = useCallback(() => {
        if (Array.isArray(id)) return parseInt(id[0], 10);
        if (typeof id === 'string') return parseInt(id, 10);
        return typeof id === 'number' ? id : NaN;
    }, [id]);

    const flatListRef = useRef<FlatList<MessageDisplay>>(null);

    useEffect(() => {
        let mounted = true;
        const loadIdentityCaches = async () => {
            try {
                const [participantsData, shiftData] = await Promise.all([
                    fetchChatParticipants(),
                    fetchShiftContacts(),
                ]);
                if (!mounted) return;

                const participants = Array.isArray((participantsData as any)?.results)
                    ? (participantsData as any).results
                    : Array.isArray(participantsData)
                        ? (participantsData as any)
                        : [];
                const nextParticipantCache: Record<number, IdentityRecord> = {};
                participants.forEach((participant: any) => {
                    const membershipId = participant.id ?? participant.membership_id;
                    if (!membershipId) return;
                    const details = participant.userDetails || participant.user_details || participant.user || {};
                    nextParticipantCache[Number(membershipId)] = {
                        details: {
                            id: typeof details.id === 'number' ? details.id : undefined,
                            first_name: details.first_name ?? details.firstName ?? null,
                            firstName: details.firstName ?? details.first_name ?? null,
                            last_name: details.last_name ?? details.lastName ?? null,
                            lastName: details.lastName ?? details.last_name ?? null,
                            email: details.email ?? null,
                            profile_photo_url: details.profile_photo_url ?? details.profilePhotoUrl ?? null,
                            profilePhotoUrl: details.profilePhotoUrl ?? details.profile_photo_url ?? null,
                        },
                        invited_name: participant.invitedName ?? participant.invited_name ?? null,
                    };
                });
                setParticipantCache(nextParticipantCache);

                const shiftContacts = Array.isArray((shiftData as any)?.results)
                    ? (shiftData as any).results
                    : Array.isArray(shiftData)
                        ? (shiftData as any)
                        : [];
                const nextShiftMap: Record<number, ChatIdentity> = {};
                shiftContacts.forEach((contact: any) => {
                    const contactUser = contact?.user;
                    if (!contactUser?.id) return;
                    const existing = nextShiftMap[contactUser.id];
                    if (!existing || (!photoOf(existing) && photoOf(contactUser))) {
                        nextShiftMap[contactUser.id] = contactUser;
                    }
                });
                setShiftContactByUserId(nextShiftMap);
            } catch {
                // Identity caches are best effort; message payload remains as fallback.
            }
        };
        void loadIdentityCaches();
        return () => {
            mounted = false;
        };
    }, []);

    const resolveMessageIdentity = useCallback(
        (item: MessageDisplay): ChatIdentity => {
            const membershipId = senderMembershipIdOf(item);
            const userId = senderUserIdOf(item);
            const payloadIdentity = senderPayloadIdentityOf(item);
            const byMembership = membershipId ? participantCache[membershipId]?.details : null;
            const byShift = userId ? shiftContactByUserId[userId] : null;
            const source =
                (byMembership && (photoOf(byMembership) || hasName(byMembership)) ? byMembership : null) ||
                (byShift && (photoOf(byShift) || hasName(byShift)) ? byShift : null) ||
                payloadIdentity;

            return {
                ...payloadIdentity,
                ...byMembership,
                ...byShift,
                first_name: source.first_name ?? source.firstName ?? payloadIdentity.first_name ?? null,
                firstName: source.firstName ?? source.first_name ?? payloadIdentity.firstName ?? null,
                last_name: source.last_name ?? source.lastName ?? payloadIdentity.last_name ?? null,
                lastName: source.lastName ?? source.last_name ?? payloadIdentity.lastName ?? null,
                profile_photo_url: photoOf(source) || photoOf(payloadIdentity),
                profilePhotoUrl: photoOf(source) || photoOf(payloadIdentity),
            };
        },
        [participantCache, shiftContactByUserId],
    );

    const senderNameOf = useCallback(
        (item: MessageDisplay) => {
            const identity = resolveMessageIdentity(item);
            const name = displayNameFromUser(identity as any);
            return name && name !== identity.email ? name : `Member ${senderMembershipIdOf(item) ?? ''}`.trim();
        },
        [resolveMessageIdentity],
    );

    const fetchMessages = useCallback(async () => {
        const roomId = parseRoomId();
        if (!roomId) return;
        try {
            const data = await getRoomMessages(roomId);
            const list = Array.isArray((data as any)?.results)
                ? (data as any).results
                : Array.isArray(data)
                    ? (data as any)
                    : [];

            if ((data as any)?.my_last_read_at) {
                setLastReadAt((data as any).my_last_read_at);
            }

            const mapped: MessageDisplay[] = list.map((msg: any, idx: number) => {
                const senderUserId =
                    msg.sender?.user_details?.id ??
                    msg.sender?.user?.id ??
                    msg.sender?.id ??
                    msg.sender;
                return {
                    id: msg.id ?? `${msg.created_at ?? ''}-${idx}`,
                    sender: msg.sender,
                    conversation: msg.conversation ?? roomId,
                    body: msg.body ?? msg.content ?? '',
                    created_at: msg.created_at ?? new Date().toISOString(),
                    attachment_url: msg.attachment_url ?? null,
                    attachment_filename: msg.attachment_filename ?? null,
                    is_deleted: msg.is_deleted,
                    is_edited: msg.is_edited,
                    reactions: msg.reactions ?? [],
                    is_pinned: msg.is_pinned,
                    is_me: user?.id != null ? senderUserId === user.id : false,
                };
            });
            const unique = new Map<string | number, MessageDisplay>();
            for (const msg of mapped) {
                unique.set(messageKey(msg), msg);
            }
            const sorted = Array.from(unique.values()).sort(
                (a, b) => messageTime(a) - messageTime(b)
            );
            setMessages(sorted);
            shouldScrollRef.current = true;
            const res = await markRoomAsRead(roomId);
            if ((res as any)?.last_read_at) {
                setLastReadAt((res as any).last_read_at);
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
        } finally {
            setLoading(false);
        }
    }, [user?.id, parseRoomId]);

    useEffect(() => {
        void fetchMessages();
    }, [fetchMessages]);

    // After initial load/render, scroll to the bottom once the list is mounted
    useEffect(() => {
        if (!loading && messages.length > 0 && shouldScrollRef.current) {
            requestAnimationFrame(() => {
                scrollIfNeeded();
            });
        }
    }, [loading, messages.length]);

    // Mirror web: whenever messages or room change, jump to bottom after layout frame.
    useEffect(() => {
        if (loading || messages.length === 0) return;
        requestAnimationFrame(() => {
            flatListRef.current?.scrollToEnd({ animated: false });
            shouldScrollRef.current = false;
        });
    }, [messages.length, parseRoomId, loading]);

    useFocusEffect(
        useCallback(() => {
            const roomId = parseRoomId();
            if (roomId) {
                setActiveRoomId(roomId);
            }
        }, [parseRoomId])
    );

    const wsRef = useLiveMessages(
      user ? (parseRoomId() || null) : null,
      access || null,
      (payload) => {
        if (!payload?.type) return;
        const roomId = parseRoomId();
        if (payload.type === 'chat.message' || payload.type === 'message.created') {
            const msg = payload.message || payload;
            const senderUserId =
                msg.sender?.user_details?.id ??
                msg.sender?.user?.id ??
                msg.sender?.id ??
                msg.sender;
            const mapped: MessageDisplay = {
                id: msg.id ?? `${Date.now()}`,
                sender: msg.sender,
                conversation: msg.conversation ?? roomId,
                body: msg.body ?? msg.content ?? '',
                created_at: msg.created_at ?? new Date().toISOString(),
                attachment_url: msg.attachment_url ?? null,
                attachment_filename: msg.attachment_filename ?? null,
                is_deleted: msg.is_deleted,
                is_edited: msg.is_edited,
                reactions: msg.reactions ?? [],
                is_pinned: msg.is_pinned,
                is_me: user?.id != null ? senderUserId === user.id : false,
            };
            setMessages((prev) => upsertSortedMessage(prev, mapped));
            shouldScrollRef.current = true;
        } else if (payload.type === 'message.updated') {
            const msg = payload.message || payload;
            if (msg?.id) {
                setMessages((prev) =>
                    updateMessageById(prev, msg.id, (m) => ({
                        ...m,
                        body: msg.body ?? m.body,
                        is_edited: true,
                    }))
                );
            }
        } else if (payload.type === 'message.deleted') {
            setMessages((prev) => prev.filter((m) => m.id !== payload.message_id));
        } else if (payload.type === 'reaction.updated') {
            const messageId = payload.message_id;
            if (messageId) {
                setMessages((prev) =>
                    updateMessageById(prev, messageId, (m) => ({ ...m, reactions: payload.reactions ?? [] }))
                );
            }
        } else if (payload.type === 'typing') {
            const who = payload.user_name || payload.username || payload.user || '';
            if (!who) return;
            setTypingUsernames((prev) => {
                const set = new Set(prev);
                set.add(who);
                return Array.from(set);
            });
            setTimeout(() => {
                setTypingUsernames((prev) => prev.filter((n) => n !== who));
            }, 2000);
        }
      },
      (payload) => {
        triggerUnreadBump(payload);
      }
    );

    const sendMessage = async () => {
        const body = newMessage.trim();
        if (!body) return;
        const roomId = parseRoomId();
        if (!roomId) return;

        setSending(true);
        try {
            if (editingId) {
                const updated = await updateMessageService(editingId, body);
                setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, body: updated.body, is_edited: true } : m)));
                setEditingId(null);
                setNewMessage('');
                return;
            }

            const payload = { body, content: body };
            const sentMessage = await sendRoomMessageService(roomId, payload) as any;
            const newMsg: MessageDisplay = {
                id: sentMessage.id ?? `${Date.now()}`,
                sender: sentMessage.sender,
                conversation: roomId,
                body: sentMessage.body ?? sentMessage.content ?? body,
                created_at: sentMessage.created_at ?? new Date().toISOString(),
                attachment_url: sentMessage.attachment_url ?? null,
                attachment_filename: sentMessage.attachment_filename ?? null,
                reactions: sentMessage.reactions ?? [],
                is_me: true,
            };
            setMessages((prev) => upsertSortedMessage(prev, newMsg));
            shouldScrollRef.current = true;
            setNewMessage('');
        } catch (error) {
            console.error('Error sending message:', error);
        } finally {
            setSending(false);
        }
    };

    const pickAttachment = async () => {
        const res = await DocumentPicker.getDocumentAsync({ multiple: false });
        if (res.canceled || !res.assets?.length) return;
        const file = res.assets[0];
        const roomId = parseRoomId();
        if (!roomId) return;

        setSending(true);
        try {
            const form = new FormData();
            const body = newMessage.trim() || file.name || 'Attachment';
            form.append('body', body);
            form.append('content', body);
            form.append('attachment', {
                uri: file.uri,
                name: file.name || 'upload',
                type: file.mimeType || 'application/octet-stream',
            } as any);
            const sent = await sendRoomMessageService(roomId, form as any);
            if (!sent?.id) throw new Error('Attachment not saved');
            const mapped: MessageDisplay = {
                id: sent.id,
                sender: sent.sender,
                conversation: roomId,
                body: sent.body ?? body,
                created_at: sent.created_at ?? new Date().toISOString(),
                attachment_url: sent.attachment_url ?? null,
                attachment_filename: sent.attachment_filename ?? null,
                reactions: sent.reactions ?? [],
                is_me: true,
            };
            setMessages((prev) => upsertSortedMessage(prev, mapped));
            shouldScrollRef.current = true;
            setNewMessage(''); // This was already correct, just ensuring it's not changed.
        } catch (err: any) {
            console.error('Attachment send failed', err);
            setSnackbar(err?.message || 'Failed to send attachment');
        } finally {
            setSending(false);
        }
    };

    const sendTyping = useCallback(async () => {
        const roomId = parseRoomId();
        if (!roomId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const now = Date.now();
        if (now - typingSentRef.current < 2000) return; // throttle
        typingSentRef.current = now;
        try {
            wsRef.current.send(JSON.stringify({ type: 'typing', room: roomId }));
        } catch {
            // ignore
        }
    }, [parseRoomId]);

    const debouncedTyping = useMemo(() => debounce(sendTyping, 300), [sendTyping]);

    const scrollIfNeeded = () => {
        if (!shouldScrollRef.current) return;
        if (flatListRef.current) {
            flatListRef.current.scrollToEnd({ animated: false });
            shouldScrollRef.current = false;
        }
    };

    const onReact = async (messageId: number, reaction: string) => {
        try {
            const userId = user?.id;
            // Optimistic local update to avoid waiting for WS echo
            if (userId) {
                setMessages((prev) =>
                    prev.map((m) => {
                        if (m.id !== messageId) return m;
                        const current = m.reactions || [];
                        const mine = current.find((r) => r.user_id === userId);
                        let next = current;
                        if (mine) {
                            next = current.filter((r) => r.user_id !== userId);
                            if (mine.reaction !== reaction) {
                                next = [...next, { user_id: userId, reaction }];
                            }
                        } else {
                            next = [...current, { user_id: userId, reaction }];
                        }
                        return { ...m, reactions: next };
                    }),
                );
            }
            await reactToMessageService(messageId, reaction);
        } catch (err: any) {
            setSnackbar(err?.response?.data?.detail || 'Reaction failed');
        }
    };

    const onDelete = async (messageId: number) => {
        try {
            await deleteMessageService(messageId);
            setMessages((prev) => prev.filter((m) => m.id !== messageId));
        } catch (err: any) {
            setSnackbar(err?.response?.data?.detail || 'Delete failed');
        }
    };

    const onEditStart = (message: MessageDisplay) => {
        setEditingId(message.id as number);
        setNewMessage(message.body || '');
    };

    const onPinMessage = async (messageId: number) => {
        const roomId = parseRoomId();
        if (!roomId) return;
        try {
            await toggleRoomPinService(roomId, { target: 'message', messageId });
            setMessages((prev) =>
                prev.map((m) => (m.id === messageId ? { ...m, is_pinned: !m.is_pinned } : m))
            );
        } catch (err) {
            console.error('Pin failed', err);
        }
    };

    const onPinRoom = async () => {
        const roomId = parseRoomId();
        if (!roomId) return;
        try {
            const updated = await toggleRoomPinService(roomId, { target: 'conversation' });
            setRoomPinned(!!updated?.is_pinned);
        } catch (err) {
            console.error('Room pin failed', err);
        }
    };

    const viewerReaction = useCallback(
        (item: MessageDisplay) => {
            if (!user?.id || !item.reactions) return null;
            return item.reactions.find((r) => r.user_id === user.id)?.reaction || null;
        },
        [user?.id],
    );
    // Emoji options for sending.
    const REACTION_EMOJIS = ['👍', '❤️', '🔥', '💩'];

    const REACTION_DISPLAY: Record<string, string> = {
        '👍': '👍',
        '❤️': '❤️',
        '🔥': '🔥',
        '💩': '💩',
    };
    const reactionToEmoji = (value: string) => REACTION_DISPLAY[value] ?? value;

const pinnedMessage = useMemo(() => {
        const pinned = messages.filter((m) => m.is_pinned);
        if (!pinned.length) return null;
        return pinned.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    }, [messages]);

    const renderReactions = (item: MessageDisplay) => {
        if (!item.reactions || item.reactions.length === 0) return null;
        const grouped = item.reactions.reduce<Record<string, number>>((acc, r) => {
            acc[r.reaction] = (acc[r.reaction] || 0) + 1;
            return acc;
        }, {});
        const mine = viewerReaction(item);
        return ( // This was already correct, just ensuring it's not changed.
            <View style={styles.reactionsRow}>
                {Object.entries(grouped).map(([payload, count]) => {
                    const emoji = reactionToEmoji(payload);
                    return (
                        <View key={emoji} style={[styles.reactionChip, mine === payload ? styles.myReactionChip : null]}>
                            <Text style={{ fontSize: 12 }}>{emoji} {count}</Text>
                        </View>
                    );
                })}
            </View>
        );
    };

    const renderMessage = ({ item }: { item: MessageDisplay; index: number }) => {
        const isMe = item.is_me;
        const senderName = senderNameOf(item);
        const senderPhoto = photoOf(resolveMessageIdentity(item));
        return (
            <View style={[
                styles.messageContainer,
                isMe ? styles.myMessageContainer : styles.theirMessageContainer,
            ]}>
                <View style={styles.avatarSlot}>
                    {senderPhoto ? (
                        <Avatar.Image size={34} source={{ uri: senderPhoto }} style={styles.senderAvatar} />
                    ) : (
                        <Avatar.Text size={34} label={initialsOf(senderName)} style={styles.senderAvatar} labelStyle={styles.senderAvatarLabel} />
                    )}
                </View>
                <TouchableOpacity
                    activeOpacity={0.9}
                    onLongPress={() => setMenuFor(item.id as number)}
                    style={styles.messageTouchTarget}
                >
                    <Surface
                        style={[
                            styles.messageBubble,
                            isMe ? styles.myMessageBubble : styles.theirMessageBubble,
                            item.is_pinned ? styles.pinned : null,
                        ]}
                        elevation={1}
                    >
                        <View style={styles.bubbleHeader}>
                            <Text style={[styles.senderName, isMe ? styles.mySenderName : styles.theirSenderName]}>{senderName}</Text>
                            <Text style={[
                                styles.messageText,
                                isMe ? styles.myMessageText : styles.theirMessageText
                            ]}>
                            {item.body}
                            {item.is_edited ? ' (edited)' : ''}
                            </Text>
                        </View>
                    {item.attachment_url ? (
                        <Text style={styles.attachment}>{item.attachment_filename || 'Attachment'}</Text>
                    ) : null}
                    {renderReactions(item)}
                        <Text style={[
                            styles.timestamp,
                            isMe ? styles.myTimestamp : styles.theirTimestamp
                        ]}>
                            {new Date(item.created_at).toLocaleDateString('en-AU')} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                    </Surface>
                </TouchableOpacity>
                <Menu
                    visible={menuFor === item.id}
                    onDismiss={() => setMenuFor(null)}
                    anchor={<View style={{ width: 1, height: 1 }} />}
                >
                    {isMe ? <Menu.Item leadingIcon="pencil" onPress={() => onEditStart(item)} title="Edit" /> : null}
                    {isMe ? <Menu.Item leadingIcon="delete" onPress={() => onDelete(item.id as number)} title="Delete" /> : null}
                    <Divider />
                    <View style={styles.reactionPicker}>
                        {REACTION_EMOJIS.map((emoji) => (
                            <TouchableOpacity
                                key={emoji}
                                onPress={() => onReact(item.id as number, emoji)}
                                style={styles.reactionOption}
                            >
                                <Text style={styles.reactionEmoji}>{emoji}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <Divider />
                    {viewerReaction(item) ? (
                        <Menu.Item leadingIcon="close" onPress={() => onReact(item.id as number, viewerReaction(item) as string)} title="Remove reaction" />
                    ) : null}
                    <Divider />
                    <Menu.Item leadingIcon={item.is_pinned ? 'pin-off' : 'pin'} onPress={() => onPinMessage(item.id as number)} title={item.is_pinned ? 'Unpin' : 'Pin'} />
                </Menu>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <View style={styles.container}>
            <Stack.Screen options={{
                headerShown: true,
                title: (name as string) || 'Chat',
                headerTitleAlign: 'left',
                headerStyle: {
                    backgroundColor: '#FFFFFF',
                },
                headerBackTitle: 'Messages',
                headerRight: () => (
                    <IconButton
                        icon={roomPinned ? 'pin' : 'pin-outline'}
                        onPress={onPinRoom}
                        accessibilityLabel={roomPinned ? 'Unpin conversation' : 'Pin conversation'}
                        accessibilityRole="button"
                    />
                ),
            }} />

            {pinnedMessage ? (
                <Surface
                    style={styles.pinnedBanner}
                    elevation={1}
                    onTouchEnd={() => {
                        if (!pinnedMessage?.id || !flatListRef.current) return;
                        const idx = messages.findIndex((m) => m.id === pinnedMessage.id);
                        if (idx >= 0) {
                            try {
                                flatListRef.current.scrollToIndex({ index: idx, animated: true });
                            } catch {
                                flatListRef.current.scrollToEnd({ animated: true });
                            }
                        }
                    }}
                >
                    <Text style={styles.pinnedTitle}>Pinned</Text>
                    <Text style={styles.pinnedBody} numberOfLines={2}>{pinnedMessage!.body || 'Pinned message'}</Text>
                    <IconButton
                        icon="pin-off"
                        size={18}
                        onPress={() => onPinMessage(pinnedMessage!.id as number)}
                        accessibilityLabel="Unpin message"
                        accessibilityRole="button"
                    />
                </Surface>
            ) : null}

            <View style={{ flex: 1 }}>
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={(item, index) => `${item.id ?? 'msg'}-${item.created_at ?? index}`}
                    contentContainerStyle={[styles.listContent, { paddingBottom: 24 + insets.bottom }]}
                    onContentSizeChange={scrollIfNeeded}
                    onLayout={scrollIfNeeded}
                />
                {loading ? (
                    <View style={[StyleSheet.absoluteFill, styles.centerContainer]}>
                        <ActivityIndicator size="large" color="#6366F1" />
                    </View>
                ) : null}
            </View>

            {lastReadAt ? (
                <Text style={styles.readReceipt}>
                    Seen up to {new Date(lastReadAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            ) : null}

            {typingUsernames.length > 0 ? (
                <Text style={styles.typing}>{typingUsernames.join(', ')} typing...</Text>
            ) : null}

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
            >
                <Surface style={styles.inputContainer} elevation={4}>
                    <TextInput
                        mode="outlined"
                        placeholder={editingId ? 'Edit message...' : 'Type a message...'}
                        value={newMessage}
                        onChangeText={(text) => {
                            setNewMessage(text);
                            debouncedTyping();
                        }}
                        style={styles.input}
                        outlineStyle={styles.inputOutline}
                        right={
                            <TextInput.Icon
                                icon="attachment"
                                onPress={pickAttachment}
                                disabled={sending}
                            />
                        }
                        left={
                            <TextInput.Icon
                                icon={editingId ? 'check' : 'send'}
                                onPress={sendMessage}
                                disabled={sending || !newMessage.trim()}
                                color={newMessage.trim() ? '#6366F1' : '#9CA3AF'}
                            />
                        }
                    />
                </Surface>
            </KeyboardAvoidingView>

            <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
                {snackbar}
            </Snackbar>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: 12,
        paddingBottom: 24,
    },
    messageContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 12,
    },
    myMessageContainer: {
        justifyContent: 'flex-end',
        flexDirection: 'row-reverse',
    },
    theirMessageContainer: {
        justifyContent: 'flex-start',
    },
    avatarSlot: {
        width: 34,
        flexShrink: 0,
        alignItems: 'center',
    },
    senderAvatar: {
        backgroundColor: '#DDE3EF',
    },
    senderAvatarLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#4B5563',
    },
    messageTouchTarget: {
        maxWidth: '82%',
    },
    messageBubble: {
        maxWidth: '100%',
        minWidth: 120,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    bubbleHeader: {
        flexDirection: 'column',
        alignItems: 'flex-start',
    },
    senderName: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 4,
    },
    mySenderName: {
        color: '#065F46',
    },
    theirSenderName: {
        color: '#374151',
    },
    menuButton: {
        margin: 0,
        padding: 0,
        alignSelf: 'flex-start',
    },
    myMessageBubble: {
        marginLeft: 'auto',
        backgroundColor: '#C7F9CC',
        borderColor: '#34D399',
        borderWidth: 1,
    },
    theirMessageBubble: {
        marginRight: 'auto',
        backgroundColor: '#E5E7EB',
        borderColor: '#D1D5DB',
        borderWidth: 1,
    },
    messageText: {
        fontSize: 14,
    },
    myMessageText: {
        color: '#111827',
    },
    theirMessageText: {
        color: '#111827',
    },
    timestamp: {
        fontSize: 11,
        marginTop: 4,
    },
    myTimestamp: {
        color: '#4B5563',
        textAlign: 'right',
    },
    theirTimestamp: {
        color: '#9CA3AF',
        textAlign: 'left',
    },
    attachment: {
        marginTop: 4,
        color: '#2563EB',
        textDecorationLine: 'underline',
    },
    reactionsRow: {
        flexDirection: 'row',
        gap: 6,
        marginTop: 6,
    },
    reactionPicker: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 10,
    },
    reactionOption: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#EEF2FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    reactionEmoji: {
        fontSize: 18,
    },
    reactionChip: {
        backgroundColor: '#E0E7FF',
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    myReactionChip: {
        backgroundColor: '#C7D2FE',
    },
    pinned: {
        borderWidth: 1,
        borderColor: '#F59E0B',
    },
    pinnedBanner: {
        marginHorizontal: 12,
        marginTop: 8,
        marginBottom: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: '#FFFBEB',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    pinnedTitle: {
        fontSize: 12,
        color: '#92400E',
        fontWeight: '600',
    },
    pinnedBody: {
        flex: 1,
        fontSize: 13,
        color: '#78350F',
    },
    typing: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        color: '#6B7280',
        fontSize: 12,
    },
    readReceipt: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        color: '#9CA3AF',
        fontSize: 11,
        textAlign: 'right',
    },
    inputContainer: {
        padding: 8,
        backgroundColor: '#FFFFFF',
    },
    input: {
        backgroundColor: '#FFFFFF',
    },
    inputOutline: {
        borderRadius: 12,
    },
});
