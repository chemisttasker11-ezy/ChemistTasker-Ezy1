import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, IconButton, Surface, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRoomMessages, sendRoomMessage, markRoomAsRead } from '@chemisttasker/shared-core';
import { useAuth } from '../../../context/AuthContext';
import { fetchWsTicket } from '../../../utils/apiClient';

interface MessageDisplay {
  id: number;
  sender: number | string;
  content: string;
  created_at: string;
  is_me: boolean;
}

export default function PharmacistMessageDetailScreen() {
  const { id, name } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<MessageDisplay[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList<MessageDisplay>>(null);
  const pollRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);

  const parseRoomId = useCallback(() => {
    if (Array.isArray(id)) return parseInt(id[0], 10);
    if (typeof id === 'string') return parseInt(id, 10);
    return typeof id === 'number' ? id : NaN;
  }, [id]);

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

      const mapped = list.map((msg: any, idx: number) => ({
        id: msg.id ?? `${msg.created_at ?? ''}-${idx}`,
        sender: msg.sender?.id ?? msg.sender,
        content: msg.body ?? msg.content ?? '',
        created_at: msg.created_at ?? new Date().toISOString(),
        is_me: user?.id != null ? (msg.sender?.id ?? msg.sender) === user.id : false,
      }));
      setMessages(mapped);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
      await markRoomAsRead(roomId);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, parseRoomId]);

  useEffect(() => {
    void fetchMessages();

    // WebSocket live updates
    const roomId = parseRoomId();
    let isCancelled = false;
    const setupWs = async () => {
      if (!roomId) return;
      try {
        const ticket = await fetchWsTicket();
        if (isCancelled || !ticket) return;

        const base = process.env.EXPO_PUBLIC_API_URL || '';
        const httpBase = base.endsWith('/api') ? base.slice(0, -4) : base || 'http://localhost:8000';
        const wsBase = httpBase.replace(/^http/, 'ws');

        let wsUrl = `${wsBase}/ws/chat/rooms/${roomId}/`;
        if (wsUrl.includes('?')) {
          wsUrl += `&ticket=${encodeURIComponent(ticket)}`;
        } else {
          wsUrl += `?ticket=${encodeURIComponent(ticket)}`;
        }

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        reconnectAttempts.current = 0;
        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload?.type === 'chat.message' || payload?.type === 'message.created') {
              const msg = payload.message || payload;
              const mapped: MessageDisplay = {
                id: msg.id ?? `${Date.now()}`,
                sender: msg.sender?.id ?? msg.sender,
                content: msg.body ?? msg.content ?? '',
                created_at: msg.created_at ?? new Date().toISOString(),
                is_me: user?.id != null ? (msg.sender?.id ?? msg.sender) === user.id : false,
              };
              setMessages((prev) => [...prev, mapped]);
              setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
            }
          } catch {
            // ignore parse errors
          }
        };
        ws.onclose = () => {
          const attempt = reconnectAttempts.current + 1;
          reconnectAttempts.current = attempt;
          const delay = Math.min(30000, 1000 * 2 ** attempt);
          setTimeout(() => {
            if (wsRef.current === ws && !isCancelled) {
              wsRef.current = null;
              void fetchMessages();
              void setupWs();
            }
          }, delay);
        };
      } catch {
        // fall back to polling
      }
    };
    void setupWs();

    // fallback polling
    pollRef.current = setInterval(() => {
      if (!isCancelled) fetchMessages().catch(() => { });
    }, 5000) as unknown as number;

    return () => {
      isCancelled = true;
      if (pollRef.current) clearInterval(pollRef.current as unknown as number);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [fetchMessages]);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    const roomId = parseRoomId();
    if (!roomId) return;

    setSending(true);
    try {
      const payload = { content: newMessage };
      const sentMessage = await sendRoomMessage(roomId, payload) as any;
      const newMsg: MessageDisplay = {
        id: sentMessage.id ?? `${Date.now()}`,
        sender: sentMessage.sender?.id ?? sentMessage.sender,
        content: sentMessage.body ?? sentMessage.content ?? newMessage,
        created_at: sentMessage.created_at ?? new Date().toISOString(),
        is_me: true,
      };
      setMessages((prev) => [...prev, newMsg]);
      setNewMessage('');
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: MessageDisplay }) => {
    const isMe = item.is_me;
    return (
      <View style={[
        styles.messageContainer,
        isMe ? styles.myMessageContainer : styles.theirMessageContainer
      ]}>
        <Surface style={[
          styles.messageBubble,
          isMe ? styles.myMessageBubble : styles.theirMessageBubble
        ]} elevation={1}>
          <Text style={[
            styles.messageText,
            isMe ? styles.myMessageText : styles.theirMessageText
          ]}>
            {item.content}
          </Text>
          <Text style={[
            styles.timestamp,
            isMe ? styles.myTimestamp : styles.theirTimestamp
          ]}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </Surface>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.container}>
        <Stack.Screen options={{
          headerShown: true,
          title: (name as string) || 'Chat',
          headerBackTitle: 'Messages',
        }} />

        <View style={styles.header}>
          <IconButton icon="arrow-left" onPress={() => router.back()} />
          <Surface style={styles.titleRow} elevation={0}>
            <Text variant="titleMedium" style={styles.headerTitle}>{name || 'Chat'}</Text>
          </Surface>
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#6366F1" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item, index) => (item.id ?? index).toString()}
            contentContainerStyle={[styles.listContent, { paddingBottom: 24 + insets.bottom }]}
            contentInsetAdjustmentBehavior="automatic"
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
        >
          <Surface style={styles.inputContainer} elevation={4}>
            <TextInput
              mode="outlined"
              placeholder="Type a message..."
              value={newMessage}
              onChangeText={setNewMessage}
              style={styles.input}
              outlineStyle={styles.inputOutline}
              right={
                <TextInput.Icon
                  icon="send"
                  onPress={sendMessage}
                  disabled={sending || !newMessage.trim()}
                  color={newMessage.trim() ? '#6366F1' : '#9CA3AF'}
                />
              }
            />
          </Surface>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  titleRow: {
    flex: 1,
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
    elevation: 0,
  },
  headerTitle: {
    fontWeight: '600',
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
    marginBottom: 12,
  },
  myMessageContainer: {
    justifyContent: 'flex-end',
  },
  theirMessageContainer: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 14,
    padding: 10,
  },
  myMessageBubble: {
    marginLeft: 'auto',
    backgroundColor: '#EEF2FF',
  },
  theirMessageBubble: {
    marginRight: 'auto',
    backgroundColor: '#FFFFFF',
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
