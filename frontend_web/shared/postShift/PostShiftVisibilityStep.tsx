import { type Dispatch, type SetStateAction } from 'react';
import { Box, ButtonBase, Chip, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import dayjs from 'dayjs';
import { type ShiftEscalationPlan } from '@chemisttasker/shared-core';
import { Check } from 'lucide-react';
import { StepSection } from './PostShiftDetailsStep';

type Setter<T> = Dispatch<SetStateAction<T>>;

type Props = {
  escalationPlan: ShiftEscalationPlan;
  setEscalationPlan: Setter<ShiftEscalationPlan>;
  isEmbedded: boolean;
  isDarkMode: boolean;
  visibility: string;
  setVisibility: Setter<string>;
  allowedVis: string[];
  canPostAnonymously: boolean;
  postAnonymously: boolean;
  setPostAnonymously: Setter<boolean>;
  showNotifyPharmacyStaff: boolean;
  showNotifyFavoriteStaff: boolean;
  showNotifyChainMembers: boolean;
  notifyPharmacyStaff: boolean;
  setNotifyPharmacyStaff: Setter<boolean>;
  notifyFavoriteStaff: boolean;
  setNotifyFavoriteStaff: Setter<boolean>;
  notifyChainMembers: boolean;
  setNotifyChainMembers: Setter<boolean>;
  escalationDates: Record<string, string>;
  setEscalationDates: Setter<Record<string, string>>;
};

/** Plain names for the audience levels, widest last. */
const AUDIENCE: Record<string, { label: string; hint: string }> = {
  FULL_PART_TIME: { label: 'Your pharmacy team', hint: 'Full-time and part-time staff at this pharmacy.' },
  LOCUM_CASUAL: { label: 'Your favourite staff', hint: 'Locums and casuals you have marked as favourites.' },
  OWNER_CHAIN: { label: 'Your other pharmacies', hint: 'Staff across the pharmacies you own.' },
  ORG_CHAIN: { label: 'Your organisation', hint: 'Everyone in your organisation.' },
  PLATFORM: { label: 'Everyone on ChemistTasker', hint: 'All matching people on the platform.' },
};
const audience = (code: string) => AUDIENCE[code] ?? { label: code, hint: '' };
const AUTO_STEPS = [12, 24, 48];
type EscalationMode = 'auto' | 'custom' | 'off';
const formatWhen = (value: string) => dayjs(value).format('ddd D MMM, h:mm A');

function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <Stack component="label" direction="row" alignItems="center" spacing={1.5}
      sx={{ minHeight: 52, px: 1.5, borderRadius: '12px', cursor: 'pointer', bgcolor: checked ? 'action.selected' : 'transparent' }}>
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>{label}</Typography>
        {hint && <Typography variant="body2" color="text.secondary">{hint}</Typography>}
      </Box>
      <Switch checked={checked} onChange={(_, value) => onChange(value)} />
    </Stack>
  );
}

/** Visibility: one radio-card list for the first audience, optional later widening, then notifications. */
export default function PostShiftVisibilityStep({
  isEmbedded, visibility, setVisibility, allowedVis, canPostAnonymously, postAnonymously, setPostAnonymously,
  escalationPlan, setEscalationPlan,
  showNotifyPharmacyStaff, showNotifyFavoriteStaff, showNotifyChainMembers, notifyPharmacyStaff, setNotifyPharmacyStaff,
  notifyFavoriteStaff, setNotifyFavoriteStaff, notifyChainMembers, setNotifyChainMembers, escalationDates, setEscalationDates,
}: Props) {
  const startIdx = allowedVis.indexOf(visibility);
  const later = !isEmbedded && startIdx > -1 ? allowedVis.slice(startIdx + 1) : [];
  const notify = [
    showNotifyPharmacyStaff && { key: 'staff', label: 'Your pharmacy team', checked: notifyPharmacyStaff, set: setNotifyPharmacyStaff },
    showNotifyFavoriteStaff && { key: 'fav', label: 'Your favourite staff', checked: notifyFavoriteStaff, set: setNotifyFavoriteStaff },
    showNotifyChainMembers && { key: 'chain', label: 'Your chain members', checked: notifyChainMembers, set: setNotifyChainMembers },
  ].filter(Boolean) as { key: string; label: string; checked: boolean; set: Setter<boolean> }[];

  const { mode, everyHours: autoHours } = escalationPlan;
  const applyAuto = (hours: number) => {
    setEscalationPlan(current => ({ ...current, everyHours: hours }));
  };
  const chooseMode = (next: EscalationMode) => {
    setEscalationPlan(current => ({ ...current, mode: next }));
    if (next === 'off') setEscalationDates({});
    if (next === 'auto') applyAuto(autoHours);
  };
  const scheduled = later.map(code => escalationDates[code]).filter(Boolean);
  const outOfOrder = scheduled.some((value, index) => index > 0 && value <= scheduled[index - 1]);

  return (
    <Stack spacing={2.5}>
      {isEmbedded ? (
        <StepSection title="Private booking" hint="Only the person you are booking sees this shift." >
          <Typography variant="body2" color="text.secondary">They get a request and can accept or decline it.</Typography>
        </StepSection>
      ) : (
        <StepSection title="Who sees it first?" hint="Start small if you like; you can open it to more people later.">
          <Stack role="radiogroup" aria-label="Who sees it first" spacing={1}>
            {allowedVis.map((code, index) => {
              const on = visibility === code;
              const { label, hint } = audience(code);
              return (
                <ButtonBase key={code} role="radio" aria-checked={on} onClick={() => setVisibility(code)}
                  sx={{
                    justifyContent: 'flex-start', textAlign: 'left', gap: 1.5, p: 1.5, minHeight: 60, borderRadius: '14px',
                    border: '1.5px solid', borderColor: on ? 'primary.main' : 'divider', bgcolor: on ? 'action.selected' : 'transparent',
                    transition: 'border-color 160ms ease, background-color 160ms ease', '&:hover': { borderColor: 'primary.main' },
                    '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                  }}>
                  <Box aria-hidden sx={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700,
                    bgcolor: on ? 'primary.main' : 'action.hover', color: on ? 'primary.contrastText' : 'text.secondary',
                  }}>{on ? <Check size={16} /> : index + 1}</Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{label}</Typography>
                    <Typography variant="body2" color="text.secondary">{hint}</Typography>
                  </Box>
                </ButtonBase>
              );
            })}
          </Stack>
        </StepSection>
      )}

      {later.length > 0 && (
        <StepSection title="Still not filled? Open it up later" hint="The audience widens one group at a time, and only while nobody has shown interest.">
          <Stack spacing={2}>
            <ToggleButtonGroup exclusive fullWidth value={mode} aria-label="How to open it up"
              onChange={(_, next: EscalationMode | null) => next && chooseMode(next)}
              sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 600, minHeight: 44 } }}>
              <ToggleButton value="auto">Automatic</ToggleButton>
              <ToggleButton value="custom">Choose times</ToggleButton>
              <ToggleButton value="off">Don't widen</ToggleButton>
            </ToggleButtonGroup>

            {mode === 'auto' && (
              <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" gap={1}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Next group every</Typography>
                {AUTO_STEPS.map(hours => (
                  <Chip key={hours} label={hours < 24 ? `${hours} hours` : hours === 24 ? '1 day' : `${hours / 24} days`}
                    color={autoHours === hours ? 'primary' : 'default'} variant={autoHours === hours ? 'filled' : 'outlined'}
                    onClick={() => applyAuto(hours)} sx={{ fontWeight: 600, minHeight: 36 }} />
                ))}
              </Stack>
            )}

            {mode !== 'off' && (
              <Box component="ol" aria-label="Who can see it, and when" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {[visibility, ...later].map((code, index, all) => {
                  const first = index === 0;
                  const when = escalationDates[code];
                  const last = index === all.length - 1;
                  return (
                    <Box component="li" key={code} sx={{ display: 'grid', gridTemplateColumns: '28px 1fr', columnGap: 1.5 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Box aria-hidden sx={{
                          width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700,
                          bgcolor: first || when ? 'primary.main' : 'action.hover', color: first || when ? 'primary.contrastText' : 'text.secondary',
                        }}>{index + 1}</Box>
                        {!last && <Box sx={{ flex: 1, width: 2, minHeight: 24, bgcolor: 'divider', my: 0.5 }} />}
                      </Box>
                      <Box sx={{ pb: last ? 0 : 2, minWidth: 0 }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }} alignItems={{ sm: 'center' }} justifyContent="space-between">
                          <Box>
                            <Typography sx={{ fontSize: 14.5, fontWeight: 700 }}>{audience(code).label}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {first ? 'As soon as you post' : when ? formatWhen(when) : 'Not scheduled'}
                            </Typography>
                          </Box>
                          {!first && mode === 'custom' && (
                            <TextField type="datetime-local" size="small" label="Opens" value={when || ''} InputLabelProps={{ shrink: true }}
                              inputProps={{ min: index > 1 ? escalationDates[all[index - 1]] || undefined : undefined }}
                              sx={{ width: { xs: '100%', sm: 230 } }}
                              onChange={event => setEscalationDates(dates => ({ ...dates, [code]: event.target.value }))} />
                          )}
                        </Stack>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
            {outOfOrder && (
              <Typography role="alert" variant="body2" sx={{ color: 'error.main', fontWeight: 600 }}>
                Each group should open after the one before it. Check the times above.
              </Typography>
            )}
          </Stack>
        </StepSection>
      )}

      {(notify.length > 0 || canPostAnonymously) && (
        <StepSection title="When it goes live">
          <Stack spacing={1}>
            {notify.map(item => (
              <SwitchRow key={item.key} label={`Email and notify ${item.label.toLowerCase()}`} checked={item.checked} onChange={item.set} />
            ))}
            {canPostAnonymously && (
              <SwitchRow label="Hide the pharmacy name" hint="Only the pharmacy suburb is shown."
                checked={postAnonymously} onChange={setPostAnonymously} />
            )}
          </Stack>
        </StepSection>
      )}
    </Stack>
  );
}
