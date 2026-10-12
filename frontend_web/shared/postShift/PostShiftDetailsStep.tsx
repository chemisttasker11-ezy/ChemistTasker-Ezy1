import type { SupportEntry } from '@chemisttasker/shared-core';
import { ShiftContextFields } from '../PharmacyProfileFields';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Box, Button, ButtonBase, MenuItem, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { BedDouble, Car, Siren } from 'lucide-react';
import { RoleTile } from '../RoleTile';
import type { PharmacyOption, ShiftDescriptionTemplate } from './helpers';

type Setter<T> = Dispatch<SetStateAction<T>>;

type Props = {
  isDarkMode: boolean;
  isEmbedded: boolean;
  pharmacies: PharmacyOption[];
  pharmacyId: number | '';
  setPharmacyId: Setter<number | ''>;
  scopedPharmacyId: number | null;
  roleNeeded: string;
  setRoleNeeded: Setter<string>;
  employmentType: string;
  setEmploymentType: Setter<string>;
  descriptionTemplateLoading: boolean;
  descriptionTemplate: ShiftDescriptionTemplate | null;
  descriptionTemplateSaving: boolean;
  handleUseDescriptionTemplate: () => void;
  handleSaveDescriptionTemplate: () => void | Promise<void>;
  description: string;
  setDescription: Setter<string>;
  hasTravel: boolean;
  setHasTravel: Setter<boolean>;
  hasAccommodation: boolean;
  setHasAccommodation: Setter<boolean>;
  isUrgent: boolean;
  setIsUrgent: Setter<boolean>;
  workloadTags: string[];
  setWorkloadTags: Setter<string[]>;
  supportOnShift: SupportEntry[];
  setSupportOnShift: Setter<SupportEntry[]>;
};

const ROLES = [
  { value: 'PHARMACIST', label: 'Pharmacist' },
  { value: 'INTERN', label: 'Intern pharmacist' },
  { value: 'TECHNICIAN', label: 'Dispensary technician' },
  { value: 'ASSISTANT', label: 'Assistant' },
  { value: 'STUDENT', label: 'Pharmacy student' },
  { value: 'EXPLORER', label: 'Explorer' },
];

export const sectionTitleSx = { fontSize: 16, fontWeight: 700, color: 'text.primary' } as const;

export function StepSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Box component="section" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: '16px', p: { xs: 2, sm: 2.5 }, bgcolor: 'background.paper' }}>
      <Typography component="h3" sx={sectionTitleSx}>{title}</Typography>
      {hint && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{hint}</Typography>}
      <Box sx={{ mt: 2 }}>{children}</Box>
    </Box>
  );
}

/** Details: who you need first, then what the shift involves, then extras. */
export default function PostShiftDetailsStep({
  pharmacies, pharmacyId, setPharmacyId, scopedPharmacyId, roleNeeded, setRoleNeeded, employmentType, setEmploymentType,
  descriptionTemplateLoading, descriptionTemplate, descriptionTemplateSaving, handleUseDescriptionTemplate,
  handleSaveDescriptionTemplate, description, setDescription, hasTravel, setHasTravel, hasAccommodation,
  setHasAccommodation, isUrgent, setIsUrgent, workloadTags, setWorkloadTags, supportOnShift, setSupportOnShift,
}: Props) {
  const pharmacyName = pharmacies.find(pharmacy => pharmacy.id === pharmacyId)?.name;
  const singlePharmacy = scopedPharmacyId != null || pharmacies.length === 1;
  const extras = [
    { key: 'travel', label: 'Travel allowance', hint: 'You cover travel costs.', icon: <Car size={20} />, on: hasTravel, set: setHasTravel },
    { key: 'stay', label: 'Accommodation provided', hint: 'You arrange somewhere to stay.', icon: <BedDouble size={20} />, on: hasAccommodation, set: setHasAccommodation },
  ];

  return (
    <Stack spacing={2.5}>
      <StepSection title="Who do you need?">
        <Stack spacing={2.5}>
          {singlePharmacy ? (
            <Typography variant="body2" color="text.secondary">
              Pharmacy: <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>{pharmacyName || 'Loading…'}</Box>
            </Typography>
          ) : (
            <TextField select fullWidth size="small" label="Pharmacy" required value={pharmacyId}
              onChange={event => setPharmacyId(Number(event.target.value))}>
              {pharmacies.map(pharmacy => <MenuItem key={pharmacy.id} value={pharmacy.id}>{pharmacy.name}</MenuItem>)}
            </TextField>
          )}

          <Box role="radiogroup" aria-label="Role needed"
            sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1 }}>
            {ROLES.map(role => {
              const on = roleNeeded === role.value;
              return (
                <ButtonBase key={role.value} role="radio" aria-checked={on} onClick={() => setRoleNeeded(role.value)}
                  sx={{
                    justifyContent: 'flex-start', gap: 1.25, p: 1.25, minHeight: 60, borderRadius: '14px', textAlign: 'left',
                    border: '1.5px solid', borderColor: on ? 'primary.main' : 'divider', bgcolor: on ? 'action.selected' : 'transparent',
                    transition: 'border-color 160ms ease, background-color 160ms ease',
                    '&:hover': { borderColor: 'primary.main' },
                    '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                  }}>
                  <RoleTile role={role.label} size={36} />
                  <Typography sx={{ fontSize: 14.5, fontWeight: on ? 700 : 500, lineHeight: 1.25 }}>{role.label}</Typography>
                </ButtonBase>
              );
            })}
          </Box>

          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>Type of work</Typography>
            <ToggleButtonGroup exclusive value={employmentType} onChange={(_, next) => next && setEmploymentType(next)}
              aria-label="Type of work" sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 600, minHeight: 44, px: 2 } }}>
              <ToggleButton value="LOCUM">{roleNeeded === 'PHARMACIST' ? 'Locum' : 'Casual'}</ToggleButton>
              <ToggleButton value="PART_TIME">Part-time</ToggleButton>
              <ToggleButton value="FULL_TIME">Full-time</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Stack>
      </StepSection>

      <StepSection title="About the shift" hint="What should the person know before they apply?">
        <TextField multiline minRows={4} fullWidth value={description} onChange={event => setDescription(event.target.value)}
          label="Description" placeholder="For example: busy community pharmacy, two dispensary technicians, Webster packs on Tuesdays." />
        <Stack direction="row" useFlexGap flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
          {descriptionTemplate?.description && (
            <Button size="small" onClick={handleUseDescriptionTemplate} sx={{ textTransform: 'none', fontWeight: 600, minHeight: 36 }}>
              Use saved description
            </Button>
          )}
          <Button size="small" onClick={handleSaveDescriptionTemplate}
            disabled={descriptionTemplateLoading || descriptionTemplateSaving || !pharmacyId || !roleNeeded || !description.trim()}
            sx={{ textTransform: 'none', fontWeight: 600, minHeight: 36 }}>
            {descriptionTemplateSaving ? 'Saving…' : 'Save for future shifts'}
          </Button>
        </Stack>
      </StepSection>

      <StepSection title="On the day" hint="Optional. Helps people judge the workload before they apply.">
        <ShiftContextFields workload={workloadTags} support={supportOnShift}
          onWorkloadChange={setWorkloadTags} onSupportChange={setSupportOnShift} />
      </StepSection>

      <StepSection title="Extras">
        <Stack spacing={1}>
          {extras.map(extra => (
            <Stack key={extra.key} component="label" direction="row" alignItems="center" spacing={1.5}
              sx={{ minHeight: 52, px: 1.5, borderRadius: '12px', cursor: 'pointer', bgcolor: extra.on ? 'action.selected' : 'transparent' }}>
              <Box sx={{ color: 'text.secondary', display: 'flex' }}>{extra.icon}</Box>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>{extra.label}</Typography>
                <Typography variant="body2" color="text.secondary">{extra.hint}</Typography>
              </Box>
              <Switch checked={extra.on} onChange={(_, checked) => extra.set(checked)} />
            </Stack>
          ))}
          <Stack component="label" direction="row" alignItems="center" spacing={1.5}
            sx={{
              minHeight: 52, px: 1.5, borderRadius: '12px', cursor: 'pointer', border: '1px solid',
              borderColor: isUrgent ? 'var(--ct-status-red-fg, #B42318)' : 'transparent',
              bgcolor: isUrgent ? 'var(--ct-status-red-bg, #FDECEA)' : 'transparent',
            }}>
            <Box sx={{ color: isUrgent ? 'var(--ct-status-red-fg, #B42318)' : 'text.secondary', display: 'flex' }}><Siren size={20} /></Box>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>Urgent</Typography>
              <Typography variant="body2" color="text.secondary">Shows an Urgent label so the shift stands out.</Typography>
            </Box>
            <Switch checked={isUrgent} color="error" onChange={(_, checked) => setIsUrgent(checked)} />
          </Stack>
        </Stack>
      </StepSection>
    </Stack>
  );
}
