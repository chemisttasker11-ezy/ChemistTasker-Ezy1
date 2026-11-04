import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import {
  scriptVolumeBand,
  skillLabel,
  supportSummary,
  workloadTags,
  type PharmacySummary,
  type SupportEntry,
} from '@chemisttasker/shared-core';
import { Pill } from '@/components/ui';
import { colors, font, space, type } from '@/constants/tokens';
import { SkillIcon } from '../../../components/SkillIcon';

const cleanRange = (val?: string | null) => (val ? val.replace(/[\u2013\u2014]/g, '-') : '');

export function PharmacyContextDetails({
  pharmacy,
  workload = [],
  support = [],
}: {
  pharmacy?: PharmacySummary | null;
  workload?: string[];
  support?: SupportEntry[];
}) {
  const reg = registry as any;
  const weekday = scriptVolumeBand(reg, pharmacy?.scriptVolumeWeekday);
  const weekend = scriptVolumeBand(reg, pharmacy?.scriptVolumeWeekend);
  const workingWith = supportSummary(reg, support);
  const tags = workloadTags(reg, workload);
  const services = pharmacy?.services || [];
  if (!weekday && !weekend && !workingWith && !tags.length && !services.length) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pharmacy services</Text>
      <View style={styles.pillRow}>
        {weekday ? <Pill label={`Weekdays: ${weekday.label} · ${cleanRange(weekday.range)}`} outlined /> : null}
        {weekend ? <Pill label={`Weekends: ${weekend.label} · ${cleanRange(weekend.range)}`} outlined /> : null}
        {workingWith ? <Pill label={`Working with ${workingWith}`} outlined /> : null}
        {tags.map((tag) => (
          <Pill key={tag.code} label={tag.label} tone="neutral" />
        ))}
        {services.map((code) => (
          <Pill key={code} label={skillLabel(reg, code)} icon={<SkillIcon skill={code} />} outlined />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.xs },
  title: {
    fontFamily: font.inter.semiBold,
    fontSize: type.labelLarge.fontSize,
    lineHeight: type.labelLarge.lineHeight,
    color: colors.textPrimary,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
