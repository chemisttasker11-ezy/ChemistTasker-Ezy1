import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Modal, Portal, Text, TextInput, Button, Checkbox, ActivityIndicator, HelperText } from 'react-native-paper';
import type { UserLite } from './types';
import { searchParticipants } from './hooks';
import { createOrUpdateGroupRoom } from '@chemisttasker/shared-core';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onCreated: (roomId: number, displayName?: string) => void;
};

export default function NewGroupModal({ visible, onDismiss, onCreated }: Props) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserLite[]>([]);
  const [selected, setSelected] = useState<Record<number, UserLite>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
        const list = await searchParticipants(query);
        if (!cancelled) setResults(list);
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

  const toggleSelect = (user: UserLite) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (user.id && next[user.id]) {
        delete next[user.id];
      } else if (user.id) {
        next[user.id] = user;
      }
      return next;
    });
  };

  const displayName = (u: UserLite) => {
    const first = (u as any).first_name || (u as any).firstName || '';
    const last = (u as any).last_name || (u as any).lastName || '';
    const full = `${first} ${last}`.trim();
    return full || (u as any).email || 'Unknown';
  };

  const createGroup = async () => {
    if (!name.trim()) {
      setError('Group name required');
      return;
    }
    const ids = Object.keys(selected).map((k) => Number(k));
    if (ids.length === 0) {
      setError('Select at least one member');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const room = await createOrUpdateGroupRoom({ title: name.trim(), participants: ids } as any);
      const roomId = room?.id;
      if (roomId) {
        onCreated(roomId, name.trim());
        setName('');
        setQuery('');
        setSelected({});
        setResults([]);
        onDismiss();
      } else {
        setError('Group created but no room id returned');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to create group');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        <Text variant="titleMedium" style={styles.title}>New Group</Text>
        <TextInput
          mode="outlined"
          label="Group name"
          value={name}
          onChangeText={setName}
          style={styles.input}
        />
        <TextInput
          mode="outlined"
          label="Search members"
          value={query}
          onChangeText={setQuery}
          style={styles.input}
          autoCapitalize="none"
        />
        {error ? <HelperText type="error">{error}</HelperText> : null}
        {loading ? (
          <View style={styles.loading}><ActivityIndicator /></View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item, index) => String(item.id ?? (item as any).email ?? index)}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => toggleSelect(item)}>
                <Checkbox status={selected[item.id ?? -1] ? 'checked' : 'unchecked'} />
                <View style={{ flex: 1 }}>
                <Text>{displayName(item)}</Text>
                <Text style={styles.sub}>{(item as any).email || (item as any).role || ''}</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              query.length >= 2 ? (
                <Text style={styles.empty}>No users found</Text>
              ) : (
                <Text style={styles.empty}>Type at least 2 characters</Text>
              )
            }
            style={{ maxHeight: 260, marginBottom: 8 }}
          />
        )}
        <Button mode="contained" onPress={createGroup} loading={submitting} disabled={submitting}>
          Create Group
        </Button>
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
    maxHeight: '85%',
  },
  title: { marginBottom: 8, fontWeight: '600' },
  input: { marginBottom: 8 },
  loading: { paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  sub: { color: '#6B7280', fontSize: 12 },
  empty: { textAlign: 'center', color: '#6B7280', paddingVertical: 8 },
});
