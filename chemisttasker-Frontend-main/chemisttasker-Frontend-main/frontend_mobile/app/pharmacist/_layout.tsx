import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { ActivityIndicator, View, StyleSheet, TouchableOpacity } from 'react-native';
import { Avatar, IconButton, Modal, Portal, List, Divider, Button, Text } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { getNotifications, markNotificationsAsRead } from '@chemisttasker/shared-core';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { resolveCalendarNotificationRoute, resolveChatNotificationRoomId, resolveShiftNotificationRoute } from '@/utils/notificationNavigation';
import { triggerShiftSlotActivity } from '@/utils/pushNotifications';
import { getMessageDetailRoute } from '@/utils/chatRoutes';

const tabTitles: Record<string, string> = {
  dashboard: 'Home',
  'shifts/index': 'Shifts',
  chat: 'Chat',
  hub: 'Hub',
  invoice: 'Invoices',
  calendar: 'Calendar',
  'talent-board': 'Talent Board',
  availability: 'Availability',
  'publish-availability': 'Publish Availability',
  'profile-basic-info': 'Profile',
  'profile-identity': 'Profile',
  'profile-skills': 'Profile',
  'profile-payment': 'Profile',
  'profile-referees': 'Profile',
  'profile-rate': 'Profile',
  'profile-bio': 'Profile',
};

const sidebarItems = [
  { label: 'Home', icon: 'home', route: '/pharmacist/dashboard' },
  { label: 'Shifts', icon: 'calendar-range', route: '/pharmacist/shifts' },
  { label: 'Publish Availability', icon: 'calendar-plus', route: '/pharmacist/publish-availability' },
  { label: 'Availability', icon: 'calendar-clock', route: '/pharmacist/availability' },
  { label: 'Calendar', icon: 'calendar', route: '/pharmacist/calendar' },
  { label: 'Chat', icon: 'message', route: '/pharmacist/chat' },
  { label: 'Hub', icon: 'view-grid', route: '/pharmacist/hub' },
  { label: 'Invoices', icon: 'file-document-multiple', route: '/pharmacist/invoice' },
  { label: 'Talent Board', icon: 'account-search', route: '/pharmacist/talent-board' },
  { label: 'Profile', icon: 'account-circle', route: '/pharmacist/profile' },
];

function PharmacistSidebar({
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
        <Text variant="titleMedium" style={styles.sidebarTitle}>Pharmacist menu</Text>
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

export default function PharmacistTabs() {
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
      // support both list responses and objects with unread_count
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
      // best-effort badge; ignore errors
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

  // Update badge immediately when a push arrives in foreground/background
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => {
      void loadUnread();
    });
    return () => sub.remove();
  }, [loadUnread]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data: any = response?.notification?.request?.content?.data || {};
      triggerShiftSlotActivity(data);
      const roomId = resolveChatNotificationRoomId({
        actionUrl: data.action_url ?? data.actionUrl ?? null,
        payload: data,
      });
      if (roomId) {
        router.push(getMessageDetailRoute(user?.role, roomId) as any);
        return;
      }
      const calendarRoute = resolveCalendarNotificationRoute({
        actionUrl: data.action_url ?? data.actionUrl ?? null,
        payload: data,
        userRole: user?.role ?? null,
      });
      if (calendarRoute) {
        router.push(calendarRoute as any);
        return;
      }
      const route = resolveShiftNotificationRoute({
        actionUrl: data.action_url ?? data.actionUrl ?? null,
        payload: data,
        userRole: user?.role ?? null,
      });
      if (route) {
        router.push(route as any);
      }
    });
    return () => sub.remove();
  }, [router, user?.role]);

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data: any = notification?.request?.content?.data || {};
      triggerShiftSlotActivity(data);
    });
    return () => sub.remove();
  }, []);

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
      router.push('/pharmacist/notifications' as any);
    }
  }, [router]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'PHARMACIST') {
      switch (user.role) {
        case 'OWNER':
          router.replace('/owner' as any);
          break;
        case 'OTHER_STAFF':
          router.replace('/otherstaff' as any);
          break;
        case 'EXPLORER':
          router.replace('/explorer' as any);
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
    const isDash = segments[0] === 'pharmacist' && (segments[1] ?? 'dashboard') === 'dashboard';
    const isProfileSubPage =
      segments[0] === 'pharmacist' &&
      ['profile-basic-info', 'profile-identity', 'profile-skills', 'profile-payment', 'profile-referees', 'profile-rate', 'profile-bio'].includes(segments[1] ?? '');
    let parent: string | null = null;
    if (isProfileSubPage) {
      parent = '/pharmacist/profile';
    } else if (segments.length > 2) {
      parent = `/${segments.slice(0, -1).join('/')}`;
    }
    return { isDashboard: isDash, backTarget: parent };
  }, [pathname]);

  if (isLoading || !user || user.role !== 'PHARMACIST') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <>
      <PharmacistSidebar visible={sidebarVisible} onDismiss={() => setSidebarVisible(false)} />
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
          headerTitle: tabTitles[route.name] || 'Pharmacist',
          headerRightContainerStyle: { paddingRight: 10 },
          headerLeft: () => (
            <IconButton icon="menu" onPress={() => setSidebarVisible(true)} />
          ),
          headerRight: () => {
            const canGoBack = typeof router.canGoBack === 'function' ? router.canGoBack() : false;
            const showBack = !isDashboard;
            return showBack ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <IconButton
                  icon="arrow-left"
                  onPress={() => {
                    // Force deterministic back path for hidden profile sub-pages.
                    if (backTarget === '/pharmacist/profile') {
                      router.push('/pharmacist/profile' as any);
                    } else if (canGoBack) {
                      router.back();
                    } else if (backTarget) {
                      router.push(backTarget as any);
                    } else {
                      router.push('/pharmacist/dashboard' as any);
                    }
                  }}
                />
                <TouchableOpacity onPress={openNotifications} style={{ marginHorizontal: 4 }}>
                  <View style={styles.bellWrapper}>
                    <IconButton icon="bell-outline" />
                    {unreadCount > 0 && <View style={styles.badgeDot} />}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/pharmacist/profile' as any)}>
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
                <TouchableOpacity onPress={() => router.push('/pharmacist/notifications' as any)} style={{ marginHorizontal: 4 }}>
                  <View>
                    <IconButton icon="bell-outline" />
                    {unreadCount > 0 && <View style={styles.badgeDot} />}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/pharmacist/profile' as any)}>
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
        {/* Core tabs */}
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Home',
            tabBarAccessibilityLabel: 'Home tab',
            tabBarIcon: ({ color, size }) => (
              <IconButton icon="home" iconColor={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="shifts/index"
          options={{
            title: 'Shifts',
            tabBarAccessibilityLabel: 'Shifts tab',
            tabBarIcon: ({ color, size }) => (
              <IconButton icon="calendar" iconColor={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Chat',
            tabBarAccessibilityLabel: 'Chat tab',
            tabBarIcon: ({ color, size }) => (
              <IconButton icon="message" iconColor={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="hub"
          options={{
            title: 'Hub',
            tabBarAccessibilityLabel: 'Hub tab',
            tabBarIcon: ({ color, size }) => (
              <IconButton icon="view-grid" iconColor={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="invoice"
          options={{
            title: 'Invoices',
            tabBarAccessibilityLabel: 'Invoices tab',
            tabBarIcon: ({ color, size }) => (
              <IconButton icon="file-document-multiple" iconColor={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="publish-availability"
          options={{
            title: 'Publish',
            tabBarAccessibilityLabel: 'Publish availability tab',
            tabBarIcon: ({ color, size }) => (
              <IconButton icon="calendar-plus" iconColor={color} size={size} />
            ),
          }}
        />

        {/* Hidden routes to prevent extra tabs */}
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="availability" options={{ href: null }} />
        <Tabs.Screen name="onboarding" options={{ href: null }} />
        <Tabs.Screen name="profile-basic-info" options={{ href: null }} />
        <Tabs.Screen name="profile-identity" options={{ href: null }} />
        <Tabs.Screen name="profile-skills" options={{ href: null }} />
        <Tabs.Screen name="profile-payment" options={{ href: null }} />
        <Tabs.Screen name="profile-referees" options={{ href: null }} />
        <Tabs.Screen name="profile-rate" options={{ href: null }} />
        <Tabs.Screen name="profile-bio" options={{ href: null }} />
        <Tabs.Screen name="interests" options={{ href: null }} />
        <Tabs.Screen name="learning" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
        <Tabs.Screen name="profile" options={{ href: null }} />
        <Tabs.Screen name="messages/[id]" options={{ href: null }} />
        <Tabs.Screen name="shifts/[id]" options={{ href: null }} />
        <Tabs.Screen name="invoices" options={{ href: null }} />
        <Tabs.Screen name="invoice/new" options={{ href: null }} />
        <Tabs.Screen name="invoice/[id]" options={{ href: null }} />
        <Tabs.Screen name="calendar" options={{ href: null }} />
        <Tabs.Screen name="talent-board" options={{ href: null }} />
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
