import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { StepKey } from './PostShiftScreen.helpers';

/** Same names, symbols and tones as the web wizard (Lucide there, the nearest MaterialCommunityIcons here). */
const STEP: Record<StepKey, { label: string; icon: string; tone: string }> = {
  details: { label: 'Details', icon: 'clipboard-text-outline', tone: '#4A1FA8' },
  skills: { label: 'Skills', icon: 'check-decagram-outline', tone: '#1F4FBF' },
  visibility: { label: 'Who sees it', icon: 'radar', tone: '#0B6577' },
  timetable: { label: 'Dates', icon: 'calendar-clock', tone: '#A1179A' },
  review: { label: 'Review', icon: 'clipboard-check-outline', tone: '#4A1FA8' },
  payrate: { label: 'Pay', icon: 'wallet-outline', tone: '#1F4FBF' },
};
const BRAND = '#5222B8';

export default function PostShiftProgress({ steps, active, onSelect }: {
  steps: StepKey[]; active: StepKey; onSelect: (step: StepKey) => void;
}) {
  const index = Math.max(0, steps.indexOf(active));
  const current = STEP[active];
  const next = steps[index + 1];
  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <View style={s.tile} accessible={false}>
          <MaterialCommunityIcons name={current.icon as any} size={22} color="#FFFFFF" />
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
            hitSlop={{ top: 12, bottom: 12 }} style={[s.segment, {
              backgroundColor: position < index ? STEP[step].tone : position === index ? BRAND : '#E5E7EB',
              opacity: position < index ? 0.75 : 1,
            }]} />
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginVertical: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 42, height: 42, borderRadius: 13, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 12.5, fontWeight: '600', color: '#4B5563' },
  title: { fontSize: 17, fontWeight: '700', color: '#06214A' },
  next: { fontSize: 12.5, color: '#4B5563', textAlign: 'right' },
  bar: { flexDirection: 'row', gap: 4, marginTop: 12 },
  segment: { flex: 1, height: 6, borderRadius: 3 },
});
