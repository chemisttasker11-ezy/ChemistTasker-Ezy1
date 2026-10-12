import { useState } from 'react';
import { Box, Button, ButtonBase, Chip, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Check, Minus, Plus } from 'lucide-react';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import { pharmacyServiceCodes, scriptVolumeBands, skillLabel, supportRoles, setSupportCount, workloadTagOptions, type SupportEntry } from '@chemisttasker/shared-core';
import { SkillGlyph, SkillSymbol } from './SkillGlyph';

const reg = registry as any;

export function PharmacyProfileFields({ services, weekday, weekend, onServicesChange, onWeekdayChange, onWeekendChange }: {
  services: string[]; weekday: string; weekend: string;
  onServicesChange: (value: string[]) => void; onWeekdayChange: (value: string) => void; onWeekendChange: (value: string) => void;
}) {
  return <Stack spacing={2}>
    <Typography variant="h6">Services and typical script volume</Typography>
    <Typography variant="body2" color="text.secondary">Choose services offered at this pharmacy. Script volumes describe the whole pharmacy on a typical day.</Typography>
    <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
      {pharmacyServiceCodes(reg).map(code => <Chip key={code} label={skillLabel(reg, code)} icon={<SkillSymbol skill={code} size={18} />}
        role="checkbox" aria-checked={services.includes(code)} variant={services.includes(code) ? 'filled' : 'outlined'}
        onClick={() => onServicesChange(services.includes(code) ? services.filter(item => item !== code) : [...services, code])} />)}
    </Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
      {[{ label: 'Weekday script volume', value: weekday, change: onWeekdayChange }, { label: 'Weekend script volume', value: weekend, change: onWeekendChange }].map(field =>
        <TextField key={field.label} select fullWidth size="small" label={field.label} value={field.value} onChange={event => field.change(event.target.value)}>
          <MenuItem value="">Not specified</MenuItem>
          {scriptVolumeBands(reg).map(band => <MenuItem key={band.code} value={band.code}>{band.label} · {band.range}</MenuItem>)}
        </TextField>)}
    </Box>
  </Stack>;
}

const COMMON_SUPPORT = ['PHARMACIST', 'TECHNICIAN', 'DISPENSARY_ASSISTANT', 'ASSISTANT'];

/** Post-shift workload (symbol tiles with explainers) and staff working alongside (steppers; rarer roles behind "More"). */
export function ShiftContextFields({ workload, support, onWorkloadChange, onSupportChange }: {
  workload: string[]; support: SupportEntry[]; onWorkloadChange: (value: string[]) => void; onSupportChange: (value: SupportEntry[]) => void;
}) {
  const [moreRoles, setMoreRoles] = useState(false);
  const max = reg.pharmacy_profile?.support_count_max ?? 20;
  const roles = supportRoles(reg);
  const shown = roles.filter(role => moreRoles || COMMON_SUPPORT.includes(role.code) || support.some(entry => entry.role === role.code));
  const countOf = (code: string) => support.find(entry => entry.role === code)?.count ?? 0;
  const step = (code: string, next: number) => onSupportChange(setSupportCount(reg, support, code, next > 0 ? String(next) : ''));

  return <Stack spacing={3}>
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Workload</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
        {workloadTagOptions(reg).filter(tag => !tag.legacy || workload.includes(tag.code)).map(tag => {
          const on = workload.includes(tag.code);
          return <ButtonBase key={tag.code} role="checkbox" aria-checked={on}
            onClick={() => onWorkloadChange(on ? workload.filter(code => code !== tag.code) : [...workload, tag.code])}
            sx={{
              justifyContent: 'flex-start', alignItems: 'flex-start', textAlign: 'left', gap: 1.25, p: 1.25, borderRadius: '12px',
              border: '1px solid', borderColor: on ? 'primary.main' : 'divider', bgcolor: on ? 'action.selected' : 'transparent',
              '&:hover': { borderColor: 'primary.main' }, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            }}>
            <SkillGlyph name={tag.icon_web} title={tag.label} size={24} tone="blue" decorative />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{tag.label}</Typography>
              <Typography variant="body2" color="text.secondary">{tag.explainer}</Typography>
            </Box>
            {on ? <Check size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
          </ButtonBase>;
        })}
      </Box>
    </Box>
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>Working alongside them</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Other staff on the same shift. Leave at 0 if none or unknown.</Typography>
      <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
        {shown.map(role => {
          const count = countOf(role.code);
          return <Stack key={role.code} direction="row" alignItems="center" spacing={1} sx={{ minHeight: 52 }}>
            <Typography id={`support-${role.code}`} sx={{ flex: 1, fontSize: 14.5 }}>{role.label}</Typography>
            <IconButton aria-label={`One fewer ${role.one}`} disabled={count === 0} onClick={() => step(role.code, count - 1)}
              sx={{ width: 40, height: 40, border: '1px solid', borderColor: 'divider' }}><Minus size={18} /></IconButton>
            <Typography aria-live="polite" aria-labelledby={`support-${role.code}`} sx={{ width: 28, textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{count}</Typography>
            <IconButton aria-label={`One more ${role.one}`} disabled={count >= max} onClick={() => step(role.code, count + 1)}
              sx={{ width: 40, height: 40, border: '1px solid', borderColor: 'divider' }}><Plus size={18} /></IconButton>
          </Stack>;
        })}
      </Stack>
      {shown.length < roles.length && (
        <Button size="small" onClick={() => setMoreRoles(true)} sx={{ mt: 0.5, textTransform: 'none', fontWeight: 600, minHeight: 36 }}>
          More roles
        </Button>
      )}
    </Box>
  </Stack>;
}
