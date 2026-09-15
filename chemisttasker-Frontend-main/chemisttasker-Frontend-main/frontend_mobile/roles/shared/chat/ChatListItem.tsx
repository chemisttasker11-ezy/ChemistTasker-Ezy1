import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text, Avatar, Badge, Menu, IconButton, Divider } from 'react-native-paper';
import { formatDistanceToNow } from 'date-fns';
import type { ChatRoom } from './types';

type Props = {
  room: ChatRoom;
  onPress: (room: ChatRoom) => void;
  onTogglePin: (room: ChatRoom) => void;
  onDelete?: (room: ChatRoom) => void;
  onEdit?: (room: ChatRoom) => void;
  canEditDelete?: boolean;
};

const getTitle = (room: ChatRoom) => {
  const pharm = (room as any)?.pharmacy;
  const pharmacyName = pharm && typeof pharm === 'object' ? pharm.name : undefined;
  return room.title || pharmacyName || room.id?.toString() || 'Chat';
};

export default function ChatListItem({ room, onPress, onTogglePin, onDelete, onEdit, canEditDelete }: Props) {
  const lastMessage = (room as any)?.last_message;
  const subtitle = lastMessage?.body || 'No messages yet';
  const ts = lastMessage?.created_at || room.updated_at;
  const timeLabel = ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : '';
  const [menuVisible, setMenuVisible] = React.useState(false);

  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress(room)}>
      <Avatar.Text size={40} label={getTitle(room).slice(0, 2).toUpperCase()} style={styles.avatar} />
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text variant="titleSmall" numberOfLines={1} style={styles.title}>
            {getTitle(room)}
          </Text>
          <View style={styles.rightBadges}>
            {room.is_pinned ? <Badge style={styles.pinBadge}>📌</Badge> : null}
            {room.unread_count ? <Badge style={styles.badge}>{room.unread_count}</Badge> : null}
            <Menu
              visible={menuVisible}
              onDismiss={() => setMenuVisible(false)}
              anchor={<IconButton icon="dots-vertical" size={18} onPress={() => setMenuVisible(true)} />}
            >
              <Menu.Item leadingIcon={room.is_pinned ? 'pin-off' : 'pin'} onPress={() => { setMenuVisible(false); onTogglePin(room); }} title={room.is_pinned ? 'Unpin' : 'Pin'} />
              {canEditDelete ? <Menu.Item leadingIcon="pencil" onPress={() => { setMenuVisible(false); onEdit?.(room); }} title="Edit" /> : null}
              {canEditDelete ? <Menu.Item leadingIcon="delete" onPress={() => { setMenuVisible(false); onDelete?.(room); }} title="Delete" /> : null}
            </Menu>
          </View>
        </View>
        <View style={styles.metaRow}>
          <Text variant="bodyMedium" numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
          {timeLabel ? (
            <Text variant="labelSmall" style={styles.time}>
              {timeLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  avatar: {
    marginRight: 12,
    backgroundColor: '#EEF2FF',
  },
  content: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    flex: 1,
    marginRight: 8,
  },
  badge: {
    backgroundColor: '#6366F1',
  },
  pinBadge: {
    backgroundColor: '#F59E0B',
    marginLeft: 6,
  },
  rightBadges: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subtitle: {
    flex: 1,
    color: '#4B5563',
    marginRight: 8,
  },
  time: {
    color: '#9CA3AF',
  },
  pinAction: {
    display: 'none',
  },
  pinActionText: {
    fontSize: 12,
  },
});
