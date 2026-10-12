import { useMemo, useState } from 'react';
import {
  Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { Check, Plus, Search, X } from 'lucide-react';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import {
  claimModeLabel, popularShiftChoices, roleSkillGroups, setRequirementLevel, skillLabel, SOFTWARE_GROUP, softwareSubgroups,
  type SkillDefinition, type WorkerSkillRole,
} from '@chemisttasker/shared-core';
import { SkillSymbol } from './SkillGlyph';

const reg = registry as any;
const ROLE_NAME: Record<string, string> = {
  PHARMACIST: 'pharmacist', INTERN: 'intern', TECHNICIAN: 'technician', ASSISTANT: 'assistant', STUDENT: 'student',
};

type Props = {
  role: string;
  required: string[];
  preferred: string[];
  onChange: (next: { required: string[]; preferred: string[] }) => void;
  /** The pharmacy's own software (registry IDs), offered first. */
  pharmacySoftware?: string[];
};

/**
 * Post-shift requirements, short by default: what is selected, popular choices for the role, software, then the full
 * catalogue behind "Browse all". Tapping a choice adds it as Preferred; Required is an explicit switch on the selection.
 */
export default function ShiftRequirementsPicker({ role, required, preferred, onChange, pharmacySoftware = [] }: Props) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [browsing, setBrowsing] = useState(false);
  const [query, setQuery] = useState('');
  const workerRole = (ROLE_NAME[role] ? role : null) as WorkerSkillRole | null;
  const groups = useMemo(() => roleSkillGroups(reg, workerRole), [workerRole]);
  const eligible = useMemo(() => new Set(groups.flatMap(group => group.items.map(item => item.code))), [groups]);
  const popular = useMemo(() => popularShiftChoices(reg, workerRole, pharmacySoftware), [workerRole, pharmacySoftware]);
  const selected = [...required, ...preferred];
  const total = eligible.size;

  const set = (code: string, level: 'required' | 'preferred' | null) => onChange(setRequirementLevel(required, preferred, code, level));
  const toggle = (code: string) => set(code, selected.includes(code) ? null : 'preferred');

  if (!workerRole) {
    return <Typography color="text.secondary">
      {role === 'EXPLORER' ? 'Explorer shifts do not list professional skills.' : 'Choose the role needed in Shift Details first; the choices here depend on it.'}
    </Typography>;
  }

  const chip = (code: string, note?: string) => {
    const on = selected.includes(code);
    return (
      <ButtonBase key={code} onClick={() => toggle(code)} aria-pressed={on}
        aria-label={`${on ? 'Remove' : 'Add'} ${skillLabel(reg, code)}`}
        sx={{
          minHeight: 44, px: 1.25, gap: 1, borderRadius: '12px', border: '1px solid', justifyContent: 'flex-start',
          borderColor: on ? 'primary.main' : 'divider', bgcolor: on ? 'action.selected' : 'background.paper',
          color: 'text.primary', fontSize: 14, fontWeight: on ? 600 : 500, textAlign: 'left',
          transition: 'border-color 160ms ease, background-color 160ms ease',
          '&:hover': { borderColor: 'primary.main' },
          '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        }}>
        <SkillSymbol skill={code} size={22} />
        <span>{skillLabel(reg, code)}</span>
        {note && <Box component="span" sx={{ fontSize: 11.5, fontWeight: 600, color: 'text.secondary' }}>{note}</Box>}
        {on ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
      </ButtonBase>
    );
  };

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (item: SkillDefinition) => words.every(word => [item.label, item.definition, ...item.aliases].join(' ').toLowerCase().includes(word));
  const subgroups = softwareSubgroups(reg);

  return (
    <Stack spacing={3}>
      {/* What the shift needs so far */}
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '16px', p: { xs: 1.5, sm: 2 }, bgcolor: 'background.paper' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: selected.length ? 1.5 : 0.5 }}>
          <Typography component="h3" sx={{ fontSize: 16, fontWeight: 700 }}>Selected for this shift</Typography>
          <Typography variant="body2" color="text.secondary">
            {required.length} required · {preferred.length} preferred
          </Typography>
        </Stack>
        {selected.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nothing yet. Most shifts list two to four. Tap a choice below to add it as preferred.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {selected.map(code => {
              const level = required.includes(code) ? 'required' : 'preferred';
              const unavailable = !eligible.has(code);
              return (
                <Stack key={code} direction="row" alignItems="center" spacing={1.25}
                  sx={{ minHeight: 48, pl: 1, pr: 0.5, borderRadius: '12px', bgcolor: level === 'required' ? 'action.selected' : 'transparent' }}>
                  <SkillSymbol skill={code} size={22} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{skillLabel(reg, code)}</Typography>
                    {unavailable && <Typography variant="caption" color="warning.main">Not available for this role; remove before saving.</Typography>}
                  </Box>
                  {!unavailable && (
                    <ToggleButtonGroup exclusive size="small" value={level} aria-label={`${skillLabel(reg, code)} level`}
                      onChange={(_, next) => next && set(code, next)}
                      sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 600, px: { xs: 1, sm: 1.5 }, minHeight: 36 } }}>
                      <ToggleButton value="required">Required</ToggleButton>
                      <ToggleButton value="preferred">Preferred</ToggleButton>
                    </ToggleButtonGroup>
                  )}
                  <IconButton aria-label={`Remove ${skillLabel(reg, code)}`} onClick={() => set(code, null)} sx={{ width: 40, height: 40 }}>
                    <X size={18} />
                  </IconButton>
                </Stack>
              );
            })}
          </Stack>
        )}
      </Box>

      <Box>
        <Typography component="h3" sx={{ fontSize: 15, fontWeight: 700, mb: 0.5 }}>Popular for {ROLE_NAME[workerRole]} shifts</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Mark Required only when someone cannot do the shift without it; required skills limit who can apply.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>{popular.skills.map(code => chip(code))}</Box>
      </Box>

      {popular.software.length > 0 && (
        <Box>
          <Typography component="h3" sx={{ fontSize: 15, fontWeight: 700, mb: 1.5 }}>Software</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {popular.software.map(code => chip(code, pharmacySoftware.includes(code) ? 'Your pharmacy' : undefined))}
          </Box>
        </Box>
      )}

      <Button variant="outlined" onClick={() => setBrowsing(true)} startIcon={<Search size={18} />}
        sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' }, minHeight: 44, borderRadius: '12px', textTransform: 'none', fontWeight: 600 }}>
        Browse all skills and software ({total})
      </Button>

      <Dialog open={browsing} onClose={() => setBrowsing(false)} fullScreen={phone} fullWidth maxWidth="md" aria-labelledby="browse-skills-title">
        <DialogTitle id="browse-skills-title" sx={{ pb: 1 }}>All skills and software</DialogTitle>
        <Box sx={{ px: 3, pb: 1.5 }}>
          <TextField autoFocus fullWidth size="small" value={query} onChange={event => setQuery(event.target.value)}
            placeholder="Search, e.g. Webster, ODT, Minfos" label="Search skills or software"
            InputProps={{ startAdornment: <InputAdornment position="start"><Search size={18} /></InputAdornment> }} />
        </Box>
        <DialogContent dividers sx={{ px: { xs: 2, sm: 3 } }}>
          {groups.map(group => {
            const items = (group.key === SOFTWARE_GROUP
              ? [...group.items].sort((a: any, b: any) => subgroups.indexOf(a.subgroup) - subgroups.indexOf(b.subgroup))
              : group.items).filter(matches);
            if (!items.length) return null;
            return (
              <Box key={group.key} sx={{ mb: 2.5 }}>
                <Typography component="h4" sx={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'text.secondary', mb: 1 }}>
                  {group.key === SOFTWARE_GROUP ? 'Software' : group.label}
                </Typography>
                <Stack spacing={0.5}>
                  {items.map(item => {
                    const on = selected.includes(item.code);
                    const mode = claimModeLabel(item.eligibility[workerRole]);
                    return (
                      <ButtonBase key={item.code} onClick={() => toggle(item.code)} aria-pressed={on}
                        sx={{ display: 'flex', justifyContent: 'flex-start', textAlign: 'left', gap: 1.5, p: 1.25, borderRadius: '12px', minHeight: 52,
                          bgcolor: on ? 'action.selected' : 'transparent', '&:hover': { bgcolor: 'action.hover' },
                          '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' } }}>
                        <SkillSymbol skill={item.code} size={24} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>{item.label}</Typography>
                          {(mode || (item.group !== SOFTWARE_GROUP && item.definition)) && (
                            <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {[mode, item.group !== SOFTWARE_GROUP ? item.definition : null].filter(Boolean).join(' · ')}
                            </Typography>
                          )}
                        </Box>
                        {on ? <Check size={20} aria-label="Selected" /> : <Plus size={20} aria-hidden="true" />}
                      </ButtonBase>
                    );
                  })}
                </Stack>
              </Box>
            );
          })}
          {groups.every(group => !group.items.some(matches)) && (
            <Typography color="text.secondary">Nothing matches “{query.trim()}”. Try a shorter word, such as Webster or Fred.</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 'auto' }}>{selected.length} selected</Typography>
          <Button variant="contained" onClick={() => setBrowsing(false)} sx={{ minHeight: 44, borderRadius: '12px', textTransform: 'none', fontWeight: 700 }}>Done</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
