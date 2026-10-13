import { Box, ButtonBase, Typography } from '@mui/material';
import skillsRegistry from '@chemisttasker/shared-core/skills_registry.json';
import { claimModeLabel, SOFTWARE_GROUP, roleSoftware as sharedRoleSoftware, softwareSubgroups, type SkillDefinition, type WorkerSkillRole } from '@chemisttasker/shared-core';
import { SkillSymbol } from '../../components/SkillGlyph';

export { SOFTWARE_GROUP };
const registry = skillsRegistry as any;
const SUBGROUPS = softwareSubgroups(registry);

export const roleSoftware = (role: WorkerSkillRole | null, query: string): SkillDefinition[] => sharedRoleSoftware(registry, role, query);

/** Quick logo chips for named software, separate from skill cards: no definitions, no certificates. */
export default function SoftwarePicker({ items, selected, onToggle, disabled, role }: {
  role: WorkerSkillRole | null; items: SkillDefinition[]; selected: string[]; onToggle: (code: string) => void; disabled?: boolean;
}) {
  if (!items.length) return null;
  const chosen = items.filter(item => selected.includes(item.code)).length;
  return (
    <Box component="section" aria-labelledby="software-heading" sx={{ mt: 3 }}>
      <Typography id="software-heading" variant="h6" sx={{ fontWeight: 600, mb: .5 }}>Software you have used</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {chosen ? `${chosen} selected. ` : ''}Pharmacies filter by the systems they run.
      </Typography>
      {SUBGROUPS.map(subgroup => {
        const group = items.filter(item => (item as any).subgroup === subgroup);
        if (!group.length) return null;
        return (
          <Box key={subgroup} role="group" aria-label={subgroup} sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ display: 'block', mb: 1, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              {subgroup}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {group.map(item => {
                const on = selected.includes(item.code);
                return (
                  <ButtonBase key={item.code} role="checkbox" aria-checked={on} disabled={disabled} onClick={() => onToggle(item.code)}
                    sx={{
                      minHeight: 44, px: 1.25, gap: 1, borderRadius: '12px', border: '1px solid',
                      borderColor: on ? 'var(--ct-accent-strong, #3C18A8)' : 'divider',
                      bgcolor: on ? 'var(--ct-tone-violet-bg, #EFE9FD)' : 'background.paper',
                      color: 'text.primary', fontSize: 14, fontWeight: on ? 600 : 500,
                      transition: 'border-color 160ms ease, background-color 160ms ease',
                      '&.Mui-focusVisible': { outline: '2px solid var(--ct-accent-strong, #3C18A8)', outlineOffset: 2 },
                    }}>
                    <SkillSymbol skill={item.code} size={22} />
                    <Box component="span">{item.label}{role && claimModeLabel(item.eligibility[role]) &&
                      <Typography component="span" variant="caption"> · {claimModeLabel(item.eligibility[role])}</Typography>}</Box>
                  </ButtonBase>
                );
              })}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
