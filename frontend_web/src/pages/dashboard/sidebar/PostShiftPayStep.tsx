import type { Dispatch, SetStateAction } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import InfoIcon from '@mui/icons-material/InfoOutlined';
import dayjs from 'dayjs';
import {
  GOVERNMENT_AWARD_GUIDE_URL,
  RATE_TYPE_DESCRIPTIONS,
  formatSlotTime,
  getSlotDurationHours,
} from './PostShiftPage.helpers';

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
  isDarkMode,
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
  const fieldSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      bgcolor: isDarkMode ? 'rgba(15, 23, 42, 0.78)' : 'background.paper',
    },
  };

        const showSlotPreview = isLocumLike && !(roleNeeded === 'PHARMACIST' && rateType === 'PHARMACIST_PROVIDED');
        const hasOutsidePharmacyMemberAudience =
          !isEmbedded && (visibility !== 'FULL_PART_TIME' || Object.values(escalationDates).some(Boolean));
        const baseRatesOptionalLabel = hasOutsidePharmacyMemberAudience ? '' : ' (optional)';
        const paymentField = isLocumLike ? (
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth size="small" sx={fieldSx}>
              <InputLabel>Payment Type</InputLabel>
              <Select
                value={paymentPreference}
                label="Payment Type"
                onChange={e => setPaymentPreference(e.target.value)}
              >
                <MenuItem value="ABN">ABN</MenuItem>
                <MenuItem value="TFN">TFN</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        ) : null;
        const superCheckbox = isLocumLike ? (
          <FormControlLabel
            control={(
              <Checkbox
                checked={locumSuperIncluded}
                onChange={(_, checked) => setLocumSuperIncluded(checked)}
              />
            )}
            label="+ superannuation "
          />
        ) : null;

        if (!isLocumLike) {
          return (
            <Stack spacing={3}>
              <Grid container rowSpacing={3} columnSpacing={{ xs: 0, md: 3 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth size="small" sx={fieldSx}>
                    <InputLabel>Pay Basis</InputLabel>
                    <Select
                      value={ftptPayMode}
                      label="Pay Basis"
                      onChange={e => setFtptPayMode(e.target.value as 'HOURLY' | 'ANNUAL')}
                    >
                      <MenuItem value="HOURLY">Hourly</MenuItem>
                      <MenuItem value="ANNUAL">Annual Package</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              {ftptPayMode === 'HOURLY' ? (
                <Grid container rowSpacing={3} columnSpacing={{ xs: 0, md: 3 }}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Min Hourly Rate ($/hr)"
                      type="number"
                      value={minHourly}
                      onChange={e => setMinHourly(e.target.value)}
                      fullWidth
                      size="small"
                      sx={fieldSx}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Max Hourly Rate ($/hr)"
                      type="number"
                      value={maxHourly}
                      onChange={e => setMaxHourly(e.target.value)}
                      fullWidth
                      size="small"
                      sx={fieldSx}
                    />
                  </Grid>
                </Grid>
              ) : (
                <Grid container rowSpacing={3} columnSpacing={{ xs: 0, md: 3 }}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Min Annual Package ($)"
                      type="number"
                      value={minAnnual}
                      onChange={e => setMinAnnual(e.target.value)}
                      fullWidth
                      size="small"
                      sx={fieldSx}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Max Annual Package ($)"
                      type="number"
                      value={maxAnnual}
                      onChange={e => setMaxAnnual(e.target.value)}
                      fullWidth
                      size="small"
                      sx={fieldSx}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Super (%)"
                      type="number"
                      value={superPercent}
                      onChange={e => setSuperPercent(e.target.value)}
                      fullWidth
                      size="small"
                      sx={fieldSx}
                    />
                  </Grid>
                </Grid>
              )}
            </Stack>
          );
        }

        const renderSlotPreviewList = () => {
          if (!showSlotPreview || expandedSlots.length === 0) return null;
          return (
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, borderColor: 'grey.200' }}>
              <Stack spacing={1.5}>
                <Typography variant="subtitle1" fontWeight={600}>
                  Slot rate preview
                </Typography>
                <Stack spacing={1}>
                  {expandedSlots.map((slot, idx) => {
                    const row = slotRateRows[idx] ?? { rate: '', status: 'idle' as const };
                    const baseNum = Number(row.rate);
                    const rateValid = Number.isFinite(baseNum);
                    const bonusNum = Number(ownerBonus);
                    const bonusValid = Number.isFinite(bonusNum);
                    const finalNum = roleNeeded === 'PHARMACIST'
                      ? (rateValid ? baseNum : null)
                      : (rateValid ? baseNum : 0) + (bonusValid ? bonusNum : 0);
                    const durationHours = getSlotDurationHours(slot.startTime, slot.endTime);
                    const totalNum =
                      finalNum != null && Number.isFinite(finalNum) && durationHours > 0
                        ? finalNum * durationHours
                        : null;
                    const totalLabel =
                      totalNum != null && Number.isFinite(totalNum)
                        ? `$${totalNum.toFixed(2)}`
                        : '$0.00';
                    return (
                      <Box
                        key={`${slot.date}-${slot.startTime}-${idx}`}
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) 132px auto' },
                          gap: 1.5,
                          alignItems: 'center',
                          p: 1.5,
                          border: '1px solid',
                          borderColor: 'grey.200',
                          borderRadius: 2.5,
                          bgcolor: 'background.paper',
                          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle2" fontWeight={700} color="text.primary">
                            {dayjs(slot.date).format('dddd, D MMMM')}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {`${formatSlotTime(slot.startTime)} - ${formatSlotTime(slot.endTime)}`}
                          </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ minWidth: 180, display: 'none' }}>
                          {`${slot.date} · ${slot.startTime}—${slot.endTime}`}
                        </Typography>
                        <TextField
                          label="Rate"
                          type="number"
                          value={row.rate}
                          onChange={(e) => handleSlotRateChange(idx, e.target.value)}
                          size="small"
                          sx={{ width: { xs: '100%', sm: 132 }, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                          InputProps={{
                            startAdornment: <Typography sx={{ mr: 0.5, color: 'text.secondary' }}>$</Typography>,
                            endAdornment: <Typography sx={{ ml: 0.5, color: 'text.secondary' }}>/hr</Typography>,
                          }}
                          error={row.status === 'error'}
                          helperText={row.status === 'error' ? (row.error || 'Error') : ''}
                        />
                        <Chip
                          label={row.status === 'loading' ? 'Calculating...' : totalLabel}
                          color={row.status === 'loading' ? 'default' : 'success'}
                          size="small"
                          sx={{ justifySelf: { xs: 'start', sm: 'end' }, fontWeight: 800 }}
                        />
                      </Box>
                    );
                  })}
                </Stack>
              </Stack>
            </Paper>
          );
        };

        if (roleNeeded === 'PHARMACIST') {
          return (
            <Stack spacing={3}>
              <Grid container rowSpacing={3} columnSpacing={{ xs: 0, md: 3 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth size="small" sx={fieldSx}>
                    <InputLabel>Rate Type</InputLabel>
                    <Select
                      value={rateType}
                      label="Rate Type"
                      onChange={e => setRateType(e.target.value)}
                    >
                      <MenuItem value="FLEXIBLE">Flexible Rate</MenuItem>
                      <MenuItem value="FIXED">Fixed Rate</MenuItem>
                      <MenuItem value="PHARMACIST_PROVIDED">Pharmacist Provided</MenuItem>
                    </Select>
                  </FormControl>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {RATE_TYPE_DESCRIPTIONS[rateType] || ''}
                  </Typography>
                </Grid>
                {paymentField}
                {superCheckbox && (
                  <Grid size={{ xs: 12 }}>
                    {superCheckbox}
                  </Grid>
                )}
              </Grid>

              {rateType !== 'PHARMACIST_PROVIDED' && (
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, borderColor: 'grey.200' }}>
                  <Stack spacing={2}>
                    <Typography variant="subtitle1" fontWeight={600}>
                      Base rates ($/hr){baseRatesOptionalLabel}
                    </Typography>
                    {!hasOutsidePharmacyMemberAudience && (
                      <Typography variant="body2" color="text.secondary">
                        These pay rates will be displayed whenever the shift is visible outside Pharmacy Members.
                      </Typography>
                    )}
                    <Grid container rowSpacing={2} columnSpacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Weekday"
                          type="number"
                          value={rateWeekday}
                          onChange={e => setRateWeekday(e.target.value)}
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Saturday"
                          type="number"
                          value={rateSaturday}
                          onChange={e => setRateSaturday(e.target.value)}
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Sunday"
                          type="number"
                          value={rateSunday}
                          onChange={e => setRateSunday(e.target.value)}
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Public Holiday"
                          type="number"
                          value={ratePublicHoliday}
                          onChange={e => setRatePublicHoliday(e.target.value)}
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Early Morning"
                          type="number"
                          value={rateEarlyMorning}
                          onChange={e => setRateEarlyMorning(e.target.value)}
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Late Night"
                          type="number"
                          value={rateLateNight}
                          onChange={e => setRateLateNight(e.target.value)}
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      </Grid>
                    </Grid>
                    <Box>
                      <Button
                        variant="outlined"
                        onClick={handleSavePharmacyRateDefaults}
                        disabled={savingPharmacyRates || !pharmacyId}
                      >
                        {savingPharmacyRates ? 'Updating defaults...' : 'Update Pharmacy Default Rates'}
                      </Button>
                    </Box>
                  </Stack>
                </Paper>
              )}

              {renderSlotPreviewList()}
            </Stack>
          );
        }

        return (
          <Stack spacing={3}>
            <Typography
              variant="body1"
              align="center"
              sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1 }}
            >
              <Box component="span">
                Rate is set by government award
                <br />
                published 6 February 2026
              </Box>
              <Tooltip title="View pay guide">
                <IconButton
                  size="small"
                  href={GOVERNMENT_AWARD_GUIDE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <InfoIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Typography>
            {paymentField}
            {superCheckbox}
            <TextField
              label="Owner Bonus ($/hr, optional)"
              type="number"
              value={ownerBonus}
              onChange={e => setOwnerBonus(e.target.value)}
              fullWidth
              helperText="This bonus is added to the award rate."
              size="small"
              sx={fieldSx}
            />
            {renderSlotPreviewList()}
          </Stack>
        );
}
