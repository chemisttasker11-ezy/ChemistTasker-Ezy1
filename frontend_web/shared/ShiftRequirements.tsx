import { Chip, Stack, Typography } from '@mui/material';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import { skillLabel, shiftRequirementGroups } from '@chemisttasker/shared-core';
import { SkillSymbol } from './SkillGlyph';
import { SkillSymbolButton } from './SkillSymbolButton';

const reg = registry as any;
export function ShiftRequirementHeading({ title }: { title: 'Required' | 'Preferred' | 'Software' }) {
  return <Typography component="span" sx={{ fontFamily: 'Inter, sans-serif', color: title === 'Preferred' ? 'text.secondary' : 'text.primary', fontWeight: 800, fontSize: 13 }}>{title}</Typography>;
}

/** Compact card row: skill symbols by Required / Preferred, then software marks; each explains itself on hover, focus or tap. */
export function ShiftRequirementSummary({ mustHave, niceToHave }: { mustHave?: readonly string[]; niceToHave?: readonly string[] }) {
  const { requiredSkills, preferredSkills, software } = shiftRequirementGroups(reg, mustHave, niceToHave);
  if (!requiredSkills.length && !preferredSkills.length && !software.length) return null;
  const row = (title: 'Required' | 'Preferred' | 'Software', items: { code: string; required: boolean }[]) => items.length > 0 && (
    <Stack key={title} direction="row" spacing={1.25} alignItems="center">
      <Stack sx={{ minWidth: 76 }}><ShiftRequirementHeading title={title} /></Stack>
      <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.75}>
        {items.map(item => <SkillSymbolButton key={item.code} skill={item.code} emphasis={item.required ? 'required' : 'preferred'} />)}
      </Stack>
    </Stack>
  );
  return (
    <Stack spacing={1} sx={{ mt: 1.6, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
      {row('Required', requiredSkills.map(code => ({ code, required: true })))}
      {row('Preferred', preferredSkills.map(code => ({ code, required: false })))}
      {row('Software', software)}
    </Stack>
  );
}

/** Detail view: symbol + name chips for skills, and a separate software list with vendor marks. */
export function ShiftRequirementDetails({ mustHave, niceToHave }: { mustHave?: readonly string[]; niceToHave?: readonly string[] }) {
  const { requiredSkills, preferredSkills, software } = shiftRequirementGroups(reg, mustHave, niceToHave);
  const block = (title: 'Required' | 'Preferred' | 'Software', chips: React.ReactNode[]) => chips.length > 0 && (
    <Stack spacing={0.5} key={title}>
      <ShiftRequirementHeading title={title} />
      <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.5}>{chips}</Stack>
    </Stack>
  );
  return <>
    {block('Required', requiredSkills.map(code => <Chip key={code} icon={<SkillSymbol skill={code} size={18} />} label={skillLabel(reg, code)} size="small" />))}
    {block('Preferred', preferredSkills.map(code => <Chip key={code} icon={<SkillSymbol skill={code} size={18} />} label={skillLabel(reg, code)} size="small" variant="outlined" />))}
    {block('Software', software.map(item => <Chip key={item.code} icon={<SkillSymbol skill={item.code} size={18} />}
      label={`${skillLabel(reg, item.code)} · ${item.required ? 'required' : 'preferred'}`} size="small" variant={item.required ? 'filled' : 'outlined'} />))}
  </>;
}
