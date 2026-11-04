import React, { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useGuardedNavigation, useUnsavedChangesRegistry } from '../../roles/shared/forms/UnsavedChangesRegistryProvider';
import * as Notifications from 'expo-notifications';
import { Briefcase, CalendarCheck, CalendarDays, Compass, Gift, Heart, LifeBuoy, MessageSquare, ShoppingBag, Sparkles, Star, UserRound } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { resolveChatNotificationRoomId } from '@/utils/notificationNavigation';
import { getMessageDetailRoute } from '@/utils/chatRoutes';
import { shiftPersonaFromPath } from '@/roles/shared/shifts/shiftSurface';
import { colors } from '@/constants/tokens';
import { type MoreGroup, type MoreItem, PersonaShell, type ShellTab } from '@/components/shell';

const titles: Record<string, string> = {
  dashboard: 'Home',
  shifts: 'Shifts',
  'shifts/[id]': 'Shift',
  chat: 'Chat',
  'messages/[id]': 'Chat',
  profile: 'Profile',
  'talent-board': 'Talent Board',
  calendar: 'Calendar',
  availability: 'Availability',
  notifications: 'Notifications',
  'profile-basic-info': 'Profile',
  'profile-identity': 'Profile',
  'profile-interests': 'Profile',
  'profile-referees': 'Profile',
  'profile-bio': 'Profile',
  more: 'More',
};

// Explorer tools carry no capability guards on web or mobile (the old tools group listed exactly these three).
const more: MoreGroup[] = [
  {
    title: 'Plan',
    tone: 'violet',
    items: [
      { label: 'Availability', icon: CalendarCheck, route: '/explorer/availability' },
      { label: 'Calendar', icon: CalendarDays, route: '/explorer/calendar' },
    ],
  },
  {
    title: 'Grow',
    tone: 'blue',
    items: [{ label: 'Marketplace', icon: ShoppingBag, route: '/marketplace' }],
  },
];

const account: MoreItem[] = [
  { label: 'Profile', icon: UserRound, route: '/explorer/profile' },
  { label: 'Interests', icon: Heart, route: '/explorer/profile-interests' },
  { label: 'My ratings', icon: Star, route: '/profile/ratings' },
  { label: 'Pill rewards', icon: Gift, route: '/rewards/pills' },
  { label: 'Help & support', icon: LifeBuoy, route: '/contact' },
];

// "Talent" fits a fifth of a 360pt phone at one line; screen readers still hear "Talent Board".
const tabs: ShellTab[] = [
  { name: 'dashboard', label: 'Home', icon: Compass, accessibilityLabel: 'Home tab' },
  { name: 'shifts', label: 'Shifts', icon: Briefcase, accessibilityLabel: 'Shifts tab' },
  { name: 'talent-board', label: 'Talent', icon: Sparkles, accessibilityLabel: 'Talent Board tab' },
  { name: 'chat', label: 'Chat', icon: MessageSquare, match: ['messages/'], accessibilityLabel: 'Chat tab' },
];

export default function ExplorerTabs() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const unsavedRegistry = useUnsavedChangesRegistry();
  const guardedNavigation = useGuardedNavigation();
  const pathname = usePathname();
  // Push taps open in the active shell (a delegated admin in /admin stays there), not the base role's.
  const persona = shiftPersonaFromPath(pathname) ?? 'explorer';

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data: any = response?.notification?.request?.content?.data || {};
      const roomId = resolveChatNotificationRoomId({
        actionUrl: data.action_url ?? data.actionUrl ?? null,
        payload: data,
      });
      if (roomId) {
        guardedNavigation(() => router.push(getMessageDetailRoute(user?.role, roomId, persona) as any));
        return;
      }
    });
    return () => sub.remove();
  }, [guardedNavigation, persona, router, user?.role]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'EXPLORER') {
      switch (user.role) {
        case 'OWNER':
          router.replace('/owner/dashboard' as any);
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

  const backTarget = useMemo(() => {
    if (!pathname) return null;
    const segments = pathname.split('/').filter(Boolean);
    const isProfileSubPage =
      segments[0] === 'explorer' &&
      ['profile-basic-info', 'profile-identity', 'profile-interests', 'profile-referees', 'profile-bio'].includes(segments[1] ?? '');
    if (segments[1] === 'messages') return '/explorer/chat';
    if (isProfileSubPage) return '/explorer/profile';
    if (segments.length > 2) return `/${segments.slice(0, -1).join('/')}`;
    return null;
  }, [pathname]);

  const navigate = useCallback(
    (route: string) => {
      const go = () => router.push(route as any);
      if (unsavedRegistry) void unsavedRegistry.requestNavigation(go);
      else go();
    },
    [router, unsavedRegistry]
  );

  const onBack = useCallback(() => {
    const go = () => {
      if (backTarget) router.push(backTarget as any);
      else if (router.canGoBack()) router.back();
      else router.push('/explorer/dashboard' as any);
    };
    if (unsavedRegistry) void unsavedRegistry.requestNavigation(go);
    else go();
  }, [backTarget, router, unsavedRegistry]);

  if (isLoading || !user || user.role !== 'EXPLORER') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <PersonaShell
      tabs={tabs}
      titles={titles}
      fallbackTitle="New to pharmacy"
      more={more}
      account={account}
      navigate={navigate}
      onBack={onBack}
      profileRoute="/explorer/profile"
      notificationsRoute="/explorer/notifications"
      workspace={{ kind: 'role', personaRole: 'EXPLORER' }}
    />
  );
}
