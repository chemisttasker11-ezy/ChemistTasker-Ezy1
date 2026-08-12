import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Avatar, Button, Divider, IconButton, List, Modal, Portal, Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { getNotifications, markNotificationsAsRead } from '@chemisttasker/shared-core';
import { useAuth } from '../../context/AuthContext';
import {
  resolveCalendarNotificationRoute,
  resolveChatNotificationRoomId,
  resolveShiftNotificationRoute,
} from '@/utils/notificationNavigation';
import { getMessageDetailRoute } from '@/utils/chatRoutes';
import { useUnsavedChangesRegistry } from '../../roles/shared/forms/UnsavedChangesRegistryProvider';

const ORG_ROLES = new Set(['ORGANIZATION', 'ORG_ADMIN', 'ORG_OWNER', 'ORG_STAFF', 'CHIEF_ADMIN', 'REGION_ADMIN']);

function hasOrganizationAccess(user: any) {
  const role = String(user?.role || '').toUpperCase();
  if (ORG_ROLES.has(role)) return true;
  return Array.isArray(user?.memberships) && user.memberships.some((membership: any) => {
    const membershipRole = String(membership?.role || '').toUpperCase();
    return ORG_ROLES.has(membershipRole);
  });
}

const tabTitles: Record<string, string> = {
  index: 'Organization',
  dashboard: 'Home',
  invite: 'Invite Staff',
  'shifts/index': 'Shifts',
  'post-shift': 'Post Shift',
  'pharmacies/index': 'Pharmacies',
  hub: 'Hub',
  pills: 'Pills',
  notifications: 'Notifications',
  calendar: 'Calendar',
  'talent-board': 'Talent Hub',
  profile: 'Profile',
  chat: 'Chat',
};

const sidebarItems = [
  { label: 'Dashboard', icon: 'home', route: '/organization/dashboard' },
  { label: 'Invite Staff', icon: 'account-plus', route: '/organization/invite' },
  { label: 'Pharmacies', icon: 'store', route: '/organization/pharmacies' },
  { label: 'Shifts', icon: 'calendar-month', route: '/organization/shifts' },
  { label: 'Post Shift', icon: 'plus-circle', route: '/organization/post-shift' },
  { label: 'Calendar', icon: 'calendar', route: '/organization/calendar' },
  { label: 'Messages', icon: 'message', route: '/organization/chat' },
  { label: 'Pharmacy Hub', icon: 'account-group', route: '/organization/hub' },
  { label: 'Talent Hub', icon: 'account-search', route: '/organization/talent-board' },
  { label: 'Profile', icon: 'account-circle', route: '/organization/profile' },
];

function OrganizationSidebar({
  visible,
  onDismiss,
  onNavigate,
}: {
  visible: boolean;
  onDismiss: () => void;
  onNavigate: (route: string) => void;
}) {
  const router = useRouter();
  const { logout } = useAuth();

  const handleLogout = async () => {
    onDismiss();
    await logout();
    router.replace('/login' as any);
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.sidebar}>
        <Text variant="titleMedium" style={styles.sidebarTitle}>Organization menu</Text>
        <Divider />
        {sidebarItems.map((item) => (
          <List.Item
            key={item.route}
            title={item.label}
            left={(props) => <List.Icon {...props} icon={item.icon} />}
            onPress={() => {
              onDismiss();
              onNavigate(item.route);
            }}
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

export default function OrganizationLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const unsavedRegistry = useUnsavedChangesRegistry();
  const { user, isLoading } = useAuth();
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

  const requestNavigation = useCallback(
    (action: () => void) => {
      if (!unsavedRegistry) {
        action();
        return;
      }
      void unsavedRegistry.requestNavigation(action);
    },
    [unsavedRegistry]
  );

  const pushWithGuard = useCallback(
    (route: string) => requestNavigation(() => router.push(route as any)),
    [requestNavigation, router]
  );

  const replaceWithGuard = useCallback(
    (route: string) => requestNavigation(() => router.replace(route as any)),
    [requestNavigation, router]
  );

  const goBackWithGuard = useCallback(
    (fallbackRoute?: string | null) => {
      requestNavigation(() => {
        const canGoBack = typeof router.canGoBack === 'function' ? router.canGoBack() : false;
        if (canGoBack) {
          router.back();
          return;
        }
        if (fallbackRoute) {
          router.push(fallbackRoute as any);
        }
      });
    },
    [requestNavigation, router]
  );

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
      setUnreadCount(list.filter((n: any) => !(n.read_at || n.readAt)).length);
    } catch {
      // badge only
    }
  }, []);

  useEffect(() => {
    void loadUnread();
  }, [loadUnread]);

  useFocusEffect(
    useCallback(() => {
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
    if (isLoading) return;
    if (!user) {
      router.replace('/login' as any);
      return;
    }
    if (!hasOrganizationAccess(user)) {
      const role = String(user.role || '').toUpperCase();
      switch (role) {
        case 'OWNER':
          router.replace('/owner/dashboard' as any);
          break;
        case 'PHARMACIST':
          router.replace('/pharmacist/dashboard' as any);
          break;
        case 'OTHER_STAFF':
          router.replace('/otherstaff/dashboard' as any);
          break;
        case 'EXPLORER':
          router.replace('/explorer/dashboard' as any);
          break;
        default:
          router.replace('/login' as any);
      }
    }
  }, [isLoading, router, user]);

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
      const calendarRoute = resolveCalendarNotificationRoute({
        actionUrl: data.action_url ?? data.actionUrl ?? null,
        payload: data,
        userRole: user?.role ?? null,
      });
      if (calendarRoute && calendarRoute.startsWith('/organization/')) {
        router.push(calendarRoute as any);
        return;
      }
      const route = resolveShiftNotificationRoute({
        actionUrl: data.action_url ?? data.actionUrl ?? null,
        payload: data,
        userRole: user?.role ?? null,
      });
      if (route) {
        router.push(route.startsWith('/organization/') ? (route as any) : (`/organization/shifts` as any));
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
      // navigate anyway
    } finally {
      pushWithGuard('/organization/notifications');
    }
  }, [pushWithGuard]);

  const { isDashboard, backTarget, isPharmacyDetail } = useMemo(() => {
    if (!pathname) return { isDashboard: true, backTarget: null, isPharmacyDetail: false };
    const segments = pathname.split('/').filter(Boolean);
    const isDash = segments[0] === 'organization' && ['dashboard', 'index'].includes(segments[1] ?? 'dashboard');
    const isPharmacy = segments[0] === 'organization' && segments[1] === 'pharmacies' && segments.length >= 3;
    let parent: string | null = null;
    if (segments.length > 2) {
      parent = `/${segments.slice(0, -1).join('/')}`;
    }
    return { isDashboard: isDash, backTarget: parent, isPharmacyDetail: isPharmacy };
  }, [pathname]);

  return (
    <>
      <OrganizationSidebar
        visible={sidebarVisible}
        onDismiss={() => setSidebarVisible(false)}
        onNavigate={pushWithGuard}
      />
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
          headerTitle: tabTitles[route.name] || 'Organization',
          headerRightContainerStyle: { paddingRight: 10 },
          headerLeft: () => <IconButton icon="menu" onPress={() => setSidebarVisible(true)} />,
          headerRight: () => {
            const canGoBack = typeof router.canGoBack === 'function' ? router.canGoBack() : false;
            const showBack = !isDashboard;
            return (
              <View style={styles.headerRight}>
                {showBack ? (
                  <IconButton
                    icon="arrow-left"
                    onPress={() => {
                      if (isPharmacyDetail) {
                        pushWithGuard('/organization/pharmacies');
                      } else if (canGoBack || backTarget) {
                        goBackWithGuard(backTarget);
                      } else {
                        pushWithGuard('/organization/dashboard');
                      }
                    }}
                  />
                ) : null}
                <TouchableOpacity onPress={openNotifications} style={{ marginHorizontal: 4 }}>
                  <View style={styles.bellWrapper}>
                    <IconButton icon="bell-outline" />
                    {unreadCount > 0 && <View style={styles.badgeDot} />}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => pushWithGuard('/organization/profile')}>
                  {photoUrl ? (
                    <Avatar.Image size={32} source={{ uri: photoUrl }} />
                  ) : (
                    <Avatar.Text
                      size={32}
                      label={(user?.username || user?.email || 'O').charAt(0).toUpperCase()}
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
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen
          name="dashboard"
          listeners={{
            tabPress: (event) => {
              event.preventDefault();
              replaceWithGuard('/organization/dashboard');
            },
          }}
          options={{
            title: 'Home',
            tabBarAccessibilityLabel: 'Home tab',
            tabBarIcon: ({ color, size }) => <IconButton icon="home" iconColor={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="shifts/index"
          listeners={{
            tabPress: (event) => {
              event.preventDefault();
              replaceWithGuard('/organization/shifts');
            },
          }}
          options={{
            title: 'Shifts',
            tabBarAccessibilityLabel: 'Shifts tab',
            tabBarIcon: ({ color, size }) => <IconButton icon="calendar" iconColor={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="post-shift"
          listeners={{
            tabPress: (event) => {
              event.preventDefault();
              replaceWithGuard('/organization/post-shift');
            },
          }}
          options={{
            title: 'Post',
            tabBarAccessibilityLabel: 'Post shift tab',
            tabBarIcon: () => (
              <IconButton
                icon="plus-circle"
                iconColor="#FFFFFF"
                size={32}
                style={styles.postTabIcon}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="hub"
          listeners={{
            tabPress: (event) => {
              event.preventDefault();
              replaceWithGuard('/organization/hub');
            },
          }}
          options={{
            title: 'Hub',
            tabBarAccessibilityLabel: 'Hub tab',
            tabBarIcon: ({ color, size }) => <IconButton icon="account-group" iconColor={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="chat"
          listeners={{
            tabPress: (event) => {
              event.preventDefault();
              replaceWithGuard('/organization/chat');
            },
          }}
          options={{
            title: 'Chat',
            tabBarAccessibilityLabel: 'Chat tab',
            tabBarIcon: ({ color, size }) => <IconButton icon="message" iconColor={color} size={size} />,
          }}
        />

        <Tabs.Screen name="invite" options={{ href: null }} />
        <Tabs.Screen name="pharmacies/index" options={{ href: null }} />
        <Tabs.Screen name="pharmacies/[id]" options={{ href: null }} />
        <Tabs.Screen name="pharmacies/[id]/edit" options={{ href: null }} />
        <Tabs.Screen name="pharmacies/[id]/staff" options={{ href: null }} />
        <Tabs.Screen name="pharmacies/[id]/locums" options={{ href: null }} />
        <Tabs.Screen name="pharmacies/add" options={{ href: null }} />
        <Tabs.Screen name="profile" options={{ href: null }} />
        <Tabs.Screen name="pills" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
        <Tabs.Screen name="calendar" options={{ href: null }} />
        <Tabs.Screen name="talent-board" options={{ href: null }} />
        <Tabs.Screen name="messages/[id]" options={{ href: null }} />
        <Tabs.Screen name="shifts/[id]" options={{ href: null }} />
        <Tabs.Screen name="invoice" options={{ href: null }} />
        <Tabs.Screen name="invoice/new" options={{ href: null }} />
        <Tabs.Screen name="invoice/[id]" options={{ href: null }} />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
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
  avatar: { backgroundColor: '#6366F1' },
  avatarLabel: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
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
  postTabIcon: {
    backgroundColor: '#6366F1',
    borderRadius: 24,
    marginTop: -20,
  },
});
