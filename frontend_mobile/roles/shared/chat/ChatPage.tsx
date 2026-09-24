import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, FAB, Menu, Modal, Portal, Snackbar, Text, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import ChatSidebar from './ChatSidebar';
import NewChatModal from './NewChatModal';
import NewGroupModal from './NewGroupModal';
import GroupManageModal from './GroupManageModal';
import { useChatRooms, useShiftContacts, startDirectChat } from './hooks';
import { createOrUpdateGroupRoom, toggleRoomPinService, fetchChatParticipants, deleteRoomService } from '@chemisttasker/shared-core';
import { useFocusEffect } from '@react-navigation/native';
import type { ChatRoom } from './types';
import { subscribeChatNavigation, subscribeUnreadBump, subscribeUnreadCount } from '@/utils/pushNotifications';
import { fetchUnreadCount } from '@/utils/unread';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveRoomId, setActiveRoomId } from './activeRoomState';
import { displayNameFromUser } from './displayName';
import { getMessageDetailRoute } from '@/utils/chatRoutes';
import { brandColors, getPersonaPalette } from '@/constants/theme';

function resolveName(room: ChatRoom): string {
  const pharm = (room as any)?.pharmacy;
  const pharmacyName = pharm && typeof pharm === 'object' ? (pharm as any).name : undefined;
  return room.title || pharmacyName || 'Chat';
}

export default function ChatPage() {
  const router = useRouter();
  const { user } = useAuth();
  const persona = getPersonaPalette(user?.role);
  const { rooms, loading, refreshing, error, refresh, reload } = useChatRooms();
  const { contacts: shiftContacts } = useShiftContacts();
  const role = (user?.role || '').toUpperCase();
  const [search, setSearch] = useState('');
  const [newChatVisible, setNewChatVisible] = useState(false);
  const [newGroupVisible, setNewGroupVisible] = useState(false);
  const [manageGroupRoom, setManageGroupRoom] = useState<ChatRoom | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [participantAdmins, setParticipantAdmins] = useState<Record<number, boolean>>({});
  const [fabMenuVisible, setFabMenuVisible] = useState(false);
  const [editRoom, setEditRoom] = useState<ChatRoom | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);

  const sortedRooms = useMemo(() => {
    const pinned = rooms.filter((r) => r.is_pinned);
    const unpinned = rooms.filter((r) => !r.is_pinned);
    const sortByTime = (a: any, b: any) => {
      const tsA = (a as any)?.last_message?.created_at || a.updated_at || '';
      const tsB = (b as any)?.last_message?.created_at || b.updated_at || '';
      return tsA < tsB ? 1 : -1;
    };
    return [...pinned.sort(sortByTime), ...unpinned.sort(sortByTime)];
  }, [rooms]);

  useEffect(() => {
    const loadParticipants = async () => {
      try {
        const data: any = await fetchChatParticipants();
        const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
        const map: Record<number, boolean> = {};
        list.forEach((p: any) => {
          const id = p.id ?? p.membership_id;
          const isAdmin = p.is_admin ?? p.isAdmin ?? false;
          if (id) map[id] = !!isAdmin;
        });
        setParticipantAdmins(map);
      } catch {
        // ignore
      }
    };
    loadParticipants();
  }, []);

  const canManageGroup = useCallback(
    (room: ChatRoom) => {
      if ((room as any)?.can_manage !== undefined) return Boolean((room as any).can_manage);
      const myMembershipId = (room as any)?.my_membership_id;
      const isAdmin = myMembershipId ? participantAdmins[myMembershipId] : false;
      if ((room as any)?.pharmacy) {
        // If backend didn't set can_manage, fall back to comms-admin approximation
        const elevated = role === 'OWNER' || role === 'ORG_ADMIN' || role === 'ADMIN' || role === 'SUPERUSER';
        return elevated || isAdmin;
      }
      return (room as any)?.created_by_user_id === user?.id || isAdmin;
    },
    [participantAdmins, user?.id, role],
  );

  const openRoom = (room: ChatRoom, nameOverride?: string) => {
    const id = room.id;
    if (!id) return;
    if (room.type === 'GROUP' && canManageGroup(room)) {
      setManageGroupRoom(room);
    }
    setActiveRoomId(id);
    router.push({
      pathname: getMessageDetailRoute(user?.role, id) as any,
      params: { id: id.toString(), name: nameOverride || resolveName(room) },
    });
  };

  const handleChatCreated = (roomId: number, displayName?: string) => {
    setSnackbar('Chat ready');
    reload();
    openRoom({ id: roomId } as ChatRoom, displayName);
  };

  const handleSelectShiftContact = useCallback(
    async (contact: any) => {
      try {
        const userId = contact?.user?.id;
        if (!userId) return;
        const room = await startDirectChat({ userId });
        const roomId = (room as any)?.id ?? (room as any)?.room_id;
        if (roomId) {
          await reload();
          const name = displayNameFromUser(contact?.user) || contact?.user?.email;
          openRoom({ id: roomId, title: name } as any, name);
        }
      } catch (err: any) {
        setSnackbar(err?.message || 'Failed to open shift contact');
      }
    },
    [openRoom, reload],
  );

  const handleTogglePin = useCallback(
    async (room: ChatRoom) => {
      try {
        const updated = await toggleRoomPinService(room.id, { target: 'conversation' } as any);
        setSnackbar(updated?.is_pinned ? 'Pinned' : 'Unpinned');
        await reload();
      } catch (err: any) {
        setSnackbar(err?.message || 'Pin toggle failed');
      }
    },
    [reload],
  );

  useFocusEffect(
    useCallback(() => {
      reload();
      setActiveRoomId(null); // Clear active room when returning to the list
    }, [reload]),
  );

  useEffect(() => {
    const subNav = subscribeChatNavigation((roomId) => {
      openRoom({ id: roomId } as ChatRoom);
    });
    // This was causing reloads and wiping message state. The message screen handles its own live updates.
    // Only reload the room list if the message is for a room that is NOT the currently active one.
    const subUnread = subscribeUnreadBump((payload: any) => { // This line is now valid
      const messageRoomId = payload?.room ?? payload?.message?.room_id;
      const activeRoomId = getActiveRoomId();
      if (messageRoomId && messageRoomId !== activeRoomId) {
        reload();
      }
    });
    const subUnreadCount = subscribeUnreadCount(() => {
      reload();
    }, fetchUnreadCount);
    return () => {
      subNav.remove();
      subUnread.remove();
      subUnreadCount.remove();
    };
  }, [openRoom, reload]);

  const canCreateChat = useMemo(() => {
    return role === 'OWNER' || role === 'ORG_ADMIN' || role === 'ADMIN' || role === 'SUPERUSER';
  }, [role]);
  const canPin = useMemo(() => {
    return canCreateChat || role === 'PHARMACIST' || role === 'OTHERSTAFF' || role === 'EXPLORER';
  }, [canCreateChat, role]);

  // Live unread via sockets for current rooms: open lightweight listeners to trigger reload
  useEffect(() => {
    // Disabled multi-room watchers to avoid WS churn; message screen handles live updates per room
    return () => { };
  }, [rooms, reload]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>Loading chats...</Text>
        </View>
      ) : (
      <ChatSidebar
        rooms={sortedRooms}
        search={search}
        onSearchChange={setSearch}
        onSelect={openRoom}
        onNewChat={() => setNewChatVisible(true)}
        onNewGroup={() => setNewGroupVisible(true)}
        onTogglePin={handleTogglePin}
        refreshing={refreshing}
        onRefresh={refresh}
        canCreate={canCreateChat}
        canPin={canPin}
        shiftContacts={shiftContacts}
        onSelectShiftContact={handleSelectShiftContact}
        onDeleteRoom={async (room) => {
          if ((room as any)?.can_delete === false) return;
          try {
            await deleteRoomService((room as any).id);
            setSnackbar('Conversation deleted');
            reload();
          } catch (err: any) {
            setSnackbar(err?.message || 'Delete failed');
          }
        }}
        onEditRoom={(room) => {
          if ((room as any)?.pharmacy) {
            setSnackbar('Pharmacy chat names cannot be changed.');
            return;
          }
          setEditRoom(room);
          setEditTitle((room as any).title || '');
        }}
      />
      )}

      <NewChatModal
        visible={newChatVisible}
        onDismiss={() => setNewChatVisible(false)}
        onCreated={handleChatCreated}
      />
      <NewGroupModal
        visible={newGroupVisible}
        onDismiss={() => setNewGroupVisible(false)}
        onCreated={handleChatCreated}
      />
      <GroupManageModal
        room={manageGroupRoom}
        visible={!!manageGroupRoom}
        onDismiss={() => setManageGroupRoom(null)}
        onUpdated={reload}
        currentUserId={user?.id ?? null}
        canManage={manageGroupRoom ? canManageGroup(manageGroupRoom) : false}
      />

      <Portal>
        <Modal
          visible={!!editRoom}
          onDismiss={() => {
            if (!savingTitle) {
              setEditRoom(null);
              setEditTitle('');
            }
          }}
          contentContainerStyle={styles.editModal}
        >
          <Text variant="titleMedium" style={styles.editTitle}>Rename group</Text>
          <Text variant="bodySmall" style={styles.editHint}>Choose a clear name your group members will recognise.</Text>
          <TextInput
            mode="outlined"
            label="Group name"
            value={editTitle}
            onChangeText={setEditTitle}
            autoFocus
            maxLength={80}
            disabled={savingTitle}
          />
          <View style={styles.editActions}>
            <Button
              mode="text"
              disabled={savingTitle}
              onPress={() => {
                setEditRoom(null);
                setEditTitle('');
              }}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              loading={savingTitle}
              disabled={savingTitle || !editTitle.trim()}
              onPress={async () => {
                if (!editRoom || !editTitle.trim()) return;
                setSavingTitle(true);
                try {
                  await createOrUpdateGroupRoom({ roomId: (editRoom as any).id, title: editTitle.trim() });
                  setSnackbar('Group name updated');
                  setEditRoom(null);
                  setEditTitle('');
                  reload();
                } catch (err: any) {
                  setSnackbar(err?.message || 'Unable to update the group name.');
                } finally {
                  setSavingTitle(false);
                }
              }}
            >
              Save
            </Button>
          </View>
        </Modal>
      </Portal>

      <Snackbar visible={!!(error || snackbar)} onDismiss={() => { setSnackbar(null); }} duration={3000}>
        {error || snackbar || ''}
      </Snackbar>

      {canCreateChat ? (
        <Portal>
          <Menu
            visible={fabMenuVisible}
            onDismiss={() => setFabMenuVisible(false)}
            anchor={
              <FAB
                icon="plus"
                style={[styles.fab, { backgroundColor: persona.accent }]}
                onPress={() => setFabMenuVisible(true)}
                color="#fff"
              />
            }
          >
            <Menu.Item onPress={() => { setFabMenuVisible(false); setNewChatVisible(true); }} title="New Chat" />
            <Menu.Item onPress={() => { setFabMenuVisible(false); setNewGroupVisible(true); }} title="New Group" />
          </Menu>
        </Portal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: brandColors.mist,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  muted: {
    color: brandColors.body,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
  },
  editModal: {
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 16,
    backgroundColor: brandColors.white,
    gap: 12,
  },
  editTitle: {
    color: brandColors.navy,
    fontWeight: '800',
  },
  editHint: {
    color: brandColors.body,
    lineHeight: 18,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
});
