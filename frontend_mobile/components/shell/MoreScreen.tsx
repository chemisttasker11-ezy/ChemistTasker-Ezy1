import React, { Fragment, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CalendarDays,
  ChevronRight,
  Clock,
  Gift,
  HardHat,
  LogOut,
  type LucideIcon,
  ShieldCheck,
  ShoppingBag,
  Star,
  Wallet,
} from 'lucide-react-native';
import { ConfirmDialog, IconTile, ScalePressable, SectionCard, type Tone } from '@/components/ui';
import { usePlatformTools } from '@/components/ParityToolsCard';
import { useAuth } from '@/context/AuthContext';
import { colors, font, radius, space, type } from '@/constants/tokens';
import { type MoreItem, useShell } from './ShellContext';

const toolIcons: Record<string, LucideIcon> = {
  '/workforce/employment-engagements': HardHat,
  '/manager/roster': CalendarDays,
  '/attendance': Clock,
  '/finance': Wallet,
  '/marketplace': ShoppingBag,
  '/marketplace/ethical/access': ShieldCheck,
  '/rewards/pills': Gift,
  '/profile/ratings': Star,
};

const TILE = 36;

function Row({
  item,
  tone,
  onPress,
  danger = false,
}: {
  item: MoreItem;
  tone: Tone;
  onPress: () => void;
  danger?: boolean;
}) {
  const Icon = item.icon;
  return (
    <ScalePressable static pressBg onPress={onPress} accessibilityLabel={item.label} style={styles.row}>
      {danger ? (
        <View style={styles.dangerTile} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Icon size={18} color={colors.status.red.fg} strokeWidth={1.75} />
        </View>
      ) : (
        <IconTile icon={<Icon />} tone={tone} size={TILE} />
      )}
      <Text numberOfLines={1} style={[styles.label, danger ? styles.dangerLabel : null]}>
        {item.label}
      </Text>
      {danger ? null : <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />}
    </ScalePressable>
  );
}

function Rows({ items, tone, onItem }: { items: MoreItem[]; tone: Tone; onItem: (item: MoreItem) => void }) {
  return (
    <>
      {items.map((item, index) => (
        <Fragment key={`${item.label}-${item.route ?? index}`}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <Row item={item} tone={tone} onPress={() => onItem(item)} />
        </Fragment>
      ))}
    </>
  );
}

/** The More tab: every route the persona reaches outside the tab bar, by how often a phone user needs it. */
export function MoreScreen() {
  const shell = useShell();
  const tools = usePlatformTools();
  const router = useRouter();
  const { logout } = useAuth();
  // Sign out sits just above the tab bar, so a stray tap asks first.
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const open = (item: MoreItem) => (item.onPress ? item.onPress() : item.route ? shell.navigate(item.route) : undefined);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      router.replace('/login' as any);
    } finally {
      setSigningOut(false);
      setConfirmSignOut(false);
    }
  };

  const groups = shell.more
    .map((group) => ({
      ...group,
      items: group.tools
        ? tools.map((tool) => ({ label: tool.title, icon: toolIcons[tool.route] ?? Star, route: tool.route }))
        : (group.items ?? []).filter((item) => !item.hidden),
    }))
    .filter((group) => group.items.length > 0);
  const account = shell.account.filter((item) => !item.hidden);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      {groups.map((group) => (
        <SectionCard key={group.title} title={group.title} flush dense>
          <Rows items={group.items} tone={group.tone} onItem={open} />
        </SectionCard>
      ))}
      <SectionCard title="Account" flush dense>
        <Rows items={account} tone="violet" onItem={open} />
        {account.length ? <View style={styles.divider} /> : null}
        <Row item={{ label: 'Sign out', icon: LogOut }} tone="violet" danger onPress={() => setConfirmSignOut(true)} />
      </SectionCard>
      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out of ChemistTasker?"
        body="You will need to sign in again to see your shifts and messages."
        confirmLabel="Sign out"
        busyLabel="Signing out…"
        busy={signingOut}
        onConfirm={() => void signOut()}
        onClose={() => setConfirmSignOut(false)}
      />
    </ScrollView>
  );
}

/** Route file body for `app/<persona>/more.tsx`. */
export default MoreScreen;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space['3xl'] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  label: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontFamily: font.inter.medium,
    fontSize: type.bodyLarge.fontSize,
    lineHeight: 20,
  },
  dangerTile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.tileSm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.status.red.bg,
  },
  dangerLabel: { color: colors.status.red.fg },
  // Inset to the label edge so each row's tile stays one column.
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: space.lg + TILE + space.md,
    backgroundColor: colors.border,
  },
});
