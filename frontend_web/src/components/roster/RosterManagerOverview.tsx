import { useMemo } from 'react';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
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
    { label: 'Assigned shifts', value: summary.assigned, icon: <EventAvailableOutlinedIcon />, color: '#5222B8' },
    { label: 'Open shift slots', value: summary.open, icon: <EventBusyOutlinedIcon />, color: '#9A5A08' },
    { label: 'Requests to review', value: summary.requests.length, icon: <PendingActionsOutlinedIcon />, color: '#075B71' },
  ];

  return (
    <Paper component="section" aria-label="Weekly roster snapshot" variant="outlined" sx={{
      mb: 2, p: { xs: 2, md: 2.5 }, border: '1px solid #DCE4EF', bgcolor: '#FFFFFF',
      borderRadius: '14px', boxShadow: 'none',
    }}>
      <Box sx={{ mb: 1.75 }}>
        <Typography component="h2" sx={{ color: '#06123A', fontFamily: 'Outfit, sans-serif', fontSize: 20, fontWeight: 700 }}>
          This week at a glance
        </Typography>
        <Typography sx={{ color: '#445474', fontSize: 13.5, mt: 0.25 }}>
          {moment(calendarDate).startOf('isoWeek').format('D MMM')} – {moment(calendarDate).endOf('isoWeek').format('D MMM YYYY')}
          {' · '}Review requests before publishing changes.
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, minmax(0,1fr))' }, gap: { xs: 1, md: 1.5 } }}>
        {metrics.map((metric) => (
          <Box key={metric.label} sx={{ border: '1px solid #E3E9F2', borderRadius: 2, bgcolor: '#FAFBFE', p: { xs: 1.25, md: 2 }, minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Box sx={{ color: metric.color, display: 'flex', '& svg': { fontSize: { xs: 17, md: 20 } } }}>{metric.icon}</Box>
              <Typography sx={{ color: '#445474', fontSize: { xs: 11.5, md: 13 }, fontWeight: 750, lineHeight: 1.3 }}>
                {metric.label}
              </Typography>
            </Stack>
            <Typography aria-label={metric.label + ': ' + (loading ? 'loading' : metric.value)} sx={{
              color: '#06123A', fontSize: { xs: 26, md: 34 }, fontWeight: 800,
              fontVariantNumeric: 'tabular-nums', mt: 0.6, lineHeight: 1.2,
            }}>
              {loading ? '—' : metric.value}
            </Typography>
          </Box>
        ))}
      </Box>

      {!loading && summary.requests.length > 0 && (
        <Box sx={{ borderTop: '1px solid #E3E9F2', mt: 2.25, pt: 1.75 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 0.5 }}>
            <Typography component="h3" sx={{ fontWeight: 800, color: '#06123A', fontSize: 15 }}>
              Needs your decision
            </Typography>
            <Typography sx={{ color: '#445474', fontSize: 12.5 }}>{summary.requests.length} pending</Typography>
          </Stack>
          {summary.requests.slice(0, 4).map((item) => (
            <Stack key={item.id} direction="row" alignItems="center" justifyContent="space-between" gap={1.5}
              sx={{ py: 1, borderBottom: '1px solid #EEF1F6' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ color: '#06123A', fontWeight: 750, fontSize: 14, overflowWrap: 'anywhere' }}>{item.title}</Typography>
                <Typography sx={{ color: '#445474', fontSize: 12.5 }}>
                  {item.detail} · {moment(item.date).format('ddd D MMM')}
                </Typography>
              </Box>
              <Button onClick={item.onReview} size="small" endIcon={<ArrowForwardRoundedIcon />}
                sx={{ minHeight: 44, flexShrink: 0, fontWeight: 800, textTransform: 'none', color: '#5222B8' }}>
                Review
              </Button>
            </Stack>
          ))}
          {summary.requests.length > 4 && (
            <Typography sx={{ fontSize: 12.5, color: '#445474', mt: 1 }}>
              More pending requests are available on the roster calendar.
            </Typography>
          )}
        </Box>
      )}
      {!loading && summary.assigned === 0 && summary.open === 0 && summary.requests.length === 0 && (
        <Typography sx={{ mt: 1.5, fontSize: 13.5, color: '#445474' }}>
          Nothing scheduled in this week. Use the planner to add or copy shifts.
        </Typography>
      )}
    </Paper>
  );
}
