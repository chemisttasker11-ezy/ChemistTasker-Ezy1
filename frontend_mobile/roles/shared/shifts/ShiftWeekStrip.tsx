import React, { memo } from 'react';
import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { ScalePressable } from '@/components/ui';
import { colors, radius, space, touch, type } from '@/constants/tokens';

// Text style from a type token (the tokens also carry family/size/weight aliases that are not style keys).
const text = (t: { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing: number }) =>
  ({ fontFamily: t.fontFamily, fontSize: t.fontSize, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing });

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');
/** A local Date as 'YYYY-MM-DD' (the API's slot date format). */
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseIso = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
};
/** 'YYYY-MM-DD' moved by whole days, in local time (safe across daylight saving). */
export const addDaysIso = (iso: string, days: number) => {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
};
/** The Monday-to-Sunday week (Australian weeks) holding `iso`, as seven 'YYYY-MM-DD' dates. */
export const weekOf = (iso: string) => {
  const offset = (parseIso(iso).getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => addDaysIso(iso, i - offset));
};

export type ShiftWeekStripProps = {
  /** Selected day, 'YYYY-MM-DD'. The strip shows its week. */
  value: string;
  onChange: (date: string) => void;
  /** Shifts per day ('YYYY-MM-DD' -> count); a day with any gets a dot and says so to screen readers. */
  counts?: Record<string, number>;
  /** Today, 'YYYY-MM-DD'; defaults to the phone's date. */
  today?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Seven-day strip for roster and board day views (teardown STEAL 5): day and date, selected fill, a dot on days
 * with shifts, and previous / next week buttons. Leaves the screen to the shift list instead of a month grid.
 */
export const ShiftWeekStrip = memo(function ShiftWeekStrip({ value, onChange, counts, today, style }: ShiftWeekStripProps) {
  const days = weekOf(value);
  const todayIso = today ?? isoDate(new Date());
  const first = parseIso(days[0]);
  const last = parseIso(days[6]);
  const range = first.getMonth() === last.getMonth()
    ? `${first.getDate()} to ${last.getDate()} ${MONTHS[last.getMonth()]}`
    : `${first.getDate()} ${MONTHS[first.getMonth()]} to ${last.getDate()} ${MONTHS[last.getMonth()]}`;

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.header}>
        <Text style={styles.range} numberOfLines={1}>{range}</Text>
        <ScalePressable
          static
          pressBg
          onPress={() => onChange(addDaysIso(value, -7))}
          accessibilityRole="button"
          accessibilityLabel={`Previous week, before ${range}`}
          style={styles.nav}
        >
          <ChevronLeft size={20} color={colors.textSecondary} strokeWidth={1.75} />
        </ScalePressable>
        <ScalePressable
          static
          pressBg
          onPress={() => onChange(addDaysIso(value, 7))}
          accessibilityRole="button"
          accessibilityLabel={`Next week, after ${range}`}
          style={styles.nav}
        >
          <ChevronRight size={20} color={colors.textSecondary} strokeWidth={1.75} />
        </ScalePressable>
      </View>
      <View style={styles.days} accessibilityRole="tablist" accessibilityLabel={`Week of ${range}`}>
        {days.map((iso) => {
          const date = parseIso(iso);
          const selected = iso === value;
          const isToday = iso === todayIso;
          const count = counts?.[iso] ?? 0;
          const fg = selected ? colors.accentStrong : colors.textPrimary;
          return (
            <ScalePressable
              key={iso}
              scaleValue={0.97}
              haptic={selected ? 'none' : 'selection'}
              onPress={() => {
                if (!selected) onChange(iso);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={[
                `${isToday ? 'Today, ' : ''}${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`,
                count ? `${count} ${count === 1 ? 'shift' : 'shifts'}` : 'no shifts',
              ].join(', ')}
              style={styles.dayTarget}
            >
              <View style={[styles.day, selected ? styles.daySelected : isToday ? styles.dayToday : null]}>
                <Text style={[styles.dayLetter, { color: selected ? colors.accentStrong : colors.textMuted }]} maxFontSizeMultiplier={1.2}>
                  {DAY_SHORT[date.getDay()]}
                </Text>
                <Text style={[styles.dayNumber, { color: fg }]} maxFontSizeMultiplier={1.2}>
                  {date.getDate()}
                </Text>
                <View style={[styles.dot, count ? { backgroundColor: selected ? colors.accentStrong : colors.primary } : null]} />
              </View>
            </ScalePressable>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: space.xs,
    paddingHorizontal: space.xs,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceBg,
  },
  // Week arrows sit beside the visible range so the seven days get the full width (each cell stays >= 44pt on a 360pt phone).
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.sm },
  range: { flex: 1, ...text(type.labelLarge), color: colors.textPrimary },
  nav: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control },
  days: { flexDirection: 'row' },
  dayTarget: { flex: 1, minWidth: 0, minHeight: touch.min, alignItems: 'center' },
  day: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 2,
    marginHorizontal: 2,
    paddingTop: space.xs + 2,
    paddingBottom: space.xs,
    borderRadius: radius.nested,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  daySelected: { backgroundColor: colors.tone.violet.bg, borderColor: colors.tone.violet.bg },
  dayToday: { borderColor: colors.border },
  dayLetter: text(type.labelSmall),
  dayNumber: { ...text(type.titleMedium), fontVariant: ['tabular-nums'] },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
});
