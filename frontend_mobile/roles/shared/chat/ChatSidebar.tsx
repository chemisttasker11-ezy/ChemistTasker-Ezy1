import React, { useMemo } from 'react';
import { View, StyleSheet, FlatList, ScrollView } from 'react-native';
import { Searchbar, Button, Text, Divider, Chip, IconButton, Menu, useTheme } from 'react-native-paper';
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
  pharmacyTeams?: Array<{ id: number; name: string }>;
  onOpenPharmacyTeam?: (pharmacyId: number) => void;
  openingPharmacyId?: number | null;
  shiftContacts?: any[];
  onSelectShiftContact?: (contact: any) => void;
  onDeleteRoom?: (room: ChatRoom) => void;
  onEditRoom?: (room: ChatRoom) => void;
  onManageGroup?: (room: ChatRoom) => void;
  canManageGroup?: (room: ChatRoom) => boolean;
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
  pharmacyTeams = [],
  onOpenPharmacyTeam,
  openingPharmacyId = null,
  shiftContacts = [],
  onSelectShiftContact,
  onDeleteRoom,
  onEditRoom,
  onManageGroup,
  canManageGroup,
}: Props) {
  const theme = useTheme();
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

  // Contact identity must be resolved by the backend using the real user ID.
  // Matching a room by display name/email could open another worker's DM when names collide.
  const shiftItems = useMemo(() => {
    return (shiftContacts || []).map((contact, index) => {
      const display = displayNameFromUser(contact.user) || contact.pharmacy_name || 'Shift Contact';
      const userId = contact?.user?.id;
      return {
        key: `shift-${userId ?? index}-${contact?.shift_id ?? index}`,
        contact,
        room: {
          id: -100000 - index,
          title: display,
          type: 'GROUP',
          unread_count: 0,
          updated_at: contact.shift_date,
          last_message: undefined,
        } as ChatRoom,
      };
    });
  }, [shiftContacts]);

  const listForFilter = useMemo(() => {
    if (filter === 'group') return grouped.groupChats;
    if (filter === 'dm') return grouped.dmChats;
    if (filter === 'shift') return shiftItems.map((s) => s.room);
    return filtered;
  }, [filter, grouped, filtered, shiftItems]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
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

      {pharmacyTeams.length > 0 && (filter === 'all' || filter === 'group') ? (
        <View style={styles.teamSection}>
          <Text style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>Pharmacy teams</Text>
          <Text style={[styles.teamHint, { color: theme.colors.onSurfaceVariant }]}>Open your pharmacy’s shared team conversation</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamChips}>
            {pharmacyTeams.map(pharmacy => (
              <Chip key={pharmacy.id} mode="outlined" icon="account-group" disabled={openingPharmacyId != null} onPress={() => onOpenPharmacyTeam?.(pharmacy.id)} accessibilityLabel={`Open ${pharmacy.name} team chat`}>
                {openingPharmacyId === pharmacy.id ? 'Opening…' : pharmacy.name}
              </Chip>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {listForFilter.length === 0 && !(pharmacyTeams.length > 0 && (filter === 'all' || filter === 'group')) ? (
        <View style={styles.empty}>
          <Text>No conversations found</Text>
        </View>
      ) : (
        <ScrollView>
          {filter === 'all' && grouped.pinned.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>Pinned</Text>
              {grouped.pinned.map((item) => (
                <ChatListItem
                  key={`p-${item.id}`}
                  room={item}
                  onPress={onSelect}
                  onTogglePin={canPin ? onTogglePin : () => {}}
                  onDelete={onDeleteRoom}
                  onEdit={onEditRoom}
                  onManageMembers={onManageGroup}
                  canManageMembers={item.type === 'GROUP' && Boolean(canManageGroup?.(item))}
                  canEditDelete={!item.pharmacy && ((item as any).can_delete ?? true)}
                />
              ))}
              <Divider />
            </View>
          )}

          {(filter === 'all' || filter === 'group') && grouped.groupChats.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>Groups</Text>
              {grouped.groupChats.map((item) => (
                <ChatListItem
                  key={`g-${item.id}`}
                  room={item}
                  onPress={onSelect}
                  onTogglePin={canPin ? onTogglePin : () => {}}
                  onDelete={onDeleteRoom}
                  onEdit={onEditRoom}
                  onManageMembers={onManageGroup}
                  canManageMembers={Boolean(canManageGroup?.(item))}
                  canEditDelete={!item.pharmacy && ((item as any).can_delete ?? true)}
                />
              ))}
              <Divider />
            </View>
          )}

          {filter === 'shift' && shiftItems.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>Shifts</Text>
              {shiftItems.map(({ key, room, contact }) => (
                <ChatListItem
                  key={key}
                  room={room}
                  onPress={() => onSelectShiftContact?.(contact)}
                  onTogglePin={() => {}}
                  canEditDelete={false}
                />
              ))}
              <Divider />
            </View>
          )}

          {(filter === 'all' || filter === 'dm') && grouped.dmChats.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>DMs</Text>
              {grouped.dmChats.map((item) => (
                <ChatListItem
                  key={`dm-${item.id}`}
                  room={item}
                  onPress={onSelect}
                  onTogglePin={canPin ? onTogglePin : () => {}}
                  onDelete={onDeleteRoom}
                  onEdit={onEditRoom}
                  onManageMembers={onManageGroup}
                  canManageMembers={false}
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
  teamSection: { paddingVertical: 12, gap: 8 },
  teamHint: { fontSize: 12 },
  teamChips: { gap: 8, paddingVertical: 4 },
  section: { paddingVertical: 6 },
  sectionTitle: { fontWeight: '700' },
});
