// A worker's skills wherever they are shown (talent cards, candidate review, booked-worker profile): the three groups
// Clinical services / Software / Other pharmacy skills (shared-core projectTalentSkills), each a labelled row of
// symbol + name chips, like the job board's details. Certificate skills carry their check state; others never do.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Text } from 'react-native-paper';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import { projectTalentSkills, skillEvidenceState, skillLabel, type VerificationSummary } from '@chemisttasker/shared-core';
import { SkillIcon } from '../../../components/SkillIcon';
import { SkillEvidenceIcon } from './VerificationBadges';

const GROUPS = [
  { key: 'clinicalServices', title: 'Clinical services' },
  { key: 'dispenseSoftware', title: 'Software' },
  { key: 'expandedScope', title: 'Other pharmacy skills' },
] as const;

export function WorkerSkillRows({ skills, verification = null }: { skills: readonly string[]; verification?: VerificationSummary | null }) {
  const groups = projectTalentSkills(registry as any, skills);
  const rows = GROUPS.filter(group => groups[group.key].length > 0);
  if (!rows.length) return null;
  return (
    <View style={styles.rows}>
      {rows.map(({ key, title }) => (
        <View key={key} style={styles.row}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.chips}>
            {groups[key].map(code => (
              <Chip key={code} compact icon={() => <SkillIcon skill={code} size={16} />}>
                {skillLabel(registry as any, code)} <SkillEvidenceIcon state={skillEvidenceState(verification, code)} />
              </Chip>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 10 },
  row: { gap: 6 },
  title: { fontSize: 13, fontWeight: '800', color: '#06214A' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
