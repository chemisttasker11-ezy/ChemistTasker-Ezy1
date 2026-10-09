import { useMemo } from 'react';
import { Box, Button, Paper, Stack, Typography, useTheme } from '@mui/material';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import moment from 'moment';
import type { OpenShift, RosterAssignment, WorkerShiftRequest } from '@chemisttasker/shared-core';

type ReviewItem = {
  id: string;
  title: string;
  detail: string;
  date: string;
  onReview: () => void;
};

type Props = {
  calendarDate: Date;
  assignments: RosterAssignment[];
  openShifts: OpenShift[];
  workerRequests: WorkerShiftRequest[];
  loading: boolean;
  onReviewLeave: (assignment: RosterAssignment) => void;
  onReviewCover: (request: WorkerShiftRequest) => void;
};

/** Planning read-model only: actions return to the existing approval dialogs. */
export default function RosterManagerOverview({
  calendarDate, assignments, openShifts, workerRequests, loading,
  onReviewLeave, onReviewCover,
}: Props) {
  const isDark = useTheme().palette.mode === 'dark';
  const start = moment(calendarDate).startOf('isoWeek').format('YYYY-MM-DD');
  const end = moment(calendarDate).endOf('isoWeek').format('YYYY-MM-DD');
  const inWeek = (day?: string | null) => Boolean(day && day >= start && day <= end);

  const summary = useMemo(() => {
    const weekAssignments = assignments.filter((row) => inWeek(row.slotDate));
    const openSlots = openShifts.flatMap((shift) => shift.slots || []).filter((slot) => inWeek(slot.date));
    const leave = weekAssignments.filter((row) => row.leaveRequest?.status === 'PENDING');
    const cover = workerRequests.filter((row) => row.status === 'PENDING' && inWeek(row.slotDate));
    const items: ReviewItem[] = [
      ...leave.map((row) => ({
        id: 'leave-' + row.id,
        title: [row.userDetail.firstName, row.userDetail.lastName].filter(Boolean).join(' ') || 'Team member',
        detail: 'Leave request awaiting review',
        date: row.slotDate,
        onReview: () => onReviewLeave(row),
      })),
      ...cover.map((row) => ({
        id: 'cover-' + row.id,
        title: row.requesterName || 'Team member',
        detail: 'Cover request awaiting review',
        date: row.slotDate,
        onReview: () => onReviewCover(row),
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    return { assigned: weekAssignments.length, open: openSlots.length, requests: items };
  }, [assignments, openShifts, workerRequests, start, end, onReviewLeave, onReviewCover]);

  const metrics = [
    { label: 'Assigned shifts', value: summary.assigned, icon: <EventAvailableOutlinedIcon />, color: isDark ? '#C8B5FF' : '#5222B8' },
    { label: 'Open shift slots', value: summary.open, icon: <EventBusyOutlinedIcon />, color: isDark ? '#F3B45C' : '#9A5A08' },
    { label: 'Requests to review', value: summary.requests.length, icon: <PendingActionsOutlinedIcon />, color: isDark ? '#76D7E5' : '#075B71' },
  ];

  return (
    <Paper component="section" aria-label="Weekly roster snapshot" variant="outlined" sx={{
      mb: 2, p: { xs: 2, md: 2.5 }, border: '1px solid var(--ct-border-color)', bgcolor: 'var(--ct-surface-bg)',
      borderRadius: '14px', boxShadow: 'none',
    }}>
      <Box sx={{ mb: 1.75 }}>
        <Typography component="h2" sx={{ color: 'var(--ct-text-primary)', fontFamily: 'var(--ct-font-display)', fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>
          Selected week at a glance
        </Typography>
        <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 13.5, mt: 0.25, lineHeight: 1.55 }}>
          {moment(calendarDate).startOf('isoWeek').format('D MMM')} – {moment(calendarDate).endOf('isoWeek').format('D MMM YYYY')}
          {' · '}Review requests before publishing changes.
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, minmax(0,1fr))' }, gap: { xs: 1, md: 1.5 } }}>
        {metrics.map((metric) => (
          <Box key={metric.label} sx={{ border: '1px solid var(--ct-border-color)', borderRadius: 2, bgcolor: 'var(--ct-elevated-bg)', p: { xs: 1.25, md: 2 }, minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Box sx={{ color: metric.color, display: 'flex', '& svg': { fontSize: { xs: 17, md: 20 } } }}>{metric.icon}</Box>
              <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: { xs: 12.5, md: 13 }, fontWeight: 700, lineHeight: 1.35 }}>
                {metric.label}
              </Typography>
            </Stack>
            <Typography aria-label={metric.label + ': ' + (loading ? 'loading' : metric.value)} sx={{
              color: 'var(--ct-text-primary)', fontSize: { xs: 26, md: 34 }, fontWeight: 700,
              fontVariantNumeric: 'tabular-nums', mt: 0.6, lineHeight: 1.2,
            }}>
              {loading ? '—' : metric.value}
            </Typography>
          </Box>
        ))}
      </Box>

      {!loading && summary.requests.length > 0 && (
        <Box sx={{ borderTop: '1px solid var(--ct-border-color)', mt: 2.25, pt: 1.75 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 0.5 }}>
            <Typography component="h3" sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 600, color: 'var(--ct-text-primary)', fontSize: 17 }}>
              Needs your decision
            </Typography>
            <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 12.5 }}>{summary.requests.length} pending</Typography>
          </Stack>
          {summary.requests.slice(0, 4).map((item) => (
            <Stack key={item.id} direction="row" alignItems="center" justifyContent="space-between" gap={1.5}
              sx={{ py: 1, borderBottom: '1px solid var(--ct-border-color)' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ color: 'var(--ct-text-primary)', fontWeight: 700, fontSize: 14, overflowWrap: 'anywhere' }}>{item.title}</Typography>
                <Typography sx={{ color: 'var(--ct-text-secondary)', fontSize: 12.5 }}>
                  {item.detail} · {moment(item.date).format('ddd D MMM')}
                </Typography>
              </Box>
              <Button onClick={item.onReview} size="small" endIcon={<ArrowForwardRoundedIcon />}
                sx={{ minHeight: 44, flexShrink: 0, fontWeight: 700, textTransform: 'none', color: isDark ? '#C8B5FF' : '#5222B8' }}>
                Review
              </Button>
            </Stack>
          ))}
          {summary.requests.length > 4 && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--ct-text-secondary)', mt: 1 }}>
              More pending requests are available on the roster calendar.
            </Typography>
          )}
        </Box>
      )}
      {!loading && summary.assigned === 0 && summary.open === 0 && summary.requests.length === 0 && (
        <Typography sx={{ mt: 1.5, fontSize: 13.5, color: 'var(--ct-text-secondary)' }}>
          Nothing scheduled in this week. Use the planner to add or copy shifts.
        </Typography>
      )}
    </Paper>
  );
}
