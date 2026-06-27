import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Avatar, Button, Divider, IconButton, List, Modal, Portal, Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { getNotifications, markNotificationsAsRead } from '@chemisttasker/shared-core';
import { useAuth } from '../../context/AuthContext';
import { resolveChatNotificationRoomId } from '@/utils/notificationNavigation';
import { getMessageDetailRoute } from '@/utils/chatRoutes';

const tabTitles: Record<string, string> = {
  dashboard: 'Home',
  chat: 'Chat',
  profile: 'Profile',
  'talent-board': 'Talent Board',
  calendar: 'Calendar',
  'profile-basic-info': 'Profile',
  'profile-identity': 'Profile',
  'profile-interests': 'Profile',
  'profile-referees': 'Profile',
  'profile-bio': 'Profile',
};

const sidebarItems = [
  { label: 'Home', icon: 'home', route: '/explorer/dashboard' },
  { label: 'Chat', icon: 'message', route: '/explorer/chat' },
  { label: 'Profile', icon: 'account-circle', route: '/explorer/profile' },
  { label: 'Talent Board', icon: 'account-search', route: '/explorer/talent-board' },
  { label: 'Calendar', icon: 'calendar', route: '/explorer/calendar' },
];

function ExplorerSidebar({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const { logout } = useAuth();

  const handleNav = (route: string) => {
    onDismiss();
    router.push(route as any);
  };

  const handleLogout = async () => {
    onDismiss();
    await logout();
    router.replace('/login' as any);
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.sidebar}>
        <Text variant="titleMedium" style={styles.sidebarTitle}>Explorer menu</Text>
        <Divider />
        {sidebarItems.map((item) => (
          <List.Item
            key={`${item.route}-${item.label}`}
            title={item.label}
            left={(props) => <List.Icon {...props} icon={item.icon} />}
            onPress={() => handleNav(item.route)}
          />
        ))}
        <Divider />
        <Button icon="logout" textColor="#DC2626" onPress={handleLogout}>
          Logout
        </Button>
      </Modal>
    </Portal>
  );
}

export default function ExplorerTabs() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    // Do not update the photo based on an intermediate or loading user object.
    // This prevents the avatar from flickering during navigation.
    if (isLoading) {
      return;
    }
    if (!user) {
      setPhotoUrl(null);
      return;
    }
    const newPhoto =
      (user as any)?.profile_photo ||
      (user as any)?.profile_photo_url ||
      (user as any)?.profilePhoto ||
      null;
    setPhotoUrl(newPhoto);
  }, [user, isLoading]);

  const loadUnread = useCallback(async () => {
    try {
      const res: any = await getNotifications();
      if (typeof res?.unread_count === 'number') {
        setUnreadCount(res.unread_count);
        return;
      }
      if (typeof res?.unreadCount === 'number') {
        setUnreadCount(res.unreadCount);
        return;
      }
      const list = Array.isArray(res?.results) ? res.results : Array.isArray(res) ? res : [];
      const unread = list.filter((n: any) => !(n.read_at || n.readAt)).length;
      setUnreadCount(unread);
    } catch {
      // best-effort badge
    }
  }, []);

  useEffect(() => {
    void loadUnread();
  }, [loadUnread]);

  useFocusEffect(
    React.useCallback(() => {
      void loadUnread();
    }, [loadUnread])
  );

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => {
      void loadUnread();
    });
    return () => sub.remove();
  }, [loadUnread]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data: any = response?.notification?.request?.content?.data || {};
      const roomId = resolveChatNotificationRoomId({
        actionUrl: data.action_url ?? data.actionUrl ?? null,
        payload: data,
      });
      if (roomId) {
        router.push(getMessageDetailRoute(user?.role, roomId) as any);
        return;
      }
    });
    return () => sub.remove();
  }, [router, user?.role]);

  const openNotifications = useCallback(async () => {
    try {
      const res: any = await getNotifications();
      const list = Array.isArray(res?.results) ? res.results : Array.isArray(res) ? res : [];
      const unreadIds = list.filter((n: any) => !(n.read_at || n.readAt)).map((n: any) => n.id);
      if (unreadIds.length) {
        await markNotificationsAsRead(unreadIds);
      }
      setUnreadCount(0);
    } catch {
      // ignore errors; navigate anyway
    } finally {
      router.push('/explorer/notifications' as any);
    }
  }, [router]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'EXPLORER') {
      switch (user.role) {
        case 'OWNER':
          router.replace('/owner' as any);
          break;
        case 'PHARMACIST':
          router.replace('/pharmacist' as any);
          break;
        case 'OTHER_STAFF':
          router.replace('/otherstaff' as any);
          break;
        case 'ORGANIZATION':
          router.replace('/organization/dashboard' as any);
          break;
        default:
          router.replace('/login');
      }
    }
  }, [user, isLoading, router]);

  const { isDashboard, backTarget } = useMemo(() => {
    if (!pathname) return { isDashboard: true, backTarget: null };
    const segments = pathname.split('/').filter(Boolean);
    const isDash = segments[0] === 'explorer' && (segments[1] ?? 'dashboard') === 'dashboard';
    const isProfileSubPage =
      segments[0] === 'explorer' &&
      ['profile-basic-info', 'profile-identity', 'profile-interests', 'profile-referees', 'profile-bio'].includes(segments[1] ?? '');
    let parent: string | null = null;
    if (isProfileSubPage) {
      parent = '/explorer/profile';
    } else if (segments.length > 2) {
      parent = `/${segments.slice(0, -1).join('/')}`;
    }
    return { isDashboard: isDash, backTarget: parent };
  }, [pathname]);

  if (isLoading || !user || user.role !== 'EXPLORER') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <>
      <ExplorerSidebar visible={sidebarVisible} onDismiss={() => setSidebarVisible(false)} />
      <Tabs
        screenOptions={({ route }) => ({
          tabBarActiveTintColor: '#6366F1',
          tabBarInactiveTintColor: '#9CA3AF',
          tabBarStyle: {
            backgroundColor: '#FFFFFF',
            borderTopWidth: 1,
            borderTopColor: '#E5E7EB',
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
          },
          headerShown: true,
          headerTitle: tabTitles[route.name] || 'Explorer',
          headerRightContainerStyle: { paddingRight: 10 },
          headerLeft: () => <IconButton icon="menu" onPress={() => setSidebarVisible(true)} />,
          headerRight: () => {
            const canGoBack = typeof router.canGoBack === 'function' ? router.canGoBack() : false;
            const showBack = !isDashboard;
            return showBack ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <IconButton
                  icon="arrow-left"
                  onPress={() => {
                    if (backTarget === '/explorer/profile') {
                      router.push('/explorer/profile' as any);
                    } else if (canGoBack) {
                      router.back();
                    } else if (backTarget) {
                      router.push(backTarget as any);
                    } else {
                      router.push('/explorer/dashboard' as any);
                    }
                  }}
                />
                <TouchableOpacity onPress={openNotifications} style={{ marginHorizontal: 4 }}>
                  <View style={styles.bellWrapper}>
                    <IconButton icon="bell-outline" />
                    {unreadCount > 0 && <View style={styles.badgeDot} />}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/explorer/profile' as any)}>
                  {photoUrl ? (
                    <Avatar.Image size={32} source={{ uri: photoUrl }} />
                  ) : (
                    <Avatar.Text
                      size={32}
                      label={(user?.username || user?.email || 'U').charAt(0).toUpperCase()}
                      style={styles.avatar}
                      labelStyle={styles.avatarLabel}
                    />
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={openNotifications} style={{ marginHorizontal: 4 }}>
                  <View style={styles.bellWrapper}>
                    <IconButton icon="bell-outline" />
                    {unreadCount > 0 && <View style={styles.badgeDot} />}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/explorer/profile' as any)}>
                  {photoUrl ? (
                    <Avatar.Image size={32} source={{ uri: photoUrl }} />
                  ) : (
                    <Avatar.Text
                      size={32}
                      label={(user?.username || user?.email || 'U').charAt(0).toUpperCase()}
                      style={styles.avatar}
                      labelStyle={styles.avatarLabel}
                    />
                  )}
                </TouchableOpacity>
              </View>
            );
          },
        })}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Home',
            tabBarAccessibilityLabel: 'Home tab',
            tabBarIcon: ({ color, size }) => <IconButton icon="home" iconColor={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Chat',
            tabBarAccessibilityLabel: 'Chat tab',
            tabBarIcon: ({ color, size }) => <IconButton icon="message" iconColor={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarAccessibilityLabel: 'Profile tab',
            tabBarIcon: ({ color, size }) => <IconButton icon="account-circle" iconColor={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="talent-board"
          options={{
            title: 'Talent Board',
            tabBarAccessibilityLabel: 'Talent Board tab',
            tabBarIcon: ({ color, size }) => <IconButton icon="account-search" iconColor={color} size={size} />,
          }}
        />

        <Tabs.Screen name="profile-basic-info" options={{ href: null }} />
        <Tabs.Screen name="profile-identity" options={{ href: null }} />
        <Tabs.Screen name="profile-interests" options={{ href: null }} />
        <Tabs.Screen name="profile-referees" options={{ href: null }} />
        <Tabs.Screen name="profile-bio" options={{ href: null }} />
        <Tabs.Screen name="shifts" options={{ href: null }} />
        <Tabs.Screen name="availability" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
        <Tabs.Screen name="messages/[id]" options={{ href: null }} />
        <Tabs.Screen name="calendar" options={{ href: null }} />
        <Tabs.Screen name="shifts/[id]" options={{ href: null }} />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 8,
    borderRadius: 12,
  },
  sidebarTitle: {
    marginBottom: 8,
    fontWeight: '600',
  },
  badgeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  bellWrapper: {
    position: 'relative',
  },
  avatar: { backgroundColor: '#6366F1' },
  avatarLabel: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
});
