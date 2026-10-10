import type { MouseEvent } from 'react';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import moment from 'moment';
import type { DayStackedBucket } from './RosterGridViews.model';

type ShiftAction = {
  slotId: number;
  assignmentId?: number;
  date: string;
  workerId?: number | null;
  workerName?: string;
  role: string;
  startTime: string;
  endTime: string;
};

type Props = {
  weekStart: string;
  days: DayStackedBucket[];
  isPublished: boolean;
  pharmacyId: number | null;
  canEditSlot: (slotId: number) => boolean;
  onAdd: (date: string) => void;
  onEdit: (event: MouseEvent<HTMLElement>, data: ShiftAction) => void;
};

export default function RosterStackedDayView({ weekStart, days, isPublished, pharmacyId, canEditSlot, onAdd, onEdit }: Props) {
  const start = moment(weekStart, 'YYYY-MM-DD');
  const byDate = new Map(days.map((day) => [day.date, day]));
  return (
    <Box component="section" aria-label="Day-by-day roster planner" sx={{ mt: 2.5, mb: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1.5} sx={{ mb: 1.5 }}>
        <Box>
          <Typography component="h3" sx={{ fontFamily: 'Outfit, sans-serif', color: '#06123A', fontSize: 21, fontWeight: 750 }}>Daily staffing plan</Typography>
          <Typography sx={{ color: '#445474', fontSize: 13.5 }}>Shifts and vacancies grouped by day. Changes remain subject to roster validation.</Typography>
        </Box>
        <Chip size="small" label={isPublished ? 'Published · view only' : 'Draft · editable'} sx={{
          alignSelf: { xs: 'flex-start', sm: 'center' }, bgcolor: isPublished ? '#E9F7EF' : '#FFF2D8',
          color: isPublished ? '#075B43' : '#7B4800', fontWeight: 800,
        }} />
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', md: 'repeat(2,minmax(0,1fr))', xl: 'repeat(3,minmax(0,1fr))' }, gap: 1.5 }}>
        {Array.from({ length: 7 }, (_, offset) => {
          const date = moment(start).add(offset, 'day');
          const dayStr = date.format('YYYY-MM-DD');
          const bucket = byDate.get(dayStr);
          const shifts = [...(bucket?.shifts || [])].sort((a, b) => a.start_time.localeCompare(b.start_time));
          const vacantCount = shifts.filter((item) => item.type === 'VACANT').length;
          return (
            <Paper component="article" variant="outlined" key={dayStr} sx={{
              borderColor: date.isSame(moment(), 'day') ? '#BAA9DF' : '#DCE5F1',
              borderRadius: '13px', boxShadow: 'none', overflow: 'hidden', minWidth: 0,
            }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ bgcolor: date.isSame(moment(), 'day') ? '#F0EBFA' : '#F7F9FD', py: 1.5, px: 1.75 }}>
                <Box>
                  <Typography component="h4" sx={{ fontSize: 15, fontWeight: 850, color: '#06123A' }}>{date.format('dddd D MMM')}</Typography>
                  <Typography sx={{ color: '#445474', fontSize: 12.5 }}>{shifts.length} shifts · {vacantCount} vacant</Typography>
                </Box>
                <Button onClick={() => onAdd(dayStr)} disabled={isPublished || !pharmacyId} variant="outlined" size="small"
                  startIcon={<AddRoundedIcon />} aria-label={'Add draft shift for ' + date.format('dddd D MMM')}
                  sx={{ minHeight: 44, color: '#5222B8', borderColor: '#CDBBE9', fontWeight: 800, textTransform: 'none', px: 1.5 }}>
                  Add
                </Button>
              </Stack>
              {shifts.length === 0 ? (
                <Typography sx={{ p: 2, color: '#445474', fontSize: 13.5 }}>No shifts scheduled.</Typography>
              ) : (
                <Stack spacing={0} sx={{ px: 1.75, pb: 1 }}>
                  {shifts.map((item, i) => {
                    const editable = typeof item.slot_id === 'number' && canEditSlot(item.slot_id);
                    const name = item.type === 'VACANT' ? 'Vacant shift' : (item.worker_name || 'Team member');
                    return (
                      <Stack key={item.slot_id ?? i} direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ py: 1.35, borderBottom: '1px solid #E9EFF5' }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ color: item.type === 'VACANT' ? '#7B4800' : '#06123A', fontWeight: 800, fontSize: 13.5, overflowWrap: 'anywhere' }}>{name}</Typography>
                          <Typography sx={{ color: '#445474', fontSize: 12.5 }}>
                            {item.role.replaceAll('_', ' ')} · {item.start_time.slice(0, 5)} – {item.end_time.slice(0, 5)}
                          </Typography>
                        </Box>
                        {editable ? (
                          <Button size="small" onClick={(event) => onEdit(event, {
                            slotId: item.slot_id!, assignmentId: item.assignment_id, date: dayStr,
                            workerId: item.worker_id ?? null, workerName: item.worker_name,
                            role: item.role, startTime: item.start_time, endTime: item.end_time,
                          })} startIcon={<EditOutlinedIcon />}
                            sx={{ minHeight: 44, px: 0.65, color: '#5222B8', textTransform: 'none', fontSize: 12.5, fontWeight: 800, flexShrink: 0 }}>
                            Edit
                          </Button>
                        ) : (
                          <Typography sx={{ color: '#52617C', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>View only</Typography>
                        )}
                      </Stack>
                    );
                  })}
                </Stack>
              )}
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}
