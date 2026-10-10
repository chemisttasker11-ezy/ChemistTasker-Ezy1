import { Box, Button, Chip, Paper, Skeleton, Stack, Typography } from '@mui/material';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import moment from 'moment';
import type { Assignment } from '../../pages/dashboard/sidebar/RosterWorkerPage.model';

type Props = {
  assignments: Assignment[];
  userId: number | null | undefined;
  calendarDate: Date;
  onNavigate: (date: Date) => void;
  onSelect: (assignment: Assignment) => void;
  loading: boolean;
};

type AgendaCategory = 'mine' | 'request' | 'open';

function statusOf(assignment: Assignment, category: AgendaCategory): string {
  if (category === 'open') return 'Available to claim';
  if (category === 'request') {
    const status = assignment.status || assignment.swap_request?.status || 'PENDING';
    return 'Cover request · ' + status.replaceAll('_', ' ').toLowerCase();
  }
  if (assignment.leave_request) {
    return 'Leave · ' + assignment.leave_request.status.toLowerCase();
  }
  return 'Rostered';
}

const darkText = '#06123A';
const softText = '#445474';

export default function RosterWorkerAgenda({ assignments, userId, calendarDate, onNavigate, onSelect, loading }: Props) {
  const start = moment(calendarDate).startOf('isoWeek');
  const end = moment(start).add(6, 'days');
  const inWeek = (row: Assignment) => {
    const date = row.slot_date;
    return Boolean(date && date >= start.format('YYYY-MM-DD') && date <= end.format('YYYY-MM-DD'));
  };
  const filtered = assignments.filter(inWeek);
  const mine = filtered.filter((row) => !row.isOpenShift && !row.isSwapRequest && userId != null && Number(row.user) === Number(userId));
  const requests = filtered.filter((row) => row.isSwapRequest);
  const open = filtered.filter((row) => row.isOpenShift);
  const sorted = (list: Assignment[]) => [...list].sort((a, b) => (
    (a.slot_date + ' ' + (a.slot_detail?.start_time || '')).localeCompare(b.slot_date + ' ' + (b.slot_detail?.start_time || ''))
  ));

  const sections: Array<{ id: AgendaCategory; title: string; description: string; items: Assignment[] }> = [
    { id: 'mine', title: 'My assigned shifts', description: 'Published work assigned to you', items: sorted(mine) },
    { id: 'request', title: 'My cover requests', description: 'Requests do not change your assignment until approved', items: sorted(requests) },
    { id: 'open', title: 'Open team shifts', description: 'Available work is not a confirmed booking', items: sorted(open) },
  ];

  return (
    <Box component="section" aria-label="My weekly roster agenda" sx={{ width: '100%', minWidth: 0 }}>
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderColor: '#DEE5F0', borderRadius: '14px', boxShadow: 'none', bgcolor: '#FFFFFF' }}>
        <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
          <Button variant="outlined" aria-label="Previous week" onClick={() => onNavigate(moment(start).subtract(7, 'days').toDate())}
            sx={{ minWidth: 44, width: 44, height: 44, borderColor: '#DCE4EF', color: '#5222B8', p: 0 }}>
            <ChevronLeftRoundedIcon />
          </Button>
          <Box sx={{ minWidth: 0, textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 800, fontSize: 15, color: darkText }}>{start.format('D MMM')} – {end.format('D MMM YYYY')}</Typography>
            <Typography aria-live="polite" sx={{ fontSize: 12.5, color: softText }}>{mine.length} assigned · {open.length} available</Typography>
          </Box>
          <Button variant="outlined" aria-label="Next week" onClick={() => onNavigate(moment(start).add(7, 'days').toDate())}
            sx={{ minWidth: 44, width: 44, height: 44, borderColor: '#DCE4EF', color: '#5222B8', p: 0 }}>
            <ChevronRightRoundedIcon />
          </Button>
        </Stack>
        <Button onClick={() => onNavigate(new Date())} startIcon={<CalendarTodayOutlinedIcon />}
          sx={{ minHeight: 44, mt: 0.5, display: 'flex', mx: 'auto', fontSize: 13, textTransform: 'none', fontWeight: 750, color: '#5222B8' }}>
          This week
        </Button>
      </Paper>

      {loading ? (
        <Stack spacing={1.25} aria-label="Loading weekly assignments">
          {[1, 2, 3].map((item) => <Skeleton key={item} variant="rounded" height={102} sx={{ borderRadius: '12px' }} />)}
        </Stack>
      ) : (
        <Stack spacing={2.5}>
          {sections.map((section) => (
            <Box component="section" aria-label={section.title} key={section.id}>
              <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1} sx={{ mb: 0.4 }}>
                <Typography component="h2" sx={{ color: darkText, fontWeight: 800, fontSize: 19, fontFamily: 'Outfit, sans-serif' }}>
                  {section.title}
                </Typography>
                <Chip size="small" label={section.items.length} sx={{ fontWeight: 800, bgcolor: section.id === 'open' ? '#FFF5E5' : '#F0EDFA', color: section.id === 'open' ? '#7B4800' : '#5222B8' }} />
              </Stack>
              <Typography sx={{ color: softText, fontSize: 13, mb: 1.2, lineHeight: 1.45 }}>{section.description}</Typography>
              {section.items.length === 0 ? (
                <Paper variant="outlined" sx={{ borderColor: '#E3E9F3', borderStyle: 'dashed', borderRadius: '12px', px: 2, py: 2.25, boxShadow: 'none' }}>
                  <Typography sx={{ color: softText, fontSize: 13.5 }}>
                    {section.id === 'mine' ? 'No assigned shifts this week.' : section.id === 'request' ? 'No cover requests this week.' : 'No open team shifts this week.'}
                  </Typography>
                </Paper>
              ) : (
                <Stack spacing={1.1}>
                  {section.items.map((item) => {
                    const date = moment(item.slot_date, 'YYYY-MM-DD');
                    const startTime = String(item.slot_detail?.start_time || '').slice(0, 5);
                    const endTime = String(item.slot_detail?.end_time || '').slice(0, 5);
                    const status = statusOf(item, section.id);
                    return (
                      <Paper component="article" key={section.id + '-' + item.id} variant="outlined" sx={{ borderColor: '#DFE7F1', borderRadius: '12px', p: 1.75, boxShadow: 'none', bgcolor: '#FFFFFF' }}>
                        <Stack direction="row" spacing={1.5} alignItems="flex-start">
                          <Box sx={{ flexShrink: 0, width: 52, textAlign: 'center', bgcolor: '#F3F1FA', borderRadius: '9px', py: 0.8 }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#5222B8' }}>{date.format('ddd').toUpperCase()}</Typography>
                            <Typography sx={{ fontSize: 22, fontWeight: 850, color: darkText, lineHeight: 1.15 }}>{date.format('D')}</Typography>
                          </Box>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography sx={{ fontWeight: 800, fontSize: 15, color: darkText, overflowWrap: 'anywhere' }}>
                              {item.shift_detail?.pharmacy_name || 'Pharmacy shift'}
                            </Typography>
                            <Typography sx={{ fontSize: 13.5, color: softText, mt: 0.35 }}>
                              {(item.shift_detail?.role_needed || 'Staff').replaceAll('_', ' ')}
                              {startTime && endTime ? ' · ' + startTime + ' – ' + endTime : ''}
                            </Typography>
                            <Chip size="small" label={status} sx={{ mt: 1, height: 'auto', minHeight: 26, borderRadius: '7px', fontWeight: 750, bgcolor: section.id === 'open' ? '#FFF3DE' : section.id === 'request' ? '#E9F6FA' : '#F0EDFA', color: section.id === 'open' ? '#795000' : section.id === 'request' ? '#075B71' : '#5222B8', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.4 } }} />
                          </Box>
                        </Stack>
                        <Button onClick={() => onSelect(item)} fullWidth variant={section.id === 'open' ? 'contained' : 'outlined'} endIcon={<ArrowForwardRoundedIcon />}
                          aria-label={(section.id === 'open' ? 'Review claim for ' : 'Manage ') + (item.shift_detail?.pharmacy_name || 'shift') + ' ' + date.format('D MMM')}
                          sx={{
                            mt: 1.5, minHeight: 44, fontWeight: 800, textTransform: 'none', borderRadius: '9px',
                            ...(section.id === 'open'
                              ? { bgcolor: '#5222B8', '&:hover': { bgcolor: '#40168F' } }
                              : { color: '#5222B8', borderColor: '#CBBBE8' }),
                          }}>
                          {section.id === 'open' ? 'View and claim' : section.id === 'request' ? 'Review request' : 'Manage shift'}
                        </Button>
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
