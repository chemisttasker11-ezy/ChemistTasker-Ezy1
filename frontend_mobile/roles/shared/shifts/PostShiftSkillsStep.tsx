import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, IconButton, Searchbar, SegmentedButtons, Surface, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Plus, X } from 'lucide-react-native';
import skillsRegistry from '@chemisttasker/shared-core/skills_registry.json';
import {
  claimModeLabel, popularShiftChoices, roleSkillGroups, setRequirementLevel, skillLabel, SOFTWARE_GROUP, softwareSubgroups,
  type SkillDefinition, type WorkerSkillRole,
} from '@chemisttasker/shared-core';
import { colors, radius, space, touch, type } from '@/constants/tokens';
import { SkillIcon } from '../../../components/SkillIcon';
import { styles as shared } from './PostShiftScreen.styles';

type Setter<T> = Dispatch<SetStateAction<T>>;
const reg = skillsRegistry as any;
const ROLE_NAME: Record<string, string> = { PHARMACIST: 'pharmacist', INTERN: 'intern', TECHNICIAN: 'technician', ASSISTANT: 'assistant', STUDENT: 'student' };

type Props = {
  roleNeeded: string;
  mustHave: string[];
  setMustHave: Setter<string[]>;
  niceToHave: string[];
  setNiceToHave: Setter<string[]>;
  /** The pharmacy's own software for this role (registry IDs), offered first. */
  pharmacySoftware?: string[];
};

/** Requirements, short by default: selected, popular for the role, software, then everything behind "Browse all". */
export default function PostShiftSkillsStep({ roleNeeded, mustHave, setMustHave, niceToHave, setNiceToHave, pharmacySoftware = [] }: Props) {
  const [browsing, setBrowsing] = useState(false);
  const [query, setQuery] = useState('');
  const role = (ROLE_NAME[roleNeeded] ? roleNeeded : null) as WorkerSkillRole | null;
  const groups = useMemo(() => roleSkillGroups(reg, role), [role]);
  const eligible = useMemo(() => new Set(groups.flatMap(group => group.items.map(item => item.code))), [groups]);
  const popular = useMemo(() => popularShiftChoices(reg, role, pharmacySoftware), [role, pharmacySoftware]);
  const selected = [...mustHave, ...niceToHave];

  const set = (code: string, level: 'required' | 'preferred' | null) => {
    const next = setRequirementLevel(mustHave, niceToHave, code, level);
    setMustHave(next.required);
    setNiceToHave(next.preferred);
  };
  const toggle = (code: string) => set(code, selected.includes(code) ? null : 'preferred');

  if (!role) {
    return (
      <Surface style={shared.card} elevation={1}>
        <Text style={{ color: colors.textSecondary }}>
          {roleNeeded === 'EXPLORER' ? 'Explorer shifts do not list professional skills.' : 'Choose the role needed in Shift Details first; the choices here depend on it.'}
        </Text>
      </Surface>
    );
  }

  const chip = (code: string, note?: string) => {
    const on = selected.includes(code);
    return (
      <Pressable key={code} onPress={() => toggle(code)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
        accessibilityLabel={skillLabel(reg, code)} style={[s.chip, on && s.chipOn]}>
        <SkillIcon skill={code} size={22} />
        <Text style={[s.chipText, on && { fontWeight: '600', color: colors.primary }]}>{skillLabel(reg, code)}</Text>
        {note ? <Text style={[s.note, on && s.noteOn]}>{note}</Text> : null}
        {on ? (
          <Check size={18} color={colors.primary} strokeWidth={2.5} />
        ) : (
          <Plus size={18} color={colors.textSecondary} strokeWidth={2} />
        )}
      </Pressable>
    );
  };

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (item: SkillDefinition) => words.every(word => [item.label, item.definition, ...item.aliases].join(' ').toLowerCase().includes(word));
  const subgroups = softwareSubgroups(reg);

  return (
    <Surface style={shared.card} elevation={1}>
      <View style={s.tray}>
        <View style={s.trayHead}>
          <Text style={s.h3}>Selected for this shift</Text>
          <Text style={s.muted}>{mustHave.length} required · {niceToHave.length} preferred</Text>
        </View>
        {selected.length === 0 ? (
          <Text style={s.muted}>Nothing yet. Most shifts list two to four. Tap a choice below to add it as preferred.</Text>
        ) : selected.map(code => {
          const level = mustHave.includes(code) ? 'required' : 'preferred';
          const unavailable = !eligible.has(code);
          return (
            <View key={code} style={[s.row, level === 'required' && s.rowRequired]}>
              <View style={s.rowTop}>
                <SkillIcon skill={code} size={22} />
                <Text style={s.rowLabel}>{skillLabel(reg, code)}</Text>
                <IconButton icon={({ size, color }) => <X size={size} color={color} />} size={18} accessibilityLabel={`Remove ${skillLabel(reg, code)}`} onPress={() => set(code, null)} />
              </View>
              {unavailable ? <Text style={s.warn}>Not available for this role; remove before saving.</Text> : (
                <SegmentedButtons
                  value={level}
                  onValueChange={value => { if (value !== level) set(code, value as 'required' | 'preferred'); }}
                  style={{ minHeight: touch.min }}
                  buttons={[
                    {
                      value: 'required',
                      label: 'Required',
                      style: { minHeight: touch.min },
                      labelStyle: { minHeight: touch.min, textAlignVertical: 'center', lineHeight: touch.min },
                    },
                    {
                      value: 'preferred',
                      label: 'Preferred',
                      style: { minHeight: touch.min },
                      labelStyle: { minHeight: touch.min, textAlignVertical: 'center', lineHeight: touch.min },
                    },
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>

      <Text style={s.h3}>Popular for {ROLE_NAME[role]} shifts</Text>
      <Text style={s.muted}>Mark Required only when someone cannot do the shift without it; required skills limit who can apply.</Text>
      <View style={s.wrap}>{popular.skills.map(code => chip(code))}</View>

      {popular.software.length > 0 ? (
        <>
          <Text style={s.h3}>Software</Text>
          <View style={s.wrap}>{popular.software.map(code => chip(code, pharmacySoftware.includes(code) ? 'Your pharmacy' : undefined))}</View>
        </>
      ) : null}

      <Button mode="outlined" icon="magnify" onPress={() => setBrowsing(true)} style={s.browse} contentStyle={{ minHeight: touch.min }}>
        {`Browse all skills and software (${eligible.size})`}
      </Button>

      <Modal visible={browsing} animationType="slide" onRequestClose={() => setBrowsing(false)}>
        <SafeAreaView style={s.modal}>
          <View style={s.modalHead}>
            <Text style={s.h2}>All skills and software</Text>
            <IconButton icon={({ size, color }) => <X size={size} color={color} />} accessibilityLabel="Close" onPress={() => setBrowsing(false)} />
          </View>
          <Searchbar placeholder="Search, e.g. Webster, ODT, Minfos" value={query} onChangeText={setQuery} style={{ marginHorizontal: space.md }}
            accessibilityLabel="Search skills or software" />
          <ScrollView contentContainerStyle={{ padding: space.md, gap: space.md }}>
            {groups.map(group => {
              const items = (group.key === SOFTWARE_GROUP
                ? [...group.items].sort((a: any, b: any) => subgroups.indexOf(a.subgroup) - subgroups.indexOf(b.subgroup))
                : group.items).filter(matches);
              if (!items.length) return null;
              return (
                <View key={group.key} style={{ gap: space.xs }}>
                  <Text style={s.groupTitle}>{(group.key === SOFTWARE_GROUP ? 'Software' : group.label).toUpperCase()}</Text>
                  {items.map(item => {
                    const on = selected.includes(item.code);
                    const mode = claimModeLabel(item.eligibility[role]);
                    return (
                      <Pressable key={item.code} onPress={() => toggle(item.code)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                        accessibilityLabel={item.label} style={[s.browseRow, on && s.chipOn]}>
                        <SkillIcon skill={item.code} size={24} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.rowLabel}>{item.label}</Text>
                          {mode || item.group !== SOFTWARE_GROUP ? (
                            <Text style={[s.muted, on && s.mutedOn]} numberOfLines={2}>{[mode, item.group !== SOFTWARE_GROUP ? item.definition : null].filter(Boolean).join(' · ')}</Text>
                          ) : null}
                        </View>
                        {on ? (
                          <Check size={18} color={colors.primary} strokeWidth={2.5} />
                        ) : (
                          <Plus size={18} color={colors.textSecondary} strokeWidth={2} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
          <View style={s.modalFoot}>
            <Text style={s.muted}>{selected.length} selected</Text>
            <Button mode="contained" onPress={() => setBrowsing(false)} contentStyle={{ minHeight: touch.min }}>Done</Button>
          </View>
        </SafeAreaView>
      </Modal>
    </Surface>
  );
}

const s = StyleSheet.create({
  tray: { gap: space.xs, padding: space.md, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, marginBottom: space.md },
  trayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: space.xxs },
  h2: { fontSize: type.titleMedium.fontSize, fontWeight: '700', color: colors.textPrimary },
  h3: { fontSize: type.labelLarge.fontSize, fontWeight: '700', color: colors.textPrimary, marginTop: space.xxs },
  muted: { fontSize: type.bodySmall.fontSize, color: colors.textSecondary },
  warn: { fontSize: type.labelSmall.fontSize, color: colors.status.amber.fg },
  row: { gap: space.xxs, padding: space.xs, borderRadius: radius.control },
  rowRequired: { backgroundColor: colors.tone.violet.bg },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  rowLabel: { flex: 1, fontSize: type.bodyMedium.fontSize, fontWeight: '600', color: colors.textPrimary },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginVertical: space.xs },
  chip: { minHeight: touch.min, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm, borderRadius: radius.control, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceBg },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.tone.violet.bg },
  chipText: { color: colors.textPrimary, fontSize: type.bodySmall.fontSize },
  note: { fontSize: type.labelSmall.fontSize, fontWeight: '600', color: colors.textSecondary },
  noteOn: { color: colors.tone.violet.fg },
  mutedOn: { color: colors.tone.violet.fg },
  browse: { marginTop: space.xs, borderRadius: radius.control },
  modal: { flex: 1, backgroundColor: colors.pageBg },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: space.md, paddingTop: space.xs },
  groupTitle: { fontSize: type.labelSmall.fontSize, fontWeight: '700', letterSpacing: 0.6, color: colors.textSecondary },
  browseRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, borderRadius: radius.control, borderWidth: 1, borderColor: 'transparent' },
  modalFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.md, borderTopWidth: 1, borderTopColor: colors.border },
});
