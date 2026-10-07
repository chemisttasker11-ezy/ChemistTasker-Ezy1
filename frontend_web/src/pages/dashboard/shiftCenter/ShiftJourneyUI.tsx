import type { ReactNode } from 'react';
import { Alert, Box, Button, Chip, InputAdornment, MenuItem, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { SearchRounded } from '@mui/icons-material';
import { Link, useLocation } from 'react-router-dom';
import { getShiftAudience, getShiftJourneyStatus, SHIFT_ESCALATION_STAGES, type Shift } from '@chemisttasker/shared-core';

export function ShiftSectionHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  const { pathname } = useLocation();
  return <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" sx={{ mb: 3 }}>
    <Box>
      <Typography component={pathname.includes('/shift-center') ? 'h2' : 'h1'} variant="h5" fontWeight={700}>{title}</Typography>
      <Typography color="text.secondary" variant="body2" sx={{ mt: 0.75, maxWidth: 720 }}>{description}</Typography>
    </Box>
    {action}
  </Stack>;
}

export function ShiftListToolbar({ search, onSearch, count, total, audience, onAudience }: {
  search: string; onSearch: (value: string) => void; count: number; total: number;
  audience?: string; onAudience?: (value: string) => void;
}) {
  return <Box sx={{ mb: 2.5 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
      <TextField label="Search shifts" placeholder="Pharmacy, role, date or shift number" value={search}
        onChange={(event) => onSearch(event.target.value)} size="small" fullWidth
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded /></InputAdornment> } }} />
      {onAudience && <TextField select label="Audience" value={audience ?? 'all'} onChange={(event) => onAudience(event.target.value)}
        size="small" sx={{ minWidth: { sm: 210 } }}>
        <MenuItem value="all">All audiences</MenuItem><MenuItem value="direct">Direct / private</MenuItem>
        {SHIFT_ESCALATION_STAGES.map((stage) => <MenuItem key={stage.key} value={stage.key}>{stage.level}. {stage.label}</MenuItem>)}
      </TextField>}
    </Stack>
    <Typography role="status" variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
      {count === total ? `${total} post${total === 1 ? '' : 's'}` : `${count} of ${total} posts`}
    </Typography>
  </Box>;
}

export function ShiftStatusChip({ status }: { status: ReturnType<typeof getShiftJourneyStatus> }) {
  return <Chip size="small" color={status.tone} variant="outlined" label={status.label} sx={{ fontWeight: 600 }} />;
}

export function ShiftAudienceChip({ shift, dedicated = false }: { shift: Shift; dedicated?: boolean }) {
  const audience = getShiftAudience(shift.visibility);
  return <Chip size="small" variant="outlined" label={dedicated ? 'Direct / private' : audience ? `Level ${audience.level} · ${audience.label}` : 'Audience unavailable'}
    sx={{ color: 'text.primary', borderColor: 'divider', '& .MuiChip-label': { whiteSpace: 'normal' }, height: 'auto', minHeight: 28 }} />;
}

export function ShiftListLoading() {
  return <Stack spacing={2} role="status" aria-label="Loading shifts">
    {[0, 1, 2].map((key) => <Box key={key} sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <Skeleton width="60%" height={34} /><Skeleton width="40%" /><Skeleton height={52} />
    </Box>)}
  </Stack>;
}

export function ShiftLoadError({ onRetry }: { onRetry: () => void }) {
  return <Alert severity="error" action={<Button color="inherit" onClick={onRetry}>Try again</Button>} sx={{ mb: 2 }}>
    Shifts could not be loaded. Try again to see the latest activity.
  </Alert>;
}

export function ShiftEmptyState({ filtered = false, onReset, title, description, actionPath, actionLabel }: {
  filtered?: boolean; onReset?: () => void; title: string; description: string; actionPath?: string; actionLabel?: string;
}) {
  return <Box sx={{ py: 5, px: 2, textAlign: 'center' }}>
    <Typography variant="h6" fontWeight={600}>{filtered ? 'No matching shifts' : title}</Typography>
    <Typography color="text.secondary" sx={{ mt: 1, mb: 2, maxWidth: 480, mx: 'auto' }}>
      {filtered ? 'Try a different pharmacy, role, date or audience.' : description}
    </Typography>
    {filtered && onReset ? <Button variant="outlined" onClick={onReset}>Clear filters</Button> : actionPath &&
      <Button variant="outlined" component={Link} to={actionPath}>{actionLabel}</Button>}
  </Box>;
}
