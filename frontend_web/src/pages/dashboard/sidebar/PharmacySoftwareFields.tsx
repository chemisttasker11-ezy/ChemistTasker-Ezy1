import { Box, MenuItem, TextField, Typography } from '@mui/material';
import skillsRegistry from '@chemisttasker/shared-core/skills_registry.json';
import { SOFTWARE_GROUP, pharmacySoftwareByCategory, softwareSubgroups, type SkillDefinition } from '@chemisttasker/shared-core';
import { SkillSymbol } from '../../../components/SkillGlyph';

const registry = skillsRegistry as any;
// Every pharmacy checks its state RTPM system, so Monitoring is not a pharmacy choice.
const CATEGORIES = softwareSubgroups(registry).filter(category => category !== 'Monitoring');
const options = (category: string): SkillDefinition[] =>
  (registry.skills as SkillDefinition[]).filter(skill => skill.group === SOFTWARE_GROUP && skill.subgroup === category);

/** One product per category, stored as registry IDs; shift posting uses these as default software requirements. */
export default function PharmacySoftwareFields({ value, onChange }: { value: string[]; onChange: (codes: string[]) => void }) {
  const chosen = pharmacySoftwareByCategory(registry, value);
  const set = (category: string, code: string) => {
    const next = { ...chosen, [category]: code };
    if (!code) delete next[category];
    onChange(Object.values(next));
  };
  return (
    <Box>
      <Typography variant="h6" fontWeight={800} sx={{ mb: 0.75 }}>Software this pharmacy runs</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        New shifts list these as preferred experience; you can change them per shift.
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
        {CATEGORIES.map(category => (
          <TextField key={category} select fullWidth size="small" label={category} value={chosen[category] || ''}
            onChange={event => set(category, event.target.value)}
            SelectProps={{ renderValue: code => code
              ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><SkillSymbol skill={code as string} size={20} />{registry.skills.find((s: any) => s.code === code)?.label}</Box>
              : 'Not used' }}>
            <MenuItem value="">Not used</MenuItem>
            {options(category).map(item => (
              <MenuItem key={item.code} value={item.code} sx={{ gap: 1 }}>
                <SkillSymbol skill={item.code} size={20} />{item.label}
              </MenuItem>
            ))}
          </TextField>
        ))}
      </Box>
    </Box>
  );
}
