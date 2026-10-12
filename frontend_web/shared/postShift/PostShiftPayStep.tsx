import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Box, Button, ButtonBase, InputAdornment, Link, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import dayjs from 'dayjs';
import { ExternalLink } from 'lucide-react';
import { GOVERNMENT_AWARD_GUIDE_URL, RATE_TYPE_DESCRIPTIONS, formatSlotTime, getSlotDurationHours } from './helpers';
import { StepSection } from './PostShiftDetailsStep';

type Setter<T> = Dispatch<SetStateAction<T>>;

type SlotRateRow = {
  rate: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  error?: string;
  dirty?: boolean;
};

type Props = {
  isDarkMode: boolean;
  isEmbedded: boolean;
  isLocumLike: boolean;
  roleNeeded: string;
  rateType: string;
  setRateType: Setter<string>;
  paymentPreference: string;
  setPaymentPreference: Setter<string>;
  locumSuperIncluded: boolean;
  setLocumSuperIncluded: Setter<boolean>;
  ftptPayMode: 'HOURLY' | 'ANNUAL';
  setFtptPayMode: Setter<'HOURLY' | 'ANNUAL'>;
  minHourly: string;
  setMinHourly: Setter<string>;
  maxHourly: string;
  setMaxHourly: Setter<string>;
  minAnnual: string;
  setMinAnnual: Setter<string>;
  maxAnnual: string;
  setMaxAnnual: Setter<string>;
  superPercent: string;
  setSuperPercent: Setter<string>;
  visibility: string;
  escalationDates: Record<string, string>;
  rateWeekday: string;
  setRateWeekday: Setter<string>;
  rateSaturday: string;
  setRateSaturday: Setter<string>;
  rateSunday: string;
  setRateSunday: Setter<string>;
  ratePublicHoliday: string;
  setRatePublicHoliday: Setter<string>;
  rateEarlyMorning: string;
  setRateEarlyMorning: Setter<string>;
  rateLateNight: string;
  setRateLateNight: Setter<string>;
  handleSavePharmacyRateDefaults: () => void | Promise<void>;
  savingPharmacyRates: boolean;
  pharmacyId: number | '';
  expandedSlots: Array<{ date: string; startTime: string; endTime: string }>;
  slotRateRows: SlotRateRow[];
  ownerBonus: string;
  setOwnerBonus: Setter<string>;
  handleSlotRateChange: (index: number, value: string) => void;
};

export default function PostShiftPayStep({
  isEmbedded,
  isLocumLike,
  roleNeeded,
  rateType,
  setRateType,
  paymentPreference,
  setPaymentPreference,
  locumSuperIncluded,
  setLocumSuperIncluded,
  ftptPayMode,
  setFtptPayMode,
  minHourly,
  setMinHourly,
  maxHourly,
  setMaxHourly,
  minAnnual,
  setMinAnnual,
  maxAnnual,
  setMaxAnnual,
  superPercent,
  setSuperPercent,
  visibility,
  escalationDates,
  rateWeekday,
  setRateWeekday,
  rateSaturday,
  setRateSaturday,
  rateSunday,
  setRateSunday,
  ratePublicHoliday,
  setRatePublicHoliday,
  rateEarlyMorning,
  setRateEarlyMorning,
  rateLateNight,
  setRateLateNight,
  handleSavePharmacyRateDefaults,
  savingPharmacyRates,
  pharmacyId,
  expandedSlots,
  slotRateRows,
  ownerBonus,
  setOwnerBonus,
  handleSlotRateChange,
}: Props) {

  const showSlotPreview = isLocumLike && !(roleNeeded === 'PHARMACIST' && rateType === 'PHARMACIST_PROVIDED');
  const seenOutsideTeam = !isEmbedded && (visibility !== 'FULL_PART_TIME' || Object.values(escalationDates).some(Boolean));
  const money = (label: string, value: string, set: Setter<string>, unit = '/hr', helperText?: string) => (
    <TextField label={label} type="number" value={value} onChange={event => set(event.target.value)} fullWidth size="small"
      helperText={helperText} inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }}
      InputProps={{
        startAdornment: <InputAdornment position="start">$</InputAdornment>,
        ...(unit ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } : {}),
      }} />
  );
  const choice = (value: string, set: (next: string) => void, label: string, options: { value: string; label: string }[]) => (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>{label}</Typography>
      <ToggleButtonGroup exclusive value={value} onChange={(_, next) => next && set(next)} aria-label={label}
        sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 600, minHeight: 44, px: 2 } }}>
        {options.map(option => <ToggleButton key={option.value} value={option.value}>{option.label}</ToggleButton>)}
      </ToggleButtonGroup>
    </Box>
  );
  const grid = (children: ReactNode) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>{children}</Box>
  );
  const howPaid = isLocumLike && (
    <StepSection title="How they are paid">
      <Stack spacing={2}>
        {choice(paymentPreference, setPaymentPreference, 'Paid as', [{ value: 'ABN', label: 'Contractor (ABN)' }, { value: 'TFN', label: 'Employee (TFN)' }])}
        <Stack component="label" direction="row" alignItems="center" spacing={1.5}
          sx={{ minHeight: 52, px: 1.5, borderRadius: '12px', cursor: 'pointer', bgcolor: locumSuperIncluded ? 'action.selected' : 'transparent' }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>Super paid on top</Typography>
            <Typography variant="body2" color="text.secondary">Superannuation is added to the hourly rate.</Typography>
          </Box>
          <Switch checked={locumSuperIncluded} onChange={(_, value) => setLocumSuperIncluded(value)} />
        </Stack>
      </Stack>
    </StepSection>
  );

  const perDate = showSlotPreview && expandedSlots.length > 0 && (
    <StepSection title="Rate for each date" hint="Change any date that pays differently.">
      <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
        {expandedSlots.map((slot, idx) => {
          const row = slotRateRows[idx] ?? { rate: '', status: 'idle' as const };
          const base = Number(row.rate);
          const bonus = Number(ownerBonus);
          const hourly = roleNeeded === 'PHARMACIST'
            ? (Number.isFinite(base) ? base : null)
            : (Number.isFinite(base) ? base : 0) + (Number.isFinite(bonus) ? bonus : 0);
          const hours = getSlotDurationHours(slot.startTime, slot.endTime);
          const total = hourly != null && Number.isFinite(hourly) && hours > 0 ? hourly * hours : null;
          return (
            <Box key={`${slot.date}-${slot.startTime}-${idx}`}
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr auto', sm: 'minmax(0, 1fr) 148px 110px' }, gap: 1.5, alignItems: 'center', py: 1.25 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 14.5, fontWeight: 600 }}>{dayjs(slot.date).format('ddd D MMM')}</Typography>
                <Typography variant="body2" color="text.secondary">{`${formatSlotTime(slot.startTime)} – ${formatSlotTime(slot.endTime)}`}</Typography>
              </Box>
              <TextField label="Rate" type="number" size="small" value={row.rate} onChange={event => handleSlotRateChange(idx, event.target.value)}
                error={row.status === 'error'} helperText={row.status === 'error' ? (row.error || 'Check this rate') : ''}
                inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }}
                sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, gridRow: { xs: 2, sm: 'auto' } }}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment>, endAdornment: <InputAdornment position="end">/hr</InputAdornment> }} />
              <Typography aria-live="polite" sx={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {row.status === 'loading' ? 'Working out…' : total != null ? `$${total.toFixed(2)}` : '—'}
                <Box component="span" sx={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'text.secondary' }}>for the shift</Box>
              </Typography>
            </Box>
          );
        })}
      </Stack>
    </StepSection>
  );

  if (!isLocumLike) {
    return (
      <StepSection title="Pay" hint="Shown to applicants as a range.">
        <Stack spacing={2}>
          {choice(ftptPayMode, value => setFtptPayMode(value as 'HOURLY' | 'ANNUAL'), 'Pay as', [{ value: 'HOURLY', label: 'Hourly rate' }, { value: 'ANNUAL', label: 'Annual package' }])}
          {ftptPayMode === 'HOURLY'
            ? grid(<>{money('From', minHourly, setMinHourly)}{money('Up to', maxHourly, setMaxHourly)}</>)
            : grid(<>{money('From', minAnnual, setMinAnnual, '/year')}{money('Up to', maxAnnual, setMaxAnnual, '/year')}
              <TextField label="Super" type="number" size="small" value={superPercent} onChange={event => setSuperPercent(event.target.value)}
                inputProps={{ min: 0, step: '0.1', inputMode: 'decimal' }} InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} /></>)}
        </Stack>
      </StepSection>
    );
  }

  if (roleNeeded === 'PHARMACIST') {
    const rateTypes = [
      { value: 'FLEXIBLE', label: 'Open to offers' },
      { value: 'FIXED', label: 'Fixed rate' },
      { value: 'PHARMACIST_PROVIDED', label: 'Pharmacist’s own rate' },
    ];
    return (
      <Stack spacing={2.5}>
        <StepSection title="How is the rate set?">
          <Stack role="radiogroup" aria-label="How is the rate set" spacing={1}>
            {rateTypes.map(({ value, label }) => {
              const on = rateType === value;
              return (
                <ButtonBase key={value} role="radio" aria-checked={on} onClick={() => setRateType(value)}
                  sx={{
                    display: 'block', textAlign: 'left', p: 1.5, borderRadius: '14px', border: '1.5px solid',
                    borderColor: on ? 'primary.main' : 'divider', bgcolor: on ? 'action.selected' : 'transparent',
                    '&:hover': { borderColor: 'primary.main' }, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                  }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{label}</Typography>
                  <Typography variant="body2" color="text.secondary">{RATE_TYPE_DESCRIPTIONS[value]}</Typography>
                </ButtonBase>
              );
            })}
          </Stack>
        </StepSection>

        {rateType !== 'PHARMACIST_PROVIDED' && (
          <StepSection title={seenOutsideTeam ? 'Hourly rates' : 'Hourly rates (optional)'}
            hint={seenOutsideTeam ? 'Shown on the shift for each type of day.' : 'Optional while only your pharmacy team can see this shift. They are shown once it opens to more people.'}>
            <Stack spacing={2}>
              {grid(<>
                {money('Weekday', rateWeekday, setRateWeekday)}
                {money('Saturday', rateSaturday, setRateSaturday)}
                {money('Sunday', rateSunday, setRateSunday)}
                {money('Public holiday', ratePublicHoliday, setRatePublicHoliday)}
                {money('Early morning', rateEarlyMorning, setRateEarlyMorning)}
                {money('Late night', rateLateNight, setRateLateNight)}
              </>)}
              <Box>
                <Button variant="outlined" onClick={handleSavePharmacyRateDefaults} disabled={savingPharmacyRates || !pharmacyId}
                  sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44, borderRadius: '12px' }}>
                  {savingPharmacyRates ? 'Saving…' : 'Save as this pharmacy’s usual rates'}
                </Button>
              </Box>
            </Stack>
          </StepSection>
        )}
        {howPaid}
        {perDate}
      </Stack>
    );
  }

  return (
    <Stack spacing={2.5}>
      <StepSection title="Award rate">
        <Typography variant="body2">
          The rate follows the government award (pay guide published 6 February 2026).{' '}
          <Link href={GOVERNMENT_AWARD_GUIDE_URL} target="_blank" rel="noopener noreferrer" sx={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            View the pay guide<ExternalLink size={14} aria-hidden="true" />
          </Link>
        </Typography>
        <Box sx={{ mt: 2, maxWidth: 320 }}>
          {money('Extra on top (optional)', ownerBonus, setOwnerBonus, '/hr', 'Added to the award rate for every hour.')}
        </Box>
      </StepSection>
      {howPaid}
      {perDate}
    </Stack>
  );
}
