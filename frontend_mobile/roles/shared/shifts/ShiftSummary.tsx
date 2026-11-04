import React, { memo, type ReactNode, useMemo, useState } from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ChevronDown, ChevronUp, Gauge, Handshake, Monitor, UsersRound, Zap } from 'lucide-react-native';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import {
  scriptVolumeBand,
  shiftRequirementGroups,
  showPublishedShiftRates,
  skillLabel,
  supportSummary,
  type PharmacySummary,
  type Shift,
} from '@chemisttasker/shared-core';
import { Pill, ScalePressable } from '@/components/ui';
import { colors, font, radius, space, touch, type } from '@/constants/tokens';
import { formatDay, plural, roleWord, slotStart, timeRange } from '@/roles/shared/dashboard/managerHomeLogic';
import type { RatePreference, ShiftSlot } from './ShiftsBoard/types';
import { formatCurrency, getRateSummary, getSlotRate } from './ShiftsBoard/utils/rates';
import {
  getExpandedSlotsForDisplay,
  getShiftCity,
  getShiftDistance,
  getShiftNegotiable,
  getShiftPharmacyName,
  getShiftState,
  getShiftUrgent,
} from './ShiftsBoard/utils/shift';
import { ShiftTermsSummary } from './ShiftTermsSummary';

const SLOT_PREVIEW = 3;
// Text style from a type token (the tokens also carry family/size/weight aliases that are not style keys).
const text = (t: { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing: number }) =>
  ({ fontFamily: t.fontFamily, fontSize: t.fontSize, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing });
const reg = registry as any;

/** The card's headline rate (teardown AVOID 6: the hourly rate leads, never a total). */
export function rateHeadline(summary: { display: string; unitLabel: string }, published: boolean) {
  if (!published) return { amount: 'Staff agreement', unit: '' };
  if (/^\d/.test(summary.display)) {
    return { amount: `$${summary.display.replace(' - ', ' - $')}`, unit: summary.unitLabel === 'Package' ? ' package' : summary.unitLabel };
  }
  return { amount: summary.display === 'N/A' ? 'Rate not listed' : summary.display, unit: '' };
}

const HHMM = /^\d{1,2}:\d{2}/;

/** Minutes in a slot: the API's duration when given, else end minus start (an overnight slot ends the next day). */
export function slotMinutes(slot: Pick<ShiftSlot, 'date' | 'startTime' | 'endTime' | 'durationMinutes'>): number | null {
  if (slot.durationMinutes != null && slot.durationMinutes > 0) return slot.durationMinutes;
  if (!HHMM.test(slot.startTime ?? '') || !HHMM.test(slot.endTime ?? '')) return null;
  const start = slotStart(slot.date, slot.startTime);
  const end = slotStart(slot.date, slot.endTime);
  if (!start || !end) return null;
  const minutes = (end.getTime() - start.getTime()) / 60_000;
  return minutes > 0 ? minutes : minutes + 24 * 60;
}

/** "8h", "7.5h". */
export const hoursText = (minutes: number) => `${Math.round((minutes / 60) * 10) / 10}h`;

/** One slot's own rate (AVOID 2: every date discloses its rate); null when the headline already says it all. */
export function slotRateText(
  rate: number,
  shift: Pick<Shift, 'employmentType' | 'rateType' | 'minAnnualSalary' | 'maxAnnualSalary'>,
  published: boolean,
): string | null {
  // An annual package (getRateSummary's 'Package') has no hourly slot pay; hourly contracts still show theirs.
  const annualPackage = ['FULL_TIME', 'PART_TIME'].includes(shift.employmentType ?? '') && Boolean(Number(shift.minAnnualSalary) || Number(shift.maxAnnualSalary));
  if (!published || annualPackage) return null;
  if (rate > 0) return `$${formatCurrency(rate)}/hr`;
  return shift.rateType === 'PHARMACIST_PROVIDED' ? 'Your rate' : null;
}

/** Dispensary context a locum checks before committing (teardown STEAL 2): software, script volume, who works alongside. */
function contextPills(shift: Shift, firstSlot?: ShiftSlot) {
  const pills: { key: string; label: string; icon: ReactNode }[] = [];
  const { software } = shiftRequirementGroups(reg, shift.mustHave || [], shift.niceToHave || []);
  software.slice(0, 2).forEach(({ code }) => pills.push({ key: `sw-${code}`, label: skillLabel(reg, code), icon: <Monitor /> }));
  const pharmacy = shift.pharmacyDetail as unknown as PharmacySummary | null | undefined;
  const day = slotStart(firstSlot?.date)?.getDay();
  const weekend = day === 0 || day === 6;
  const band = scriptVolumeBand(reg, weekend ? pharmacy?.scriptVolumeWeekend : pharmacy?.scriptVolumeWeekday)
    ?? scriptVolumeBand(reg, weekend ? pharmacy?.scriptVolumeWeekday : pharmacy?.scriptVolumeWeekend);
  if (band) pills.push({ key: 'scripts', label: band.range.replace('–', ' to '), icon: <Gauge /> });
  const support = supportSummary(reg, shift.supportOnShift || []);
  if (support) pills.push({ key: 'support', label: `With ${support}`, icon: <UsersRound /> });
  return pills;
}

export type ShiftSummaryProps = {
  shift: Shift;
  /** Slots to list; defaults to every slot with recurring ones expanded. Boards pass the upcoming ones. */
  slots?: ShiftSlot[];
  /** The worker's own rates, used for pharmacist-provided shifts. */
  ratePreference?: RatePreference;
  /** Right of the pharmacy name: a status Pill, CountBadge or save control. */
  status?: ReactNode;
  /** Opens the shift; the name block becomes one button, "Open shift at <pharmacy>". */
  onPress?: () => void;
  /** Extra block under the terms (candidates, notes, offer state). */
  children?: ReactNode;
  /** Actions at the bottom (Apply, Counter offer, Manage). */
  footer?: ReactNode;
  now?: Date;
  style?: StyleProp<ViewStyle>;
};

/**
 * The shift card body every board and Shift Centre list shares: pharmacy and role, the hourly rate first in
 * tabular figures, dispensary context, each date with its own time and rate, then the money terms.
 */
export const ShiftSummary = memo(function ShiftSummary({
  shift,
  slots,
  ratePreference,
  status,
  onPress,
  children,
  footer,
  now,
  style,
}: ShiftSummaryProps) {
  const [showAll, setShowAll] = useState(false);
  const published = showPublishedShiftRates(shift);
  const list = useMemo(() => slots ?? getExpandedSlotsForDisplay((shift.slots ?? []) as ShiftSlot[]), [shift.slots, slots]);
  const pills = useMemo(() => contextPills(shift, list[0]), [list, shift]);
  const today = now ?? new Date();

  const name = getShiftPharmacyName(shift);
  const distance = getShiftDistance(shift);
  const place = [getShiftCity(shift), getShiftState(shift)].filter(Boolean).join(', ');
  const meta = [shift.roleLabel || roleWord(shift.roleNeeded), place, distance != null ? `${Math.round(distance * 10) / 10} km` : '']
    .filter(Boolean)
    .join(' · ');
  const { amount, unit } = rateHeadline(getRateSummary(shift), published);
  const minutes = list.reduce((sum, slot) => sum + (slotMinutes(slot) ?? 0), 0);
  const days = new Set(list.map((slot) => slot.date)).size;
  const span = [days ? plural(days, 'day') : '', minutes ? hoursText(minutes) : ''].filter(Boolean).join(' · ');
  const shown = showAll ? list : list.slice(0, SLOT_PREVIEW);
  const urgent = getShiftUrgent(shift);

  const title = (
    <View style={styles.titleBlock}>
      <Text style={styles.name} numberOfLines={2}>{name}</Text>
      {meta ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
    </View>
  );

  return (
    <View style={[styles.card, urgent ? styles.urgentCard : null, style]}>
      <View style={styles.header}>
        {onPress ? (
          <ScalePressable static pressBg onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open shift at ${name}`} style={styles.titlePress}>
            {title}
          </ScalePressable>
        ) : (
          title
        )}
        {status}
      </View>

      <View style={styles.rateRow} accessible accessibilityLabel={[`${amount}${unit.replace('/hr', ' an hour')}`, span].filter(Boolean).join(', ')}>
        <Text style={styles.rate} maxFontSizeMultiplier={1.3}>
          {amount}
          {unit ? <Text style={styles.rateUnit}>{unit}</Text> : null}
        </Text>
        {span ? <Text style={styles.span}>{span}</Text> : null}
      </View>

      {urgent || (published && getShiftNegotiable(shift)) || pills.length ? (
        <View style={styles.pills}>
          {urgent ? <Pill label="Urgent" tone="amber" icon={<Zap />} /> : null}
          {published && getShiftNegotiable(shift) ? <Pill label="Rate negotiable" tone="violet" icon={<Handshake />} /> : null}
          {pills.map((pill) => <Pill key={pill.key} label={pill.label} icon={pill.icon} />)}
        </View>
      ) : null}

      {list.length ? (
        <View style={styles.slots}>
          {shown.map((slot, index) => {
            const start = slotStart(slot.date, slot.startTime);
            const day = start ? formatDay(start, today) : slot.date;
            const time = timeRange(slot.startTime, slot.endTime);
            const rate = slotRateText(getSlotRate(slot, shift, ratePreference), shift, published);
            return (
              <View
                key={`${slot.id}-${slot.date}-${index}`}
                style={[styles.slotRow, index > 0 ? styles.slotDivider : null]}
                accessible
                accessibilityLabel={[day, time, rate?.replace('/hr', ' an hour')].filter(Boolean).join(', ')}
              >
                <Text style={styles.slotDay} numberOfLines={1}>{day}</Text>
                <Text style={styles.slotTime} numberOfLines={1}>{time}</Text>
                {rate ? <Text style={styles.slotRate} numberOfLines={1}>{rate}</Text> : null}
              </View>
            );
          })}
          {list.length > SLOT_PREVIEW ? (
            <ScalePressable
              static
              pressBg
              onPress={() => setShowAll((value) => !value)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showAll }}
              accessibilityLabel={showAll ? 'Show fewer dates' : `Show all ${list.length} dates`}
              style={[styles.more, styles.slotDivider]}
            >
              <Text style={styles.moreText}>{showAll ? 'Show fewer dates' : `Show all ${list.length} dates`}</Text>
              {showAll ? <ChevronUp size={16} color={colors.accentStrong} /> : <ChevronDown size={16} color={colors.accentStrong} />}
            </ScalePressable>
          ) : null}
        </View>
      ) : null}

      <ShiftTermsSummary shift={shift} />
      {children}
      {footer}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceBg,
  },
  // Web marks urgent cards with an amber outline; same 1pt border, only its colour changes.
  urgentCard: { borderColor: colors.status.amber.fg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  titlePress: { flex: 1, borderRadius: radius.control, marginHorizontal: -space.xs, paddingHorizontal: space.xs },
  titleBlock: { flex: 1, gap: space.xxs },
  name: { ...text(type.titleMedium), color: colors.textPrimary },
  meta: { ...text(type.bodySmall), color: colors.textSecondary },
  rateRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: space.sm },
  rate: { ...text(type.headlineSmall), color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  rateUnit: { ...text(type.labelLarge), fontFamily: font.inter.medium, color: colors.textSecondary },
  span: { ...text(type.bodySmall), color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs + 2 },
  slots: { borderRadius: radius.nested, borderCurve: 'continuous', backgroundColor: colors.subtleBg, paddingHorizontal: space.md },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 40, paddingVertical: space.sm },
  slotDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  slotDay: { flex: 1.1, ...text(type.labelLarge), color: colors.textPrimary },
  slotTime: { flex: 1, ...text(type.bodyMedium), color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  slotRate: { ...text(type.labelLarge), color: colors.textPrimary, fontVariant: ['tabular-nums'], textAlign: 'right' },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, minHeight: touch.min },
  moreText: { ...text(type.labelLarge), color: colors.accentStrong },
});
