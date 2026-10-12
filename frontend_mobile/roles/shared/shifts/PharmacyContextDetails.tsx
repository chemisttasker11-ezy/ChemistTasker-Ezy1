import { View } from 'react-native';
import { Chip, Text } from 'react-native-paper';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import { scriptVolumeBand, skillLabel, supportSummary, workloadTags, type PharmacySummary, type SupportEntry } from '@chemisttasker/shared-core';
import { SkillIcon } from '../../../components/SkillIcon';

export function PharmacyContextDetails({ pharmacy, workload = [], support = [] }: {
  pharmacy?: PharmacySummary | null; workload?: string[]; support?: SupportEntry[];
}) {
  const reg = registry as any;
  const weekday = scriptVolumeBand(reg, pharmacy?.scriptVolumeWeekday);
  const weekend = scriptVolumeBand(reg, pharmacy?.scriptVolumeWeekend);
  const workingWith = supportSummary(reg, support);
  const tags = workloadTags(reg, workload);
  const services = pharmacy?.services || [];
  if (!weekday && !weekend && !workingWith && !tags.length && !services.length) return null;
  return <View style={{ gap: 8 }}>
    <Text variant="labelLarge">Pharmacy services</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {weekday && <Chip compact>{`Weekdays: ${weekday.label} · ${weekday.range}`}</Chip>}
      {weekend && <Chip compact>{`Weekends: ${weekend.label} · ${weekend.range}`}</Chip>}
      {workingWith && <Chip compact>{`Working with ${workingWith}`}</Chip>}
      {tags.map(tag => <Chip key={tag.code} compact>{tag.label}</Chip>)}
      {services.map(code => <Chip key={code} compact icon={() => <SkillIcon skill={code} />}>{skillLabel(reg, code)}</Chip>)}
    </View>
  </View>;
}
