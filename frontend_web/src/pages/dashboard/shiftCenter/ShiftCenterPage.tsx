import { useEffect } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Paper, Stack, Tab, Tabs, Typography, alpha } from '@mui/material';
import { AddRounded, CampaignOutlined, EventAvailableOutlined, HistoryRounded } from '@mui/icons-material';
import ActiveShiftsPage from '../sidebar/ActiveShiftsPage';
import ConfirmedShiftsPage from '../sidebar/ConfirmedShiftsPage';
import HistoryShiftsPage from '../sidebar/HistoryShiftsPage';
import AdminActiveShiftsPage from '../admin/AdminActiveShiftsPage';
import AdminConfirmedShiftsPage from '../admin/AdminConfirmedShiftsPage';
import AdminHistoryShiftsPage from '../admin/AdminHistoryShiftsPage';

const sections = ['active', 'confirmed', 'history'] as const;
type Section = typeof sections[number];

function ShiftCenterLayout({ scope, basePath, subtitle }: { scope: 'owner' | 'organization' | 'admin'; basePath: string; subtitle: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { section } = useParams<{ section?: string }>();
  const current = sections.includes(section as Section) ? section as Section : 'active';
  useEffect(() => {
    if (!sections.includes(section as Section)) {
      navigate(`${basePath}/active${location.search}`, { replace: true, state: location.state });
    }
  }, [section, basePath, navigate, location.search, location.state]);
  const pages = scope === 'admin'
    ? { active: AdminActiveShiftsPage, confirmed: AdminConfirmedShiftsPage, history: AdminHistoryShiftsPage }
    : { active: ActiveShiftsPage, confirmed: ConfirmedShiftsPage, history: HistoryShiftsPage };
  const Page = pages[current];
  return <Box sx={{ maxWidth: 1360, mx: 'auto', px: { xs: 1.5, md: 3 }, py: { xs: 2, md: 3 }, minWidth: 0 }}>
    <Paper elevation={0} sx={{ p: { xs: 2.5, md: 3.5 }, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3,
      background: (theme) => theme.palette.mode === 'dark' ? theme.palette.background.paper : 'linear-gradient(110deg, #F6F2FC, #F0F8FC)' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
        <Box>
          <Typography component="h1" variant="h4" fontWeight={700} sx={{ color: 'text.primary', letterSpacing: '-0.025em' }}>Shift Centre</Typography>
          <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 660 }}>{subtitle}</Typography>
        </Box>
        <Button component={Link} to={`${basePath.replace(/\/shift-center$/, '')}/post-shift`} variant="contained" startIcon={<AddRounded />}
          sx={{ minHeight: 48, flexShrink: 0, bgcolor: '#06214A', color: '#fff', '&:hover': { bgcolor: '#10376B' } }}>Post a shift</Button>
      </Stack>
    </Paper>
    <Tabs value={current} aria-label="Shift Centre sections" variant="fullWidth" sx={{ mb: 3, borderBottom: '1px solid', borderColor: 'divider',
      '& .MuiTab-root': { minWidth: 0, minHeight: 56, fontSize: { xs: 13, sm: 15 }, textTransform: 'none', gap: 0.75 },
      '& .Mui-selected': { bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06) } }}>
      <Tab component={Link} to={`${basePath}/active`} value="active" label="Posted shifts" icon={<CampaignOutlined />} iconPosition="start" />
      <Tab component={Link} to={`${basePath}/confirmed`} value="confirmed" label="Confirmed" icon={<EventAvailableOutlined />} iconPosition="start" />
      <Tab component={Link} to={`${basePath}/history`} value="history" label="History" icon={<HistoryRounded />} iconPosition="start" />
    </Tabs>
    <Box key={current} role="region" aria-label={`${current === 'active' ? 'Posted' : current === 'confirmed' ? 'Confirmed' : 'History'} shifts`}
      sx={{ '& > .MuiContainer-root': { px: 0, py: 0 } }}><Page /></Box>
  </Box>;
}

export function OwnerShiftCenterPage() {
  return <ShiftCenterLayout scope="owner" basePath="/dashboard/owner/shift-center" subtitle="Follow every post from finding cover to confirmed assignments and past shifts." />;
}
export function OrganizationShiftCenterPage() {
  return <ShiftCenterLayout scope="organization" basePath="/dashboard/organization/shift-center" subtitle="Review responses and staffing progress across your organisation’s pharmacies." />;
}
export function AdminShiftCenterPage() {
  const { pharmacyId } = useParams<{ pharmacyId: string }>();
  return pharmacyId ? <ShiftCenterLayout scope="admin" basePath={`/dashboard/admin/${pharmacyId}/shift-center`} subtitle="Manage posted shifts, assignments and history for your selected pharmacy." /> : null;
}
