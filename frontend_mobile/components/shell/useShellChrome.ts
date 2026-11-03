import { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { usePathname } from 'expo-router';
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

  // Only the newest request may set the badge: an older response would restore a count from before a mark-read.
  const generation = useRef(0);
  const loadUnread = useCallback(async () => {
    const id = ++generation.current;
    try {
      const res: any = await getNotifications();
      if (id !== generation.current) return;
      if (typeof res?.unread_count === 'number') {
        setUnreadCount(res.unread_count);
        return;
      }
      if (typeof res?.unreadCount === 'number') {
        setUnreadCount(res.unreadCount);
        return;
      }
      setUnreadCount(listOf(res).filter((n: any) => !(n.read_at || n.readAt)).length);
    } catch {
      // best-effort badge; ignore errors
    }
  }, []);

  useEffect(() => {
    void loadUnread();
  }, [loadUnread]);

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
  // badge clears only when that screen is really showing (a refused, guarded navigation leaves both untouched).
  // Tab moves inside a persona never refocus the shell, so leaving the list refreshes the badge here.
  const pathname = usePathname();
  const prevPathname = useRef(pathname);
  useEffect(() => {
    const left = prevPathname.current === notificationsRoute && pathname !== notificationsRoute;
    prevPathname.current = pathname;
    if (pathname === notificationsRoute) {
      generation.current++;
      setUnreadCount(0);
    } else if (left) {
      void loadUnread();
    }
  }, [pathname, notificationsRoute, loadUnread]);

  const openNotifications = useCallback(() => navigate(notificationsRoute), [navigate, notificationsRoute]);

  return { unreadCount, photoUrl, openNotifications };
}
