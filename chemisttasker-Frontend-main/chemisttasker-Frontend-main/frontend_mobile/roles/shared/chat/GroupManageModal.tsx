import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Modal, Portal, Text, Button, ActivityIndicator, Checkbox, HelperText, TextInput } from 'react-native-paper';
import { fetchChatParticipants } from '@chemisttasker/shared-core';
import type { ChatRoom } from './types';
import { searchParticipants } from './hooks';
import { deleteRoomService, createOrUpdateGroupRoom } from '@chemisttasker/shared-core';

type Props = {
  room: ChatRoom | null;
  visible: boolean;
  onDismiss: () => void;
  onUpdated: () => void;
  currentUserId?: number | null;
  canManage?: boolean;
};

export default function GroupManageModal({ room, visible, onDismiss, onUpdated, currentUserId, canManage = false }: Props) {
  const [members, setMembers] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAdds, setSelectedAdds] = useState<Record<number, any>>({});
  const [selectedRemovals, setSelectedRemovals] = useState<Record<number, any>>({});
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [creatorId, setCreatorId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadMembers = async () => {
      if (!room?.participant_ids) return;
      setLoading(true);
      try {
        const data: any = await fetchChatParticipants();
        const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
        const memberSet = new Set(room.participant_ids || []);
        const current = list.filter((p: any) => memberSet.has(p.id));
        const myMembershipId = room.my_membership_id ?? null;
        const myRow = myMembershipId ? current.find((m: any) => m.id === myMembershipId) : null;
        if (!cancelled) setIsAdmin(canManage || !!myRow?.is_admin);
        if (!cancelled) {
          const creator =
            (room as any).created_by_user_id ??
            (room as any).createdByUserId ??
            (room as any).created_by ??
            (room as any).createdBy ??
            null;
          setCreatorId(creator ?? null);
        }
        if (!cancelled) setMembers(current);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load members');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (visible && room) {
      void loadMembers();
    }
    return () => {
      cancelled = true;
    };
  }, [visible, room]);

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

  const toggleSelectAdd = (user: any) => {
    setSelectedAdds((prev) => {
      const next = { ...prev };
      if (user.id && next[user.id]) {
        delete next[user.id];
      } else if (user.id) {
        next[user.id] = user;
      }
      return next;
    });
  };

  const toggleSelectRemoval = (user: any) => {
    setSelectedRemovals((prev) => {
      const next = { ...prev };
      if (user.id && next[user.id]) {
        delete next[user.id];
      } else if (user.id) {
        next[user.id] = user;
      }
      return next;
    });
  };

  const addMembers = async () => {
    if (!room) return;
    const ids = Object.keys(selectedAdds).map((k) => Number(k));
    if (ids.length === 0) {
      setError('Select members to add');
      return;
    }
    setSubmitting(true);
    try {
      await createOrUpdateGroupRoom({ roomId: room.id, participants: [...(room.participant_ids || []), ...ids], title: room.title });
      setSelectedAdds({});
      onUpdated();
    } catch (err: any) {
      setError(err?.message || 'Failed to add members');
    } finally {
      setSubmitting(false);
    }
  };

  const removeMembers = async () => {
    if (!room) return;
    const ids = Object.keys(selectedRemovals).map((k) => Number(k));
    if (ids.length === 0) {
      setError('Select members to remove');
      return;
    }
    setSubmitting(true);
    try {
      const remaining = (room.participant_ids || []).filter((pid: number) => !ids.includes(pid));
      await createOrUpdateGroupRoom({ roomId: room.id, participants: remaining, title: room.title });
      setSelectedRemovals({});
      onUpdated();
    } catch (err: any) {
      setError(err?.message || 'Failed to remove members');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmLeaveOrDelete = () => {
    if (!room) return;
    Alert.alert(
      'Leave group?',
      'This will remove you from the group.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              await deleteRoomService(room.id);
              onDismiss();
              onUpdated();
            } catch (err: any) {
              setError(err?.message || 'Failed to leave group');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        <Text variant="titleMedium" style={styles.title}>{room?.title || 'Group'}</Text>
        {error ? <HelperText type="error">{error}</HelperText> : null}
        {loading ? (
          <View style={styles.loading}><ActivityIndicator /></View>
        ) : (
          <>
            <Text style={styles.section}>Members</Text>
            <FlatList
              data={members}
              keyExtractor={(item, index) => String(item.id ?? item.email ?? index)}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} onPress={() => toggleSelectRemoval(item)}>
                  <Checkbox status={selectedRemovals[item.id ?? -1] ? 'checked' : 'unchecked'} />
                  <Text style={{ flex: 1 }}>{item.userDetails?.name || item.userDetails?.email || 'User'}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.empty}>No members</Text>}
              style={{ maxHeight: 200 }}
            />
            {(isAdmin || (creatorId && currentUserId && creatorId === currentUserId)) ? (
              <Button mode="outlined" onPress={removeMembers} loading={submitting} disabled={submitting} style={{ marginBottom: 8 }}>
                Remove Selected
              </Button>
            ) : null}
          </>
        )}

        <Text style={styles.section}>Add members</Text>
        <TextInput
          mode="outlined"
          label="Search"
          value={query}
          onChangeText={setQuery}
          style={styles.input}
          autoCapitalize="none"
        />
        <FlatList
          data={results}
          keyExtractor={(item, index) => String(item.id ?? item.email ?? index)}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => toggleSelectAdd(item)}>
              <Checkbox status={selectedAdds[item.id ?? -1] ? 'checked' : 'unchecked'} />
              <View style={{ flex: 1 }}>
                <Text>{item.name || item.email || 'Unknown'}</Text>
                <Text style={styles.sub}>{item.email || item.role || ''}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{query.length >= 2 ? 'No users found' : 'Type to search'}</Text>}
          style={{ maxHeight: 200, marginBottom: 8 }}
        />
        {(isAdmin || (creatorId && currentUserId && creatorId === currentUserId)) ? (
          <Button mode="contained" onPress={addMembers} loading={submitting} disabled={submitting}>
            Add Selected
          </Button>
        ) : null}
        <Button mode="text" onPress={confirmLeaveOrDelete} disabled={submitting} style={{ marginTop: 4 }}>
          Leave Group
        </Button>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: { margin: 16, padding: 16, borderRadius: 12, backgroundColor: '#fff', maxHeight: '90%' },
  title: { fontWeight: '700', marginBottom: 8 },
  loading: { paddingVertical: 12 },
  section: { marginTop: 12, marginBottom: 4, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  sub: { color: '#6B7280', fontSize: 12 },
  empty: { textAlign: 'center', color: '#6B7280', paddingVertical: 8 },
  input: { marginBottom: 8 },
});
