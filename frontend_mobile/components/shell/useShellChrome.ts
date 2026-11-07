import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, usePathname } from 'expo-router';
import { getNotifications } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { NOTIFICATIONS_READ_EVENT } from '@/features/notifications/events';

const listOf =(res: any) => (Array.isArray(res?.results) ? res.results : Array.isArray(res) ? res : []);

/** Header bell count, avatar photo and the bell handler, shared by every persona layout. */
export function useShellChrome(notificationsRoute: string, navigate: (route: string) => void) {
  const { user, isLoading } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    // Do not update the photo based on an intermediate or loading user object.
    // This prevents the avatar from flickering during navigation.
    if (isLoading) return;
    if (!user) {
      setPhotoUrl(null);
      return;
    }
    setPhotoUrl((user as any)?.profile_photo || (user as any)?.profile_photo_url || (user as any)?.profilePhoto || null);
  }, [user, isLoading]);

  // The badge is private to the signed-in account. Generation protects
  // overlapping refreshes; account identity protects the authentication switch.
  const accountKey = String(user?.id ?? 'signed-out');
  const scopeRef = useRef(accountKey);
  const [badgeAccount, setBadgeAccount] = useState(accountKey);
  const generation = useRef(0);
  const loadUnread = useCallback(async () => {
    if (user?.id == null || scopeRef.current !== accountKey) return;
    const id = ++generation.current;
    try {
      const res: any = await getNotifications();
      if (id !== generation.current || scopeRef.current !== accountKey) return;
      const count = typeof res?.unread_count === 'number'
        ? res.unread_count
        : typeof res?.unreadCount === 'number'
          ? res.unreadCount
          : listOf(res).filter((n: any) => !(n.read_at || n.readAt)).length;
      setUnreadCount(count);
      setBadgeAccount(accountKey);
    } catch {
      // best-effort badge; a failed reload never imports another account's count.
    }
  }, [accountKey, user?.id]);

  useEffect(() => {
    // Any outstanding request from the previous account must be invalidated
    // even when its HTTP response arrives after the new account has rendered.
    scopeRef.current = accountKey;
    generation.current += 1;
    setUnreadCount(0);
    setBadgeAccount(accountKey);
    if (user?.id != null) void loadUnread();
    return () => { generation.current += 1; };
  }, [accountKey, loadUnread, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadUnread();
    }, [loadUnread]),
  );

  // Update the badge as soon as a push arrives in foreground/background.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => {
      void loadUnread();
    });
    const readSub = DeviceEventEmitter.addListener(NOTIFICATIONS_READ_EVENT, () => void loadUnread());
    return () => {
      sub.remove();
      readSub.remove();
    };
  }, [loadUnread]);

  // Like web, notifications are read once their list is shown: NotificationsScreen marks them read on focus, and the
  // badge refreshes only after a successful receipt (or a genuine server reload).
  // Tab moves inside a persona never refocus the shell, so leaving the list refreshes the badge here.
  const pathname = usePathname();
  const prevPathname = useRef(pathname);
  useEffect(() => {
    const left = prevPathname.current === notificationsRoute && pathname !== notificationsRoute;
    prevPathname.current = pathname;
    // Entering the inbox is not a read receipt. A failed mark must retain
    // the unread badge; only NOTIFICATIONS_READ_EVENT can confirm that change.
    if (left) {
      void loadUnread();
    }
  }, [pathname, notificationsRoute, loadUnread]);

  const openNotifications = useCallback(() => navigate(notificationsRoute), [navigate, notificationsRoute]);

  return { unreadCount: badgeAccount === accountKey ? unreadCount : 0, photoUrl, openNotifications };
}
