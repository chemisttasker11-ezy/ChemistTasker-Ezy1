import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { BadgeCheck, CalendarClock, ClipboardCheck, ClipboardList, Radar, Wallet, type LucideIcon } from 'lucide-react-native';
import { colors, radius, space, touch, type } from '@/constants/tokens';
import type { StepKey } from './PostShiftScreen.helpers';

const text = (t: { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing: number }) =>
  ({ fontFamily: t.fontFamily, fontSize: t.fontSize, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing });

const STEP: Record<StepKey, { label: string; Icon: LucideIcon; tone: string }> = {
  details: { label: 'Details', Icon: ClipboardList, tone: colors.accentStrong },
  skills: { label: 'Skills', Icon: BadgeCheck, tone: colors.tone.blue.fg },
  visibility: { label: 'Who sees it', Icon: Radar, tone: colors.tone.cyan.fg },
  timetable: { label: 'Dates', Icon: CalendarClock, tone: colors.tone.magenta.fg },
  payrate: { label: 'Pay', Icon: Wallet, tone: colors.tone.blue.fg },
  review: { label: 'Review', Icon: ClipboardCheck, tone: colors.accentStrong },
};

export default function PostShiftProgress({ steps, active, onSelect }: {
  steps: StepKey[]; active: StepKey; onSelect: (step: StepKey) => void;
}) {
  const index = Math.max(0, steps.indexOf(active));
  const current = STEP[active];
  const next = steps[index + 1];
  const CurrentIcon = current.Icon;
  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <View style={s.tile} accessible={false}>
          <CurrentIcon size={20} color={colors.surfaceBg} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.count}>Step {index + 1} of {steps.length}</Text>
          <Text style={s.title} accessibilityRole="header">{current.label}</Text>
        </View>
        {next ? <Text style={s.next}>Next: {STEP[next].label}</Text> : null}
      </View>
      <View style={s.bar} accessibilityRole="progressbar" accessibilityLabel={`Step ${index + 1} of ${steps.length}`}
        accessibilityValue={{ min: 1, max: steps.length, now: index + 1 }}>
        {steps.map((step, position) => (
          <Pressable key={step} onPress={() => onSelect(step)} accessibilityRole="button" accessibilityLabel={`Go to ${STEP[step].label}`}
            style={s.segmentHit}>
            <View style={[s.segment, {
              backgroundColor: position < index ? STEP[step].tone : position === index ? colors.primary : colors.border,
              opacity: position < index ? 0.78 : 1,
            }]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginVertical: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tile: {
    width: touch.min,
    height: touch.min,
    borderRadius: radius.control,
    borderCurve: 'continuous',
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { ...text(type.labelSmall), color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  title: { ...text(type.titleMedium), color: colors.textPrimary },
  next: { ...text(type.bodySmall), color: colors.textSecondary, textAlign: 'right' },
  bar: { flexDirection: 'row', gap: space.xs, marginTop: space.xs },
  segmentHit: { flex: 1, minHeight: touch.min, justifyContent: 'center' },
  segment: { height: 6, borderRadius: radius.pill },
});
