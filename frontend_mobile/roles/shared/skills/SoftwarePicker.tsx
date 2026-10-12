import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { claimModeLabel, SOFTWARE_GROUP, roleSoftware as sharedRoleSoftware, softwareSubgroups, type SkillDefinition, type WorkerSkillRole } from '@chemisttasker/shared-core';
import { SkillIcon } from '../../../components/SkillIcon';

export { SOFTWARE_GROUP };
const registry = require('@chemisttasker/shared-core/skills_registry.json') as any;
const SUBGROUPS = softwareSubgroups(registry);

export const roleSoftware = (role: WorkerSkillRole | null, query: string): SkillDefinition[] => sharedRoleSoftware(registry, role, query);

/** Quick vendor-mark chips for named software, separate from skill cards: no definitions, no certificates. */
export function SoftwarePicker({ items, selected, onToggle, disabled, role }: {
  role: WorkerSkillRole | null; items: SkillDefinition[]; selected: string[]; onToggle: (code: string) => void; disabled?: boolean;
}) {
  const { colors } = useTheme();
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <Text variant="titleMedium" style={[styles.title, { color: colors.onSurface }]}>Software you have used</Text>
      <Text variant="bodySmall" style={[styles.help, { color: colors.onSurfaceVariant }]}>Pharmacies filter by the systems they run.</Text>
      {SUBGROUPS.map(subgroup => {
        const group = items.filter(item => (item as any).subgroup === subgroup);
        if (!group.length) return null;
        return (
          <View key={subgroup} style={{ gap: 8 }}>
            <Text style={[styles.subgroup, { color: colors.onSurfaceVariant }]}>{subgroup.toUpperCase()}</Text>
            <View style={styles.wrap}>
              {group.map(item => {
                const on = selected.includes(item.code);
                return (
                  <Pressable key={item.code} disabled={disabled} onPress={() => onToggle(item.code)}
                    accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled }} accessibilityLabel={item.label}
                    style={[styles.chip, { borderColor: on ? colors.primary : colors.outline, backgroundColor: on ? colors.secondaryContainer : colors.surface }]}>
                    <SkillIcon skill={item.code} size={22} />
                    <View><Text style={[styles.chipText, { color: on ? colors.onSecondaryContainer : colors.onSurface }, on && { fontWeight: '600' }]}>{item.label}</Text>
                    {role && claimModeLabel(item.eligibility[role]) && <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>{claimModeLabel(item.eligibility[role])}</Text>}</View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, marginTop: 8 },
  title: { fontWeight: '600', color: '#06214A' },
  help: { color: '#4B5563' },
  subgroup: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, color: '#4B5563' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  chipOn: { borderColor: '#3C18A8', backgroundColor: '#EFE9FD' },
  chipText: { color: '#111827', fontSize: 14 },
});
