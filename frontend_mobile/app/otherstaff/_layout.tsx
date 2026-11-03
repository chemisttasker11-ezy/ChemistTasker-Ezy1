import React, { useCallback, useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { useGuardedNavigation, useUnsavedChangesRegistry } from '../../roles/shared/forms/UnsavedChangesRegistryProvider';
import { ActivityIndicator, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  Briefcase,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  Clock,
  GraduationCap,
  Heart,
  LayoutDashboard,
  MessageSquare,
  ReceiptText,
  Search,
  Store,
  UserRound,
  Users,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { resolveCalendarNotificationRoute, resolveChatNotificationRoomId, resolveShiftNotificationRoute } from '@/utils/notificationNavigation';
import { getMessageDetailRoute } from '@/utils/chatRoutes';
import { colors } from '@/constants/tokens';
import { type MoreGroup, type MoreItem, PersonaShell, type ShellTab } from '@/components/shell';

const titles: Record<string, string> = {
  dashboard: 'Home',
  'shifts/index': 'Shifts',
  'shifts/[id]': 'Shift',
  chat: 'Chat',
  'messages/[id]': 'Chat',
  hub: 'Hub',
  invoice: 'Invoices',
  invoices: 'Invoices',
  'invoice/new': 'New invoice',
  'invoice/[id]': 'Invoice',
  calendar: 'Calendar',
  'talent-board': 'Talent Board',
  availability: 'Availability',
  'publish-availability': 'Publish availability',
  memberships: 'Memberships',
  learning: 'Learning',
  interests: 'Interests',
  notifications: 'Notifications',
  profile: 'Profile',
  'profile-basic-info': 'Profile',
  'profile-identity': 'Profile',
  'profile-regulatory': 'Profile',
  'profile-skills': 'Profile',
  'profile-payment': 'Profile',
  'profile-referees': 'Profile',
  'profile-bio': 'Profile',
  more: 'More',
};

const more: MoreGroup[] = [
  {
    title: 'Workspace',
    tone: 'violet',
    items: [
      { label: 'Publish availability', icon: CalendarPlus, route: '/otherstaff/publish-availability' },
      { label: 'Availability', icon: CalendarCheck, route: '/otherstaff/availability' },
      { label: 'Calendar', icon: CalendarDays, route: '/otherstaff/calendar' },
      { label: 'My hours', icon: Clock, route: '/my-hours' },
      { label: 'Memberships', icon: Store, route: '/otherstaff/memberships' },
    ],
  },
  {
    title: 'Discover',
    tone: 'magenta',
    items: [
      { label: 'Hub', icon: Users, route: '/otherstaff/hub' },
      { label: 'Talent Board', icon: Search, route: '/otherstaff/talent-board' },
      { label: 'Learning', icon: GraduationCap, route: '/otherstaff/learning' },
    ],
  },
  { title: 'Work & platform tools', tone: 'blue', tools: true },
];

const account: MoreItem[] = [
  { label: 'Profile', icon: UserRound, route: '/otherstaff/profile' },
  { label: 'Interests', icon: Heart, route: '/otherstaff/interests' },
];

const tabs: ShellTab[] = [
  { name: 'dashboard', label: 'Home', icon: LayoutDashboard, accessibilityLabel: 'Home tab' },
  { name: 'shifts/index', label: 'Shifts', icon: Briefcase, accessibilityLabel: 'Shifts tab' },
  { name: 'invoice', label: 'Invoices', icon: ReceiptText, match: ['invoices'], accessibilityLabel: 'Invoices tab' },
  { name: 'chat', label: 'Chat', icon: MessageSquare, match: ['messages/'], accessibilityLabel: 'Chat tab' },
];

export default function OtherStaffTabs() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const unsavedRegistry = useUnsavedChangesRegistry();
  const guardedNavigation = useGuardedNavigation();
  const pathname = usePathname();

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data: any = response?.notification?.request?.content?.data || {};
      const roomId = resolveChatNotificationRoomId({
        actionUrl: data.action_url ?? data.actionUrl ?? null,
        payload: data,
      });
      if (roomId) {
        guardedNavigation(() => router.push(getMessageDetailRoute(user?.role, roomId) as any));
        return;
      }
      const calendarRoute = resolveCalendarNotificationRoute({
        actionUrl: data.action_url ?? data.actionUrl ?? null,
        payload: data,
        userRole: user?.role ?? null,
      });
      if (calendarRoute) {
        guardedNavigation(() => router.push(calendarRoute as any));
        return;
      }
      const route = resolveShiftNotificationRoute({
        actionUrl: data.action_url ?? data.actionUrl ?? null,
        payload: data,
        userRole: user?.role ?? null,
      });
      if (route) {
        guardedNavigation(() => router.push(route as any));
      }
    });
    return () => sub.remove();
  }, [guardedNavigation, router, user?.role]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'OTHER_STAFF') {
      switch (user.role) {
        case 'OWNER':
          router.replace('/owner/dashboard' as any);
          break;
        case 'PHARMACIST':
          router.replace('/pharmacist' as any);
          break;
        case 'EXPLORER':
          router.replace('/explorer/dashboard' as any);
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
      segments[0] === 'otherstaff' &&
      ['profile-basic-info', 'profile-identity', 'profile-regulatory', 'profile-skills', 'profile-payment', 'profile-referees', 'profile-bio'].includes(segments[1] ?? '');
    if (segments[1] === 'messages') return '/otherstaff/chat';
    if (isProfileSubPage) return '/otherstaff/profile';
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
      else router.push('/otherstaff/dashboard' as any);
    };
    if (unsavedRegistry) void unsavedRegistry.requestNavigation(go);
    else go();
  }, [backTarget, router, unsavedRegistry]);

  if (isLoading || !user || user.role !== 'OTHER_STAFF') {
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
      fallbackTitle="Pharmacy team"
      more={more}
      account={account}
      navigate={navigate}
      onBack={onBack}
      profileRoute="/otherstaff/profile"
      notificationsRoute="/otherstaff/notifications"
      workspace={{ kind: 'role', personaRole: 'OTHER_STAFF', scopeRole: 'OTHER_STAFF' }}
    />
  );
}
