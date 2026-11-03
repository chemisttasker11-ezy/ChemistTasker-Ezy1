import React, { Fragment, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { attendance, getOrganizationMembership, workforce } from '@chemisttasker/shared-core';
import {
  BrandBanner,
  CountBadge,
  IconTile,
  InitialsAvatar,
  Pill,
  ScalePressable,
  Skeleton,
  type StatusTone,
  type Tone,
  ViewAllLink,
} from '@/components/ui';
import { colors, font, radius, space, type } from '@/constants/tokens';
import { needsManager, plural } from './managerHomeLogic';

const asList = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? value : Array.isArray((value as any)?.results) ? (value as any).results : [];

/** "Omar Khan, Ali Hassan and 2 more": names first, never a bare count when we know who. */
export function namesLine(names: string[], max = 2): string {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length <= max) return unique.join(' and ');
  return `${unique.slice(0, max).join(', ')} and ${unique.length - max} more`;
}

/** Web's organization nav guards (navigation.tsx getOrganizationNav), read from the org membership capabilities. */
export function orgCapabilities(user: any) {
  const caps = new Set((getOrganizationMembership(user)?.capabilities ?? []).map((cap) => String(cap).toLowerCase()));
  const staff = caps.has('manage_staff');
  const roster = caps.has('manage_roster');
  const pharmacies = staff || caps.has('view_all_pharmacies') || caps.has('assign_pharmacies');
  return {
    staff,
    roster,
    comms: caps.has('manage_communications'),
    invite: caps.has('invite_staff'),
    pharmacies,
    rosterScreen: pharmacies && roster,
    attendance: pharmacies && (staff || roster),
  };
}

export type NextStep = {
  key: string;
  title: string;
  body: string;
  action: string;
  icon?: ReactNode;
  onPress: () => void;
  /** A second, quieter action on the card (e.g. Directions beside Clock in). */
  secondary?: { label: string; icon?: ReactNode; onPress: () => void };
};

/** Home scroll with pull-to-refresh; the page gutter and the gap between blocks. */
export function HomeScroll({
  refreshing,
  onRefresh,
  children,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  children: ReactNode;
}) {
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
    >
      {children}
    </ScrollView>
  );
}

/** The one next action at the top of Home, on the brand gradient. A skeleton of the same size while loading. */
export function NextStepCard({ step, loading }: { step: NextStep | null; loading: boolean }) {
  if (loading && !step) return <Skeleton width="100%" height={176} borderRadius={radius.banner} />;
  if (!step) return null;
  return (
    <BrandBanner
      title={step.title}
      subtitle={step.body}
      primary={{ label: step.action, icon: step.icon, onPress: step.onPress }}
      secondary={step.secondary}
    />
  );
}

function Chevron() {
  return <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />;
}

/** A person first: face, name, what they are doing. */
export function PersonRow({
  name,
  detail,
  meta,
  tone = 'violet',
  photoUrl,
  onPress,
}: {
  name: string;
  detail: string;
  meta?: string;
  tone?: StatusTone;
  photoUrl?: string | null;
  onPress?: () => void;
}) {
  const body = (
    <>
      <InitialsAvatar name={name} tone={tone} size={40} photoUrl={photoUrl} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.name}>{name}</Text>
        <Text numberOfLines={1} style={styles.detail}>{detail}</Text>
      </View>
      {meta ? <Text numberOfLines={1} style={styles.meta}>{meta}</Text> : null}
      {onPress ? <Chevron /> : null}
    </>
  );
  const spoken = [name, detail, meta].filter(Boolean).join(', ');
  // One spoken item per person, pressable or not.
  if (!onPress) return <View accessible accessibilityLabel={spoken} style={styles.row}>{body}</View>;
  return (
    <ScalePressable static pressBg onPress={onPress} accessibilityLabel={spoken} style={styles.row}>
      {body}
    </ScalePressable>
  );
}

/** A tinted icon row for a place or a queue: label, one detail line, a count or a status pill. */
export function ItemRow({
  icon,
  tone,
  label,
  detail,
  count,
  countLabel,
  pill,
  onPress,
}: {
  icon: ReactNode;
  tone: Tone;
  label: string;
  detail?: string;
  count?: number;
  countLabel?: string;
  pill?: { label: string; tone: StatusTone };
  onPress: () => void;
}) {
  const spoken = [label, detail, countLabel, pill?.label].filter(Boolean).join(', ');
  return (
    <ScalePressable static pressBg onPress={onPress} accessibilityLabel={spoken} style={styles.row}>
      <IconTile icon={icon} tone={tone} size={40} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.name}>{label}</Text>
        {detail ? <Text numberOfLines={1} style={styles.detail}>{detail}</Text> : null}
      </View>
      {count != null ? <CountBadge value={count} tone="magenta" label={countLabel} /> : null}
      {pill ? <Pill label={pill.label} tone={pill.tone} /> : null}
      <Chevron />
    </ScalePressable>
  );
}

/** Rows with inset hairlines between them, edge to edge inside a flush SectionCard. */
export function Rows({ children }: { children: ReactNode }) {
  const items = React.Children.toArray(children);
  return (
    <View style={styles.rows}>
      {items.map((child, index) => (
        <Fragment key={index}>
          {index > 0 ? <View style={styles.divider} /> : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

/** Skeleton rows shaped like PersonRow while a block loads. */
export function BlockLoading({ rows = 2, dense = false }: { rows?: number; dense?: boolean }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading" style={styles.rows}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={[styles.row, dense ? styles.denseRow : null]}>
          <Skeleton width={40} height={40} borderRadius={radius.pill} />
          <View style={styles.copy}>
            <Skeleton width={index ? '55%' : '40%'} height={15} />
            <Skeleton width="70%" height={12} style={styles.skeletonLine} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Empty or failed block: one plain line and, when there is one, the next step. */
export function BlockNote({ text, action, onAction, dense = false }: { text: string; action?: string; onAction?: () => void; dense?: boolean }) {
  return (
    <View style={[styles.note, dense ? styles.denseNote : null]}>
      <Text style={styles.noteText}>{text}</Text>
      {action && onAction ? <ViewAllLink onPress={onAction}>{action}</ViewAllLink> : null}
    </View>
  );
}

/** The end of a "Needs you" list: a retry when any queue failed (never a false all-clear), else the all-clear. */
export function QueueNote({ failed, empty, onRetry }: { failed: boolean; empty: boolean; onRetry: () => void }) {
  if (failed) return <BlockNote text="Some of these could not load, so this list may be incomplete." action="Try again" onAction={onRetry} />;
  return empty ? <BlockNote text="Nothing needs you right now." /> : null;
}

export type InboxQueue = { count: number; names: string[]; failed?: boolean };
/** `failed`: a requested queue did not load for at least one pharmacy. */
export type ManagerInbox = { attendance: InboxQueue | null; timesheets: InboxQueue | null; failed: boolean };
export const FAILED_INBOX: ManagerInbox = { attendance: null, timesheets: null, failed: true };

/** Most pharmacies one Home asks about, so a large chain does not fire dozens of requests on open. */
export const INBOX_PHARMACY_LIMIT = 6;

const sum = (queues: Array<InboxQueue | null>): InboxQueue | null => {
  const known = queues.filter((queue): queue is InboxQueue => queue != null);
  if (!known.length) return null;
  return { count: known.reduce((total, queue) => total + queue.count, 0), names: known.flatMap((queue) => queue.names) };
};

async function attendanceFor(pharmacyId: number): Promise<InboxQueue | null> {
  const [pending, kiosk] = await Promise.allSettled([
    attendance.getManagerPending(pharmacyId),
    attendance.getManagerPendingKioskReviews(pharmacyId),
  ]);
  const rows = [
    ...(pending.status === 'fulfilled' ? asList<{ worker_name?: string }>(pending.value) : []),
    ...(kiosk.status === 'fulfilled' ? asList<{ worker_name?: string }>(kiosk.value) : []),
  ];
  if (pending.status === 'rejected' && kiosk.status === 'rejected') return null;
  return {
    count: rows.length,
    names: rows.map((row) => row.worker_name ?? ''),
    failed: pending.status === 'rejected' || kiosk.status === 'rejected',
  };
}

async function timesheetsFor(pharmacyId: number): Promise<InboxQueue | null> {
  try {
    const periods = asList<{ id: number; status: string; start_date: string }>(await workforce.listTimesheetPeriods(pharmacyId))
      .filter((period) => period.status === 'OPEN' || period.status === 'REVIEW')
      .sort((a, b) => b.start_date.localeCompare(a.start_date))
      .slice(0, 2);
    const rows = (await Promise.all(periods.map((period) => workforce.listTimesheets(period.id))))
      .flatMap((list) => asList<{ status: string; worker?: { name?: string } }>(list))
      .filter((row) => needsManager(row.status));
    return { count: rows.length, names: rows.map((row) => row.worker?.name ?? '') };
  } catch {
    return null;
  }
}

/** Attendance and timesheet queues across the given pharmacies; a queue the user cannot see stays null. */
export async function loadManagerInbox(
  pharmacyIds: number[],
  { attendance: withAttendance, timesheets: withTimesheets }: { attendance: boolean; timesheets: boolean },
): Promise<ManagerInbox> {
  const ids = pharmacyIds.slice(0, INBOX_PHARMACY_LIMIT);
  const [attendanceRows, timesheetRows] = await Promise.all([
    withAttendance ? Promise.all(ids.map(attendanceFor)) : Promise.resolve([]),
    withTimesheets ? Promise.all(ids.map(timesheetsFor)) : Promise.resolve([]),
  ]);
  return {
    attendance: sum(attendanceRows),
    timesheets: sum(timesheetRows),
    failed: [...attendanceRows, ...timesheetRows].some((queue) => queue == null || queue.failed),
  };
}

/** The attendance next step, shared by every manager Home; `place` names the pharmacy when there is one. */
export function attendanceStep(queue: InboxQueue | null, onPress: () => void, icon: ReactNode, place?: string | null): NextStep | null {
  if (!queue?.count) return null;
  return {
    key: 'attendance',
    title: `${plural(queue.count, 'attendance record')} to approve`,
    body: `${namesLine(queue.names) || 'Your team'}${place ? ` at ${place}` : ''}. Approve or correct them while the day is fresh.`,
    action: 'Review attendance',
    icon,
    onPress,
  };
}

/** The timesheet next step, shared by every manager Home. */
export function timesheetStep(queue: InboxQueue | null, onPress: () => void, icon: ReactNode): NextStep | null {
  if (!queue?.count) return null;
  const who = namesLine(queue.names);
  return {
    key: 'timesheets',
    title: `${plural(queue.count, 'timesheet')} ${queue.count === 1 ? 'needs' : 'need'} you`,
    body: who ? `${who} ${queue.count === 1 ? 'is' : 'are'} waiting for your review.` : 'Hours are waiting for your review.',
    action: 'Review timesheets',
    icon,
    onPress,
  };
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space['3xl'] },
  rows: { paddingBottom: space.xs },
  // space.xl matches the non-dense SectionCard header, so rows line up with the card title and icon.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  denseRow: { paddingHorizontal: space.lg },
  copy: { flex: 1, minWidth: 0 },
  name: {
    color: colors.textPrimary,
    fontFamily: font.inter.semiBold,
    fontSize: type.labelLarge.fontSize,
    lineHeight: type.labelLarge.lineHeight,
  },
  detail: {
    marginTop: 2,
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodySmall.fontSize,
    lineHeight: type.bodySmall.lineHeight,
  },
  meta: {
    maxWidth: '34%',
    color: colors.textMuted,
    fontFamily: type.labelSmall.fontFamily,
    fontSize: type.labelSmall.fontSize,
    lineHeight: type.labelSmall.lineHeight,
  },
  // Inset to the text edge so 40pt faces and tiles stay one column.
  divider: { height: StyleSheet.hairlineWidth, marginLeft: space.xl + 40 + space.md, backgroundColor: colors.border },
  skeletonLine: { marginTop: 6 },
  note: { paddingHorizontal: space.xl, paddingBottom: space.md, gap: space.xs },
  denseNote: { paddingHorizontal: space.lg },
  noteText: {
    color: colors.textSecondary,
    fontFamily: font.inter.regular,
    fontSize: type.bodyMedium.fontSize,
    lineHeight: type.bodyMedium.lineHeight,
  },
});
