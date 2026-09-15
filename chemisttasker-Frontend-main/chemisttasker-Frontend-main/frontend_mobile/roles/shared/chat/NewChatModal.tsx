import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Modal, Portal, Text, TextInput, Button, Avatar, useTheme, HelperText, ActivityIndicator } from 'react-native-paper';
import type { UserLite } from './types';
import { searchParticipants, startDirectChat } from './hooks';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onCreated: (roomId: number, displayName?: string) => void;
};

export default function NewChatModal({ visible, onDismiss, onCreated }: Props) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!query || query.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const people = await searchParticipants(query);
        if (!cancelled) setResults(people);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const handle = setTimeout(run, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  const displayName = (u: UserLite) => {
    const first = (u as any).first_name || (u as any).firstName || '';
    const last = (u as any).last_name || (u as any).lastName || '';
    const full = `${first} ${last}`.trim();
    return full || u.email || 'Unknown';
  };

  const startChat = async (user: UserLite) => {
    if (!user?.id) return;
    setSubmittingId(user.id as number);
    setError(null);
    try {
        // prefer membership id if present
      const res: any = await startDirectChat(
        (user as any).membership_id ? { membershipId: (user as any).membership_id } : { userId: user.id as number },
      );
      const roomId = res?.id ?? res?.room?.id ?? res?.room_id;
      if (roomId) {
        onCreated(roomId, displayName(user));
        onDismiss();
      } else {
        setError('Chat created but no room id returned');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to start chat');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        <Text variant="titleMedium" style={styles.title}>
          New Chat
        </Text>
        <TextInput
          mode="outlined"
          label="Search by name or email"
          value={query}
          onChangeText={setQuery}
          style={styles.input}
          autoCapitalize="none"
        />
        {error ? <HelperText type="error">{error}</HelperText> : null}
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item, index) => String(item.id ?? (item as any).email ?? index)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => startChat(item)}
                disabled={submittingId === item.id}
              >
                <Avatar.Text
                  size={40}
                  label={displayName(item).slice(0, 2).toUpperCase()}
                  style={{ backgroundColor: theme.colors.primary, opacity: 0.85 }}
                />
                <View style={styles.rowContent}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {displayName(item)}
                  </Text>
                  <Text variant="labelSmall" style={styles.sub}>
                    {(item as any).email || (item as any).role || ''}
                  </Text>
                </View>
                {submittingId === item.id ? <ActivityIndicator /> : <Button compact>Chat</Button>}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              query.length >= 2 ? (
                <Text style={styles.empty}>No users found</Text>
              ) : (
                <Text style={styles.empty}>Type at least 2 characters to search</Text>
              )
            }
          />
        )}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    maxHeight: '80%',
  },
  title: {
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    marginBottom: 8,
  },
  loading: {
    paddingVertical: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  rowContent: {
    flex: 1,
  },
  sub: {
    color: '#6B7280',
  },
  empty: {
    textAlign: 'center',
    paddingVertical: 12,
    color: '#6B7280',
  },
});
