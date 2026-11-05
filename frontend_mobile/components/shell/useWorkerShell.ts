import { useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';
import {
  Briefcase,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  CalendarPlus,
  CalendarRange,
  Clock,
  Gift,
  GraduationCap,
  HardHat,
  Heart,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  ReceiptText,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Timer,
  UserRound,
  Users,
} from 'lucide-react-native';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { tab3Landing, workerTab3 } from '@/roles/shared/dashboard/workerHomeLogic';
import type { MoreGroup, MoreItem, ShellTab } from './ShellContext';

/**
 * Pharmacist and other staff shell config. Tab 3 follows the workspace switch (internal: My roster, platform:
 * Invoices) and keeps its position; switching workspace while on that tab lands on the new tab's screen.
 * More keeps My roster in both workspaces, then lists the other tools by how often a worker needs them.
 */
export function useWorkerShell(persona: 'pharmacist' | 'otherstaff') {
  const { hasCapability } = useAuth();
  const { workspace, isLoading, selectedPharmacyId } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const tab3 = workerTab3(workspace);
  // The last workspace seen after loading; the stored preference resolving on start is not a switch.
  const settled = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    const from = settled.current;
    settled.current = workspace;
    if (from == null) return;
    const target = tab3Landing(persona, pathname, from, workspace);
    if (target) router.replace(target as any);
  }, [isLoading, pathname, persona, router, workspace]);

  const tabs = useMemo<ShellTab[]>(
    () => [
      { name: 'dashboard', label: 'Home', icon: LayoutDashboard, accessibilityLabel: 'Home tab' },
      { name: 'shifts/index', label: 'Shifts', icon: Briefcase, accessibilityLabel: 'Shifts tab' },
      tab3 === 'invoice'
        ? { name: 'invoice', label: 'Invoices', icon: ReceiptText, match: ['invoices'], accessibilityLabel: 'Invoices tab' }
        : { name: 'roster', label: 'Roster', icon: CalendarCheck, accessibilityLabel: 'My roster tab' },
      { name: 'chat', label: 'Chat', icon: MessageSquare, match: ['messages/'], accessibilityLabel: 'Chat tab' },
    ],
    [tab3]
  );

  // The delegated manager tools a worker had through the old tools group (web capability guards, current pharmacy).
  const canRoster = hasCapability('MANAGE_ROSTER', selectedPharmacyId);
  const canStaff = canRoster || hasCapability('MANAGE_STAFF', selectedPharmacyId);

  const more = useMemo<MoreGroup[]>(() => {
    const p = `/${persona}`;
    return [
      {
        title: 'This week',
        tone: 'violet',
        items: [
          { label: 'My roster', icon: CalendarCheck, route: tab3 === 'invoice' ? '/my-roster' : `${p}/roster` },
          ...(tab3 === 'roster' ? [{ label: 'Invoices', icon: ReceiptText, route: `${p}/invoice` }] : []),
          { label: 'My attendance', icon: Timer, route: '/attendance' },
          { label: 'Attendance PIN', icon: KeyRound, route: '/attendance-pin' },
          { label: 'My hours', icon: Clock, route: '/my-hours' },
          { label: 'My leave', icon: CalendarOff, route: '/my-leave' },
          { label: 'Calendar', icon: CalendarDays, route: `${p}/calendar` },
        ],
      },
      {
        title: 'Find work',
        tone: 'cyan',
        items: [
          { label: 'Publish availability', icon: CalendarPlus, route: `${p}/publish-availability` },
          { label: 'Availability', icon: CalendarCheck, route: `${p}/availability` },
          { label: 'Memberships', icon: Store, route: `${p}/memberships` },
          { label: 'Talent Board', icon: Search, route: `${p}/talent-board` },
        ],
      },
      {
        title: 'Manage',
        tone: 'blue',
        items: [
          { label: 'Team roster', icon: CalendarRange, route: '/manager/roster', hidden: !canRoster },
          { label: 'Employment terms', icon: HardHat, route: '/workforce/employment-engagements', hidden: !canStaff },
        ],
      },
      {
        title: 'Money',
        tone: 'magenta',
        items: [
          { label: 'Finance', icon: Landmark, route: '/finance' },
          { label: 'Pill rewards', icon: Gift, route: '/rewards/pills' },
        ],
      },
      {
        title: 'Community',
        tone: 'blue',
        items: [
          { label: 'Pharmacy Hub', icon: Users, route: `${p}/hub` },
          { label: 'Learning', icon: GraduationCap, route: `${p}/learning` },
          { label: 'Marketplace', icon: ShoppingBag, route: '/marketplace' },
          { label: 'Ethical Marketplace', icon: ShieldCheck, route: '/marketplace/ethical/access' },
        ],
      },
    ];
  }, [canRoster, canStaff, persona, tab3]);

  const account = useMemo<MoreItem[]>(
    () => [
      { label: 'Profile', icon: UserRound, route: `/${persona}/profile` },
      { label: 'Interests', icon: Heart, route: `/${persona}/interests` },
      { label: 'My ratings', icon: Star, route: '/profile/ratings' },
      { label: 'Help & support', icon: LifeBuoy, route: '/contact' },
    ],
    [persona]
  );

  return { tabs, more, account };
}
