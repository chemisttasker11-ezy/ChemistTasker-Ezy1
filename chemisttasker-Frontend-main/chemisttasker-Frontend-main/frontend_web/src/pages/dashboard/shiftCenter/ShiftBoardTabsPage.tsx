import { ComponentType, SyntheticEvent, useMemo, useState } from 'react';
import { Box, Paper, Stack, Tabs, Tab, Typography, alpha, useTheme } from '@mui/material';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import PublicShiftsPage from '../sidebar/PublicShiftsPage';
import CommunityShiftsPage from '../sidebar/CommunityShiftsPage';

type ShiftBoardTab = 'browse' | 'saved' | 'interested' | 'rejected' | 'accepted';

const TABS: Array<{ value: ShiftBoardTab; label: string }> = [
  { value: 'browse', label: 'Browse' },
  { value: 'saved', label: 'Saved' },
  { value: 'interested', label: 'Interested' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'accepted', label: 'Offers' },
];

export default function ShiftBoardTabsPage() {
  const theme = useTheme();
  const { workspace } = useWorkspace();
  const [activeTab, setActiveTab] = useState<ShiftBoardTab>('browse');

  const heroGradient = useMemo(
    () =>
      `linear-gradient(135deg, ${alpha(
        theme.palette.primary.main,
        0.94
      )}, ${alpha(theme.palette.primary.dark, 0.74)})`,
    [theme.palette.primary.dark, theme.palette.primary.main]
  );

  const handleTabChange = (_: SyntheticEvent, value: ShiftBoardTab) => {
    setActiveTab(value);
  };

  const BrowseComponent: ComponentType<any> =
    workspace === 'internal' ? CommunityShiftsPage : PublicShiftsPage;

  const renderContent = () => (
    <BrowseComponent
      hideTabs
      activeTabOverride={activeTab}
      onActiveTabChange={(tab: ShiftBoardTab) => setActiveTab(tab)}
    />
  );

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 1440,
        mx: 'auto',
        px: { xs: 1.5, md: 3.5 },
        py: { xs: 2, md: 4 },
        display: 'flex',
        flexDirection: 'column',
        gap: { xs: 2.5, md: 3 },
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: { xs: 3, md: 4 },
          borderRadius: { xs: 3, md: 4 },
          backgroundImage: heroGradient,
          color: '#fff',
          overflow: 'hidden',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 2, md: 3 }}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          justifyContent="space-between"
        >
          <Box>
            <Typography variant="overline" sx={{ opacity: 0.72, letterSpacing: '.1em' }}>
              Shift Board
            </Typography>
            <Typography variant="h4" fontWeight={800} gutterBottom>
              Discover shifts at a glance
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.92, maxWidth: 560 }}>
              Browse open shifts, review your saved list, and track interested or rejected opportunities.
            </Typography>
          </Box>
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          borderRadius: { xs: 3, md: 4 },
          border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
        }}
      >
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{
            px: { xs: 1.5, md: 2.5 },
            pt: { xs: 1.5, md: 2 },
            '& .MuiTabs-flexContainer': {
              gap: { xs: 1, sm: 1.5 },
              justifyContent: { xs: 'flex-start', md: 'center' },
            },
            '& .MuiTabs-indicator': {
              display: 'none',
            },
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 700,
              fontSize: { xs: 14, sm: 16 },
              minHeight: 52,
              minWidth: 0,
              borderRadius: 999,
              px: { xs: 2.5, sm: 3.5 },
              py: { xs: 1, sm: 1.3 },
              color: alpha(theme.palette.text.primary, 0.72),
              border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
              transition: theme.transitions.create(['color', 'background-color', 'border-color', 'box-shadow']),
              '&.Mui-selected': {
                color: theme.palette.primary.main,
                backgroundColor: alpha(theme.palette.primary.main, 0.15),
                borderColor: alpha(theme.palette.primary.main, 0.45),
                boxShadow: `0 6px 16px ${alpha(theme.palette.primary.main, 0.18)}`,
              },
              '&:not(.Mui-selected):hover': {
                backgroundColor: alpha(theme.palette.primary.main, 0.08),
                borderColor: alpha(theme.palette.primary.main, 0.25),
              },
            },
          }}
        >
          {TABS.map((tabItem: { value: ShiftBoardTab; label: string }) => (
            <Tab key={tabItem.value} value={tabItem.value} label={tabItem.label} disableRipple />
          ))}
        </Tabs>
        <Box
          sx={{
            px: { xs: 1.5, md: 2.5 },
            pb: { xs: 2, md: 3 },
            pt: { xs: 2, md: 3 },
          }}
        >
          {renderContent()}
        </Box>
      </Paper>
    </Box>
  );
}
