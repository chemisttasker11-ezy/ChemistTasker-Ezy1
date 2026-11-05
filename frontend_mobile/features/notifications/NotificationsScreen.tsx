import React, { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, FlatList, Pressable, RefreshControl, DeviceEventEmitter } from 'react-native';
import { Text, Surface, Icon, IconButton, Badge, ActivityIndicator, Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getNotifications, markNotificationsAsRead } from '@chemisttasker/shared-core';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useAdminCan } from '@/context/AdminWorkspaceContext';
import {
  resolveCalendarNotificationRoute,
  resolveChatNotificationRoomId,
  resolveHubNotificationRoute,
  resolveMembershipNotificationRoute,
  resolveShiftNotificationRoute,
} from '@/utils/notificationNavigation';
import { getMessageDetailRoute } from '@/utils/chatRoutes';
import { shiftPersonaFromPath } from '@/roles/shared/shifts/shiftSurface';
import { NOTIFICATIONS_READ_EVENT } from './events';
import { colors, font, radius, space, touch } from '@/constants/tokens';

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
  const { user } = useAuth();
  // /admin/notifications opens admin routes even though a delegated admin's role is PHARMACIST, OWNER etc.
  const persona = shiftPersonaFromPath(usePathname());
  const adminCan = useAdminCan();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [readError, setReadError] = useState('');
  const [olderError, setOlderError] = useState('');
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const moreLoadingRef = useRef(false);
  const locallyReadIds = useRef(new Set<number>());

  // Only the newest list response may set rows: an older one would restore rows from before a mark-read.
  const generation = useRef(0);

  // Load on every focus (the first one included) and mark any unread as read.
  useFocusEffect(
    useCallback(() => {
      void fetchNotifications(true, 1); // first visible page is considered read when the server confirms it
      return () => {
        generation.current += 1;
        moreLoadingRef.current = false;
      };
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

  const fetchNotifications = async (markVisibleRead = false, page = 1) => {
    const first = page === 1;
    if (!first && moreLoadingRef.current) return;
    const request = first ? ++generation.current : generation.current;
    if (first) {
      setLoading(true);
      setLoadError('');
      setOlderError('');
      setNextPage(null);
      moreLoadingRef.current = false;
    } else {
      moreLoadingRef.current = true;
      setLoadingMore(true);
      setOlderError('');
    }
    try {
      const response = await getNotifications(page);
      if (request !== generation.current) return;
      if (!Array.isArray(response) && !Array.isArray((response as any)?.results)) {
        throw new Error('Unexpected notifications response.');
      }
      const rows = Array.isArray(response) ? response : response.results;
      const normalized = rows.map(normalizeNotification).map((n: Notification) =>
        locallyReadIds.current.has(n.id) ? { ...n, readAt: n.readAt || new Date().toISOString() } : n
      );
      setNotifications(previous => first ? normalized : [
        ...previous,
        ...normalized.filter((n: Notification) => !previous.some(row => row.id === n.id)),
      ]);
      setNextPage(!Array.isArray(response) && response.next ? page + 1 : null);
      if (markVisibleRead) {
        const unreadIds = normalized.filter((n: Notification) => !n.readAt).map((n: Notification) => n.id);
        if (unreadIds.length) {
          // Do not tell the shell or the user that a read was recorded until
          // the server actually confirms the mutation.
          try {
            await markNotificationsAsRead(unreadIds);
            if (request !== generation.current) return;
            unreadIds.forEach(id => locallyReadIds.current.add(id));
            setNotifications(previous => previous.map(row =>
              locallyReadIds.current.has(row.id) ? { ...row, readAt: row.readAt || new Date().toISOString() } : row
            ));
            setReadError('');
            DeviceEventEmitter.emit(NOTIFICATIONS_READ_EVENT);
          } catch (failure: any) {
            if (request === generation.current) setReadError(failure?.message || 'Notifications could not be marked as read.');
          }
        }
      }
    } catch (failure: any) {
      if (request !== generation.current) return;
      if (first) setLoadError(failure?.message || 'Unable to load notifications.');
      else setOlderError(failure?.message || 'Unable to load older notifications.');
    } finally {
      if (request === generation.current) {
        if (first) setLoading(false);
        else { setLoadingMore(false); moreLoadingRef.current = false; }
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications(true, 1);
    setRefreshing(false);
  };

  const markAsRead = async (id: number) => {
    try {
      await markNotificationsAsRead([id]);
      locallyReadIds.current.add(id);
      setNotifications(previous =>
        previous.map(row => row.id === id ? { ...row, readAt: row.readAt || new Date().toISOString() } : row)
      );
      setReadError('');
      DeviceEventEmitter.emit(NOTIFICATIONS_READ_EVENT);
    } catch (failure: any) {
      setReadError(failure?.message || 'Unable to mark the notification as read.');
    }
  };

  const loadOlder = () => {
    if (nextPage == null || moreLoadingRef.current || loading || refreshing) return;
    void fetchNotifications(true, nextPage);
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
      router.push(getMessageDetailRoute(user?.role, roomId, persona) as any);
      return;
    }
    const route = resolveShiftNotificationRoute({
      actionUrl: item.actionUrl,
      payload: item.payload,
      userRole: user?.role ?? null,
      persona,
      adminCan,
    });
    if (route) {
      router.push(route as any);
      return;
    }
    const calendarRoute = resolveCalendarNotificationRoute({
      actionUrl: item.actionUrl,
      payload: item.payload,
      userRole: user?.role ?? null,
      persona,
      adminCan,
    });
    if (calendarRoute) {
      router.push(calendarRoute as any);
      return;
    }
    const hubRoute = resolveHubNotificationRoute({
      actionUrl: item.actionUrl,
      payload: item.payload,
      userRole: user?.role ?? null,
      persona,
      adminCan,
    });
    if (hubRoute) {
      router.push(hubRoute as any);
      return;
    }
    const membershipRoute = resolveMembershipNotificationRoute({
      actionUrl: item.actionUrl,
      payload: item.payload,
      userRole: user?.role ?? null,
      persona,
      adminCan,
    });
    if (membershipRoute) {
      router.push(membershipRoute as any);
      return;
    }
  };

  const renderItem = ({ item }: { item: Notification }) => (
    <Surface
      style={[styles.notificationItem, !item.readAt && styles.unreadItem]}
      elevation={1}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.body}`}
        style={styles.notificationAction}
        onPress={() => handleNotificationPress(item)}
      >
        <View style={styles.iconContainer} importantForAccessibility="no-hide-descendants">
          <Surface style={styles.iconSurface} elevation={0}>
            <Icon source={getIconForType(item.type)} size={24} color={colors.primary} />
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
      </Pressable>

      {!item.readAt && (
        <IconButton
          icon="check"
          size={20}
          onPress={() => markAsRead(item.id)}
          iconColor={colors.textSecondary}
          accessibilityLabel="Mark notification as read"
          accessibilityRole="button"
        />
      )}
    </Surface>
  );

  return (
    <SafeAreaView style={styles.container}>
      {loading && notifications.length === 0 && !loadError ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          onEndReachedThreshold={0.5}
          onEndReached={loadOlder}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={loadError || readError ? <Surface elevation={0} style={styles.errorCard}>
            {loadError ? <>
              <Text accessibilityRole="alert" style={styles.errorTitle}>Could not load notifications</Text>
              <Text style={styles.errorBody}>{loadError}</Text>
              <Button mode="outlined" contentStyle={styles.retryTouch} onPress={() => void fetchNotifications(true, 1)}>Try again</Button>
            </> : null}
            {readError ? <>
              <Text accessibilityRole="alert" style={styles.errorTitle}>Read status could not be saved</Text>
              <Text style={styles.errorBody}>{readError}</Text>
              <Button mode="outlined" contentStyle={styles.retryTouch} onPress={() => void fetchNotifications(true, 1)}>Retry read status</Button>
            </> : null}
          </Surface> : null}
          ListFooterComponent={nextPage != null || olderError || loadingMore ? <View style={styles.footer}>
            {olderError ? <Text accessibilityRole="alert" style={styles.errorBody}>{olderError}</Text> : null}
            <Button mode="outlined" contentStyle={styles.retryTouch} loading={loadingMore}
              disabled={loadingMore || nextPage == null} onPress={loadOlder}>
              {olderError ? 'Retry older notifications' : 'Load older notifications'}
            </Button>
          </View> : null}
          ListEmptyComponent={loadError ? null : (
            <View style={styles.emptyState}>
              <Text variant="titleMedium" style={styles.emptyTitle}>
                No notifications
              </Text>
              <Text variant="bodyMedium" style={styles.emptyText}>
                You&apos;re all caught up!
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.pageBg },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: space.lg,
  },
  notificationItem: {
    flexDirection: 'row',
    marginBottom: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceBg,
    alignItems: 'center',
    overflow: 'hidden',
  },
  notificationAction: {
    flex: 1,
    minHeight: touch.min + 20,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadItem: {
    backgroundColor: colors.tone.violet.bg,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  iconContainer: {
    position: 'relative',
    marginRight: 12,
  },
  iconSurface: {
    backgroundColor: colors.tone.violet.bg,
    borderRadius: radius.card,
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: colors.status.red.solid,
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
    fontFamily: font.inter.semiBold,
    color: colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  time: { color: colors.textSecondary },
  message: { color: colors.textSecondary },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontFamily: font.outfit.medium,
    marginBottom: space.sm,
    color: colors.textPrimary,
  },
  emptyText: { color: colors.textSecondary },
  footer: { paddingVertical: space.lg, alignItems: 'center', gap: space.sm },
  errorCard: { borderRadius: radius.card, padding: space.lg, backgroundColor: colors.status.red.bg, borderColor: colors.status.red.fg, borderWidth: 1, marginBottom: space.md, gap: space.sm },
  errorTitle: { color: colors.status.red.fg, fontFamily: font.inter.semiBold },
  errorBody: { color: colors.textPrimary },
  retryTouch: { minHeight: touch.min },
});
