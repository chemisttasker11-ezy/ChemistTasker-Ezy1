import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { SOFTWARE_GROUP, pharmacySoftwareByCategory, softwareSubgroups, type SkillDefinition } from '@chemisttasker/shared-core';
import { SkillIcon } from '../../../components/SkillIcon';

const registry = require('@chemisttasker/shared-core/skills_registry.json') as any;
// Every pharmacy checks its state RTPM system, so Monitoring is not a pharmacy choice.
const CATEGORIES = softwareSubgroups(registry).filter(category => category !== 'Monitoring');
const options = (category: string): SkillDefinition[] =>
  (registry.skills as SkillDefinition[]).filter(skill => skill.group === SOFTWARE_GROUP && skill.subgroup === category);

/** One product per category, stored as registry IDs; shift posting uses these as default software requirements. */
export function PharmacySoftwareFields({ value, onChange }: { value: string[]; onChange: (codes: string[]) => void }) {
  const chosen = pharmacySoftwareByCategory(registry, value);
  const pick = (category: string, code: string) => {
    const next = { ...chosen };
    if (next[category] === code) delete next[category]; else next[category] = code;
    onChange(Object.values(next));
  };
  return (
    <View style={styles.section}>
      <Text style={styles.header}>Software this pharmacy runs</Text>
      <Text style={styles.helper}>New shifts list these as preferred experience; you can change them per shift.</Text>
      {CATEGORIES.map(category => (
        <View key={category} style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={category}>
          <Text style={styles.category}>{category.toUpperCase()}</Text>
          <View style={styles.wrap}>
            {options(category).map(item => {
              const on = chosen[category] === item.code;
              return (
                <Pressable key={item.code} onPress={() => pick(category, item.code)} accessibilityRole="radio"
                  accessibilityState={{ checked: on }} accessibilityLabel={item.label} style={[styles.chip, on && styles.chipOn]}>
                  <SkillIcon skill={item.code} size={20} />
                  <Text style={[styles.chipText, on && { fontWeight: '600' }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, marginTop: 16 },
  header: { fontSize: 16, fontWeight: '600', color: '#06214A' },
  helper: { color: '#4B5563', fontSize: 13 },
  category: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, color: '#4B5563' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  chipOn: { borderColor: '#3C18A8', backgroundColor: '#EFE9FD' },
  chipText: { color: '#111827', fontSize: 14 },
});
