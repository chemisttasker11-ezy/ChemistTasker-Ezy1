import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Chip, IconButton, Text, TextInput } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import { pharmacyServiceCodes, scriptVolumeBands, skillLabel, supportRoles, setSupportCount, workloadTagOptions, type SupportEntry } from '@chemisttasker/shared-core';
import { SkillIcon } from '../../../components/SkillIcon';

const reg = registry as any;
const wrap = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 };

export function PharmacyProfileFields({ services, weekday, weekend, onServicesChange, onWeekdayChange, onWeekendChange }: {
  services: string[]; weekday: string; weekend: string;
  onServicesChange: (value: string[]) => void; onWeekdayChange: (value: string) => void; onWeekendChange: (value: string) => void;
}) {
  return <View style={{ gap: 12, marginTop: 16 }}>
    <Text variant="titleMedium">Services and typical script volume</Text>
    <Text>Choose services offered at this pharmacy. Script volumes describe the whole pharmacy on a typical day.</Text>
    <View style={wrap}>{pharmacyServiceCodes(reg).map(code => <Chip key={code} style={{ maxWidth: '100%' }}
      icon={() => <SkillIcon skill={code} />} selected={services.includes(code)} mode={services.includes(code) ? 'flat' : 'outlined'}
      accessibilityRole="checkbox" accessibilityState={{ checked: services.includes(code) }}
      onPress={() => onServicesChange(services.includes(code) ? services.filter(item => item !== code) : [...services, code])}>{skillLabel(reg, code)}</Chip>)}</View>
    {[{ label: 'Weekday script volume', value: weekday, change: onWeekdayChange }, { label: 'Weekend script volume', value: weekend, change: onWeekendChange }].map(field =>
      <View key={field.label} style={{ gap: 8 }}>
        <Text variant="labelLarge">{field.label}</Text>
        <View style={wrap}>{[{ code: '', label: 'Not specified', range: '' }, ...scriptVolumeBands(reg)].map(band =>
          <Chip key={band.code} selected={field.value === band.code} mode={field.value === band.code ? 'flat' : 'outlined'}
            accessibilityRole="radio" accessibilityState={{ checked: field.value === band.code }} onPress={() => field.change(band.code)}>
            {band.range ? `${band.label} · ${band.range}` : band.label}
          </Chip>)}</View>
      </View>)}
  </View>;
}

const COMMON_SUPPORT = ['PHARMACIST', 'TECHNICIAN', 'DISPENSARY_ASSISTANT', 'ASSISTANT'];

/** Post-shift workload (symbol rows with explainers) and staff working alongside (steppers; rarer roles behind "More roles"). */
export function ShiftContextFields({ workload, support, onWorkloadChange, onSupportChange }: {
  workload: string[]; support: SupportEntry[]; onWorkloadChange: (value: string[]) => void; onSupportChange: (value: SupportEntry[]) => void;
}) {
  const [moreRoles, setMoreRoles] = useState(false);
  const max = reg.pharmacy_profile?.support_count_max ?? 20;
  const roles = supportRoles(reg);
  const shown = roles.filter(role => moreRoles || COMMON_SUPPORT.includes(role.code) || support.some(entry => entry.role === role.code));
  const countOf = (code: string) => support.find(entry => entry.role === code)?.count ?? 0;
  const step = (code: string, next: number) => onSupportChange(setSupportCount(reg, support, code, next > 0 ? String(next) : ''));

  return <View style={{ gap: 12 }}>
    <Text variant="titleSmall">Workload</Text>
    {workloadTagOptions(reg).filter(tag => !tag.legacy || workload.includes(tag.code)).map(tag => {
      const on = workload.includes(tag.code);
      return <Pressable key={tag.code} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={tag.label}
        onPress={() => onWorkloadChange(on ? workload.filter(code => code !== tag.code) : [...workload, tag.code])}
        style={[ctx.tile, on && ctx.tileOn]}>
        <MaterialCommunityIcons name={(tag.icon_mobile || 'circle-outline') as any} size={22} color="#008DDB" accessible={false} />
        <View style={{ flex: 1 }}>
          <Text style={ctx.tileLabel}>{tag.label}</Text>
          <Text style={ctx.muted}>{tag.explainer}</Text>
        </View>
        <MaterialCommunityIcons name={on ? 'check' : 'plus'} size={18} color="#3C18A8" accessible={false} />
      </Pressable>;
    })}
    <Text variant="titleSmall" style={{ marginTop: 8 }}>Working alongside them</Text>
    <Text style={ctx.muted}>Other staff on the same shift. Leave at 0 if none or unknown.</Text>
    {shown.map(role => {
      const count = countOf(role.code);
      return <View key={role.code} style={ctx.stepRow}>
        <Text style={{ flex: 1, fontSize: 15 }}>{role.label}</Text>
        <IconButton icon="minus" mode="outlined" size={18} disabled={count === 0} accessibilityLabel={`One fewer ${role.one}`} onPress={() => step(role.code, count - 1)} />
        <Text accessibilityLiveRegion="polite" style={ctx.count}>{count}</Text>
        <IconButton icon="plus" mode="outlined" size={18} disabled={count >= max} accessibilityLabel={`One more ${role.one}`} onPress={() => step(role.code, count + 1)} />
      </View>;
    })}
    {shown.length < roles.length ? <Button mode="text" onPress={() => setMoreRoles(true)} style={{ alignSelf: 'flex-start' }}>More roles</Button> : null}
  </View>;
}

const ctx = StyleSheet.create({
  tile: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  tileOn: { borderColor: '#3C18A8', backgroundColor: '#EFE9FD' },
  tileLabel: { fontSize: 14.5, fontWeight: '600', color: '#111827' },
  muted: { fontSize: 13, color: '#4B5563' },
  stepRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  count: { width: 28, textAlign: 'center', fontWeight: '700', fontSize: 16 },
});
