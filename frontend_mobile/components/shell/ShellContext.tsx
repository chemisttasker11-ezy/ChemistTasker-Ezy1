import { createContext, useContext } from 'react';
import type { LucideIcon } from 'lucide-react-native';
import type { Tone } from '@/components/ui';

export type ShellTab = {
  /** Route name inside the persona folder, e.g. `shifts/index`. */
  name: string;
  label: string;
  icon: LucideIcon;
  accessibilityLabel: string;
  /** The centre Post shift action: 56pt brand circle, Medium haptic. */
  hero?: boolean;
  /** Other route-name prefixes that light this tab, e.g. `messages/` for Chat. */
  match?: string[];
  /** Replaces the default tab navigation (the layout's guarded replace/push). */
  onPress?: () => void;
};

export type MoreItem = {
  label: string;
  icon: LucideIcon;
  /** Opened with the layout's own navigate (guarded push where the old menu used one). */
  route?: string;
  onPress?: () => void;
  hidden?: boolean;
};

export type MoreGroup = {
  title: string;
  tone: Tone;
  items?: MoreItem[];
  /** Fills the group with the user's capability-gated work and platform tools. */
  tools?: boolean;
};

export type ShellChrome = {
  tabs: ShellTab[];
  titles: Record<string, string>;
  fallbackTitle: string;
  more: MoreGroup[];
  account: MoreItem[];
  navigate: (route: string) => void;
  onBack: () => void;
  profileRoute: string;
  unreadCount: number;
  photoUrl: string | null;
  openNotifications: () => void;
};

export const ShellContext = createContext<ShellChrome | null>(null);

export function useShell() {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error('useShell must be used inside PersonaShell');
  return shell;
}

/** A tab's URL path inside the persona folder: `shifts/index` -> `shifts`, `index` -> ``. */
export const tabPath = (tab: ShellTab) => tab.name.replace(/(^|\/)index$/, '');

/** Root routes get the workspace header; everything else is an inner screen with Back. */
export const isRootRoute = (tabs: ShellTab[], routeName: string) =>
  routeName === 'index' || tabs.some((tab) => tab.name === routeName);

/** A tab lights for its own route and its nested routes (`shifts/index` covers `shifts/[id]`). */
export function isTabRoute(tab: ShellTab, routeName: string) {
  const base = tabPath(tab);
  return (
    routeName === tab.name ||
    routeName.startsWith(`${base}/`) ||
    (tab.match ?? []).some((prefix) => routeName.startsWith(prefix))
  );
}
