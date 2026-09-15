import React, { useMemo, useCallback } from 'react';
import { View, StyleSheet, FlatList, ScrollView } from 'react-native';
import { Searchbar, Button, Text, Divider, Chip, IconButton, Menu } from 'react-native-paper';
import type { ChatRoom } from './types';
import ChatListItem from './ChatListItem';
import { deleteRoomService } from '@chemisttasker/shared-core';
import { displayNameFromUser } from './displayName';

type Props = {
  rooms: ChatRoom[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (room: ChatRoom) => void;
  onNewChat: () => void;
  onNewGroup: () => void;
  onTogglePin: (room: ChatRoom) => void;
  refreshing: boolean;
  onRefresh: () => void;
  canCreate: boolean;
  canPin: boolean;
  shiftContacts?: any[];
  onSelectShiftContact?: (contact: any) => void;
  onDeleteRoom?: (room: ChatRoom) => void;
  onEditRoom?: (room: ChatRoom) => void;
};

export default function ChatSidebar({
  rooms,
  search,
  onSearchChange,
  onSelect,
  onNewChat,
  onNewGroup,
  onTogglePin,
  refreshing,
  onRefresh,
  canCreate,
  canPin,
  shiftContacts = [],
  onSelectShiftContact,
  onDeleteRoom,
  onEditRoom,
}: Props) {
  const [filter, setFilter] = React.useState<'all' | 'group' | 'dm' | 'shift'>('all');
  const [createMenu, setCreateMenu] = React.useState(false);

  const filtered = useMemo(() => {
    if (!search) return rooms;
    const q = search.toLowerCase();
    return rooms.filter((room) => {
      const pharm = (room as any)?.pharmacy;
      const pharmacyName = pharm && typeof pharm === 'object' ? (pharm as any).name : '';
      const title = room.title || pharmacyName || '';
      const last = (room as any)?.last_message?.body || '';
      const looksGhost = !title && !last && !(room.unread_count && room.unread_count > 0);
      if (looksGhost) return false;
      return title.toLowerCase().includes(q) || last.toLowerCase().includes(q);
    });
  }, [rooms, search]);

  const grouped = useMemo(() => {
    const pinned = filtered.filter((r) => r.is_pinned);
    const others = filtered.filter((r) => !r.is_pinned);
    const groupChats = others.filter((r) => r.type === 'GROUP');
    const dmChats = others.filter((r) => r.type === 'DM');
    return { pinned, groupChats, dmChats };
  }, [filtered]);

  const findMatchingRoomForShift = useCallback(
    (contact: any): ChatRoom | null => {
      const name = (displayNameFromUser(contact?.user) || '').toLowerCase();
      const email = (contact?.user?.email || '').toLowerCase();
      return (
        rooms.find((r) => {
          if (r.type !== 'DM') return false;
          const title = (r.title || '').toLowerCase();
          const pharmacyName = (r as any)?.pharmacy?.name?.toLowerCase?.() || '';
          const matchTitle = title === name || title === email || title === pharmacyName;
          const matchPartial = title === email || title === name || pharmacyName === name;
          return matchTitle || matchPartial;
        }) || null
      );
    },
    [rooms],
  );

  const shiftItems = useMemo(() => {
    return (shiftContacts || []).map((c, idx) => {
      const match = findMatchingRoomForShift(c);
      const display = displayNameFromUser(c.user) || c.pharmacy_name || 'Shift Contact';
      return {
        key: `shift-${idx}`,
        contact: c,
        room: match ?? ({
          id: -100000 - idx,
          title: display,
          type: 'GROUP',
          unread_count: 0,
          updated_at: c.shift_date,
          last_message: undefined,
        } as any),
        display,
        matched: !!match,
      };
    });
  }, [shiftContacts, findMatchingRoomForShift]);

  const listForFilter = useMemo(() => {
    if (filter === 'group') return grouped.groupChats;
    if (filter === 'dm') return grouped.dmChats;
    if (filter === 'shift') return shiftItems.map((s) => s.room);
    return filtered;
  }, [filter, grouped, filtered, shiftItems]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text variant="titleMedium" style={{ fontWeight: '700' }}>Messages</Text>
        {canCreate ? (
          <Menu
            visible={createMenu}
            onDismiss={() => setCreateMenu(false)}
            anchor={<IconButton icon="plus" onPress={() => setCreateMenu(true)} />}
          >
            <Menu.Item onPress={() => { setCreateMenu(false); onNewChat(); }} title="New Chat" />
            <Menu.Item onPress={() => { setCreateMenu(false); onNewGroup(); }} title="New Group" />
          </Menu>
        ) : null}
      </View>
      <Searchbar
        placeholder="Search chats"
        value={search}
        onChangeText={onSearchChange}
        style={styles.search}
        inputStyle={styles.searchInput}
      />
      {canCreate ? (
        <View style={styles.actions}>
          <Button mode="contained" onPress={onNewChat} style={styles.button}>
            New Chat
          </Button>
          <Button mode="outlined" onPress={onNewGroup} style={styles.button}>
            New Group
          </Button>
        </View>
      ) : null}

      <View style={styles.filters}>
        <Chip selected={filter === 'all'} onPress={() => setFilter('all')} compact>
          All
        </Chip>
        <Chip selected={filter === 'group'} onPress={() => setFilter('group')} compact>
          Groups
        </Chip>
        <Chip selected={filter === 'dm'} onPress={() => setFilter('dm')} compact>
          DMs
        </Chip>
        <Chip selected={filter === 'shift'} onPress={() => setFilter('shift')} compact>
          Shifts
        </Chip>
      </View>

      {listForFilter.length === 0 ? (
        <View style={styles.empty}>
          <Text>No conversations found</Text>
        </View>
      ) : (
        <ScrollView>
          {filter === 'all' && grouped.pinned.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pinned</Text>
              {grouped.pinned.map((item) => (
                <ChatListItem
                  key={`p-${item.id}`}
                  room={item}
                  onPress={onSelect}
                  onTogglePin={canPin ? onTogglePin : () => {}}
                  onDelete={onDeleteRoom}
                  onEdit={onEditRoom}
                  canEditDelete={!item.pharmacy && ((item as any).can_delete ?? true)}
                />
              ))}
              <Divider />
            </View>
          )}

          {(filter === 'all' || filter === 'group') && grouped.groupChats.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Groups</Text>
              {grouped.groupChats.map((item) => (
                <ChatListItem
                  key={`g-${item.id}`}
                  room={item}
                  onPress={onSelect}
                  onTogglePin={canPin ? onTogglePin : () => {}}
                  onDelete={onDeleteRoom}
                  onEdit={onEditRoom}
                  canEditDelete={!item.pharmacy && ((item as any).can_delete ?? true)}
                />
              ))}
              <Divider />
            </View>
          )}

          {filter === 'shift' && shiftItems.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Shifts</Text>
              {shiftItems.map(({ key, room, contact, matched }) => (
                <ChatListItem
                  key={key}
                  room={room}
                  onPress={() =>
                    matched && room?.id ? onSelect(room) : onSelectShiftContact && onSelectShiftContact(contact)
                  }
                  onTogglePin={() => {}}
                  canEditDelete={false}
                />
              ))}
              <Divider />
            </View>
          )}

          {(filter === 'all' || filter === 'dm') && grouped.dmChats.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>DMs</Text>
              {grouped.dmChats.map((item) => (
                <ChatListItem
                  key={`dm-${item.id}`}
                  room={item}
                  onPress={onSelect}
                  onTogglePin={canPin ? onTogglePin : () => {}}
                  onDelete={onDeleteRoom}
                  onEdit={onEditRoom}
                  canEditDelete={!item.pharmacy && ((item as any).can_delete ?? true)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 12,
    gap: 8,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  search: {
    borderRadius: 12,
  },
  searchInput: {
    fontSize: 14,
  },
  actions: { flexDirection: 'row', gap: 8 },
  button: { borderRadius: 12, flex: 1 },
  filters: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
  },
  section: { paddingVertical: 6 },
  sectionTitle: { fontWeight: '700', color: '#6B7280' },
});
