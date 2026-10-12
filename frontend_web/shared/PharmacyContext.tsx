import type { ReactNode } from 'react';
import { Chip, Stack, Typography } from '@mui/material';
import { UsersRound } from 'lucide-react';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import { scriptVolumeBand, skillLabel, supportSummary, workloadTags, type ScriptVolumeBand, type SupportEntry } from '@chemisttasker/shared-core';
import { ScriptLoadSymbol, SkillGlyph, SkillSymbol } from './SkillGlyph';

const reg = registry as any;
type PharmacyLike = { services?: string[] | null; scriptVolumeWeekday?: string | null; scriptVolumeWeekend?: string | null } | null | undefined;
type Props = { pharmacy?: PharmacyLike; workload?: readonly string[]; support?: readonly SupportEntry[] };

function context({ pharmacy, workload, support }: Props) {
  const loads: { when: string; band: ScriptVolumeBand }[] = [];
  const weekday = scriptVolumeBand(reg, pharmacy?.scriptVolumeWeekday);
  const weekend = scriptVolumeBand(reg, pharmacy?.scriptVolumeWeekend);
  if (weekday) loads.push({ when: 'Weekdays', band: weekday });
  if (weekend) loads.push({ when: 'Weekends', band: weekend });
  return {
    loads,
    services: pharmacy?.services || [],
    tags: workloadTags(reg, [...(workload || [])]),
    supportText: supportSummary(reg, [...(support || [])]),
  };
}

/** Detail view of the same context, with names. */
export function PharmacyContextDetails(props: Props) {
  const { loads, services, tags, supportText } = context(props);
  if (!loads.length && !services.length && !tags.length && !supportText) return null;
  const block = (title: string, body: ReactNode) => (
    <Stack spacing={0.5} key={title}>
      <Typography variant="caption" color="text.secondary">{title}</Typography>
      <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.5}>{body}</Stack>
    </Stack>
  );
  return <Stack spacing={1}>
    <Typography sx={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 800, color: 'text.primary' }}>Pharmacy services</Typography>
    {loads.length > 0 && block('Script load', loads.map(({ when, band }) => (
      <Chip key={when} size="small" variant="outlined" icon={<ScriptLoadSymbol level={band.level} color={band.color} size={18} />} label={`${when}: ${band.label} · ${band.range}`} />
    )))}
    {supportText && block('Working with', <Chip size="small" variant="outlined" icon={<UsersRound size={16} />} label={supportText} />)}
    {tags.length > 0 && block('Workload', tags.map(tag => (
      <Chip key={tag.code} size="small" icon={<SkillGlyph name={tag.icon_web} title={tag.label} size={18} tone="blue" decorative />} label={tag.label} />
    )))}
    {services.length > 0 && block('Services offered', services.map(code => (
      <Chip key={code} size="small" variant="outlined" icon={<SkillSymbol skill={code} size={18} />} label={skillLabel(reg, code)} />
    )))}
  </Stack>;
}
