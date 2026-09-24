import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Text, Surface, Icon, IconButton, Badge, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getNotifications, markNotificationsAsRead } from '@chemisttasker/shared-core';
import { useFocusEffect } from '@react-navigation/native';
import { usePathname, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { brandColors, getPersonaPalette } from '@/constants/theme';
import {
  resolveCalendarNotificationRoute,
  resolveChatNotificationRoomId,
  resolveHubNotificationRoute,
  resolveMembershipNotificationRoute,
  resolveShiftNotificationRoute,
} from '@/utils/notificationNavigation';
import { getMessageDetailRoute } from '@/utils/chatRoutes';

type Notification = {
  id: number;
  title: string;
  body: string;
  createdAt: string;
  readAt?: string | null;
  type: string;
  actionUrl?: string | null;
  payload?: Record<string, any>;
};

export default function NotificationsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const routePersonaRole = pathname?.startsWith('/admin')
    ? 'ADMIN'
    : pathname?.startsWith('/owner')
      ? 'OWNER'
      : pathname?.startsWith('/organization')
        ? 'ORGANIZATION'
        : pathname?.startsWith('/pharmacist')
          ? 'PHARMACIST'
          : pathname?.startsWith('/otherstaff')
            ? 'OTHER_STAFF'
            : pathname?.startsWith('/explorer')
              ? 'EXPLORER'
              : user?.role;
  const persona = getPersonaPalette(routePersonaRole);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  // Refresh when screen gains focus and mark any unread as read.
  useFocusEffect(
    useCallback(() => {
      fetchNotifications(true); // mark all as read when opening
    }, [])
  );

  const normalizeNotification = (raw: any): Notification => ({
    id: raw.id,
    title: raw.title,
    body: raw.body,
    createdAt: raw.created_at ?? raw.createdAt ?? '',
    readAt: raw.read_at ?? raw.readAt ?? null,
    type: raw.type || 'system',
    actionUrl: raw.action_url ?? raw.actionUrl ?? null,
    payload: raw.payload ?? {},
  });

  const fetchNotifications = async (markAllRead = false) => {
    try {
      const response = await getNotifications();
      const list = Array.isArray((response as any)?.results)
        ? (response as any).results
        : Array.isArray(response)
          ? (response as any)
          : [];
      const normalized = list.map(normalizeNotification);
      setNotifications(normalized);
      if (markAllRead) {
        const unreadIds = normalized.filter((n: Notification) => !n.readAt).map((n: Notification) => n.id);
        if (unreadIds.length) {
          setNotifications((prev) =>
            prev.map((n: Notification) => (unreadIds.includes(n.id) ? { ...n, readAt: new Date().toISOString() } : n))
          );
          void markNotificationsAsRead(unreadIds);
        }
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const markAsRead = async (id: number) => {
    try {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
      await markNotificationsAsRead([id]);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'shift_application':
        return 'briefcase-check';
      case 'message':
        return 'message-text';
      case 'system':
        return 'information';
      default:
        return 'bell';
    }
  };

  const handleNotificationPress = (item: Notification) => {
    if (!item.readAt) {
      void markAsRead(item.id);
    }
    const roomId = resolveChatNotificationRoomId({
      actionUrl: item.actionUrl,
      payload: item.payload,
    });
    if (roomId) {
      router.push(getMessageDetailRoute(routePersonaRole, roomId) as any);
      return;
    }
    const route = resolveShiftNotificationRoute({
      actionUrl: item.actionUrl,
      payload: item.payload,
      userRole: routePersonaRole ?? null,
    });
    if (route) {
      router.push(route as any);
      return;
    }
    const calendarRoute = resolveCalendarNotificationRoute({
      actionUrl: item.actionUrl,
      payload: item.payload,
      userRole: routePersonaRole ?? null,
    });
    if (calendarRoute) {
      router.push(calendarRoute as any);
      return;
    }
    const hubRoute = resolveHubNotificationRoute({
      actionUrl: item.actionUrl,
      payload: item.payload,
      userRole: routePersonaRole ?? null,
    });
    if (hubRoute) {
      router.push(hubRoute as any);
      return;
    }
    const membershipRoute = resolveMembershipNotificationRoute({
      actionUrl: item.actionUrl,
      payload: item.payload,
      userRole: routePersonaRole ?? null,
    });
    if (membershipRoute) {
      router.push(membershipRoute as any);
      return;
    }
  };

  const renderItem = ({ item }: { item: Notification }) => (
    <TouchableOpacity onPress={() => handleNotificationPress(item)} activeOpacity={0.85}>
      <Surface
        style={[styles.notificationItem, !item.readAt && styles.unreadItem]}
        elevation={1}
      >
      <View style={styles.iconContainer}>
        <Surface style={styles.iconSurface} elevation={0}>
          <Icon source={getIconForType(item.type)} size={24} color={persona.accent} />
        </Surface>
        {!item.readAt && <Badge size={8} style={styles.unreadDot} />}
      </View>

      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <Text variant="titleSmall" style={styles.title}>
            {item.title}
          </Text>
          <Text variant="bodySmall" style={styles.time}>
            {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''}
          </Text>
        </View>
        <Text variant="bodyMedium" style={styles.message} numberOfLines={2}>
          {item.body}
        </Text>
      </View>

      {!item.readAt && (
        <IconButton
          icon="check"
          size={20}
          onPress={() => markAsRead(item.id)}
          iconColor="#59677E"
          accessibilityLabel="Mark notification as read"
          accessibilityRole="button"
        />
      )}
      </Surface>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={persona.accent} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text variant="titleMedium" style={styles.emptyTitle}>
                No notifications
              </Text>
              <Text variant="bodyMedium" style={styles.emptyText}>
                You&apos;re all caught up!
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F8FC',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 12,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  unreadItem: {
    backgroundColor: '#F4F7FB',
  },
  iconContainer: {
    position: 'relative',
    marginRight: 12,
  },
  iconSurface: {
    backgroundColor: '#F0EAFF',
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#EF4444',
  },
  contentContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontWeight: '600',
    color: '#06214A',
    flex: 1,
    marginRight: 8,
  },
  time: {
    color: '#718096',
  },
  message: {
    color: '#59677E',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontWeight: '600',
    marginBottom: 8,
    color: '#06214A',
  },
  emptyText: {
    color: '#59677E',
  },
});
