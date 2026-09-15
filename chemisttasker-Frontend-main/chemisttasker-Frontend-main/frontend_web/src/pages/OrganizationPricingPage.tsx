import React, { useEffect, useState } from 'react';
import {
  AppBar, Box, Button, Card, CardContent, Chip, Container, CssBaseline, IconButton, Menu,
  MenuItem, Stack, ThemeProvider, Toolbar, Typography, createTheme, styled
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import GroupsIcon from '@mui/icons-material/Groups';
import StorefrontIcon from '@mui/icons-material/Storefront';
import HubIcon from '@mui/icons-material/Hub';
import logoBanner from '../assets/clipsnap-edit-6-1-2026.png';
import PublicContactFormSection from '../components/PublicContactFormSection';
import { useAuth } from '../contexts/AuthContext';
import { resolveDashboardPath } from '../utils/dashboardPath';
import { setCanonical, setPageMeta, setSocialMeta } from '../utils/seo';
import { useNavigate } from 'react-router-dom';

const theme = createTheme({
  palette: {
    primary: { main: '#00a99d' },
    secondary: { main: '#c724b1' },
    text: { primary: '#344767', secondary: '#0d1a2e' },
    background: { default: '#f8f9fa', paper: '#ffffff' },
  },
  typography: {
    fontFamily: "'Inter', sans-serif",
    h1: { fontWeight: 800, color: '#0d1a2e' },
    h2: { fontWeight: 700, color: '#0d1a2e' },
    h3: { fontWeight: 700, color: '#0d1a2e' },
    h4: { fontWeight: 700, color: '#0d1a2e' },
  },
});

const CtaButton = styled(Button)(({ theme }) => ({
  transition: 'all 0.3s ease',
  boxShadow: `0 4px 6px rgba(0, 0, 0, 0.1), 0 10px 20px ${theme.palette.primary.main}33`,
  backgroundColor: theme.palette.primary.main,
  color: 'white',
  borderRadius: '8px',
  fontWeight: 600,
  '&:hover': {
    backgroundColor: theme.palette.primary.dark,
    transform: 'translateY(-5px) scale(1.03)',
    boxShadow: `0 7px 14px rgba(0, 0, 0, 0.1), 0 15px 30px ${theme.palette.primary.main}4D`,
  },
}));

const PAGE_ROUTES = {
  login: '/login',
  register: '/register',
};

const featureGroups = [
  {
    title: 'Centralized operations',
    icon: <StorefrontIcon sx={{ color: 'primary.main', fontSize: 30 }} />,
    items: [
      'Manage multiple pharmacies under one organization account',
      'Track claimed pharmacies and pending approvals in one place',
      'Post and monitor shifts across your organization',
    ],
  },
  {
    title: 'Team coordination',
    icon: <GroupsIcon sx={{ color: 'primary.main', fontSize: 30 }} />,
    items: [
      'Invite organization admins and staff to help manage operations',
      'Give local teams access while keeping central oversight',
      'Keep roster and shift workflows aligned across stores',
    ],
  },
  {
    title: 'Internal communication',
    icon: <HubIcon sx={{ color: 'primary.main', fontSize: 30 }} />,
    items: [
      'Use chat, hub posts, and community groups for updates',
      'Share organization announcements and operational information',
      'Build a public organization presence linked to your openings',
    ],
  },
];

export default function OrganizationPricingPage() {
  const [anchorElNav, setAnchorElNav] = useState<null | HTMLElement>(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const dashboardHref = resolveDashboardPath(user?.role);

  useEffect(() => {
    const title = 'Organization Pricing | ChemistTasker';
    const description = 'Pricing inquiries for pharmacy organizations managing multiple pharmacies, teams, and shared shift operations.';
    const origin = window.location.origin;

    setPageMeta(title, description);
    setCanonical(`${origin}/pricing/organization`);
    setSocialMeta({ title, description, url: `${origin}/pricing/organization`, type: 'website' });
  }, []);

  const handleOpenNavMenu = (event: React.MouseEvent<HTMLElement>) => setAnchorElNav(event.currentTarget);
  const handleCloseNavMenu = () => setAnchorElNav(null);
  const handleLogout = () => {
    logout();
    handleCloseNavMenu();
    navigate(PAGE_ROUTES.login, { replace: true });
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="sticky" sx={{ bgcolor: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)', boxShadow: 'none', borderBottom: '1px solid #e2e8f0' }}>
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ justifyContent: 'space-between' }}>
            <a href="/" style={{ display: 'flex', alignItems: 'center' }}>
              <img src={logoBanner} alt="ChemistTaskerRx Logo" style={{ height: '48px', width: 'auto' }} />
            </a>
            <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'flex' }, justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
              <Button href="/pricing" sx={{ color: 'text.primary', fontWeight: 500 }}>Pricing</Button>
              {user ? (
                <>
                  <CtaButton href={dashboardHref} variant="contained" size="small" sx={{ px: 2.5, py: 1 }}>
                    Go to Dashboard
                  </CtaButton>
                  <Button onClick={handleLogout} sx={{ color: 'text.primary', fontWeight: 500 }}>Logout</Button>
                </>
              ) : (
                <>
                  <Button href={PAGE_ROUTES.login} sx={{ color: 'text.primary', fontWeight: 500 }}>Login</Button>
                  <CtaButton href={PAGE_ROUTES.register} variant="contained" size="small" sx={{ px: 2.5, py: 1 }}>Sign Up</CtaButton>
                </>
              )}
            </Box>
            <Box sx={{ flexGrow: 1, display: { xs: 'flex', md: 'none' }, justifyContent: 'flex-end' }}>
              <IconButton size="large" onClick={handleOpenNavMenu} color="inherit">
                <MenuIcon sx={{ color: 'text.primary' }} />
              </IconButton>
              <Menu
                anchorEl={anchorElNav}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                keepMounted
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                open={Boolean(anchorElNav)}
                onClose={handleCloseNavMenu}
                sx={{ display: { xs: 'block', md: 'none' } }}
              >
                <MenuItem component="a" href="/pricing"><Typography>Pricing</Typography></MenuItem>
                {user ? (
                  <>
                    <MenuItem component="a" href={dashboardHref}><Typography>Go to Dashboard</Typography></MenuItem>
                    <MenuItem onClick={handleLogout}><Typography>Logout</Typography></MenuItem>
                  </>
                ) : (
                  <>
                    <MenuItem component="a" href={PAGE_ROUTES.login}><Typography>Login</Typography></MenuItem>
                    <MenuItem component="a" href={PAGE_ROUTES.register}>
                      <CtaButton variant="contained" fullWidth>Sign Up</CtaButton>
                    </MenuItem>
                  </>
                )}
              </Menu>
            </Box>
          </Toolbar>
        </Container>
      </AppBar>

      <main>
        <Box sx={{ pt: { xs: 8, md: 12 }, pb: { xs: 7, md: 10 }, bgcolor: '#f4f7fb' }}>
          <Container maxWidth="lg">
            <Stack spacing={3} sx={{ maxWidth: 760 }}>
              <Chip label="Organization Pricing" color="primary" sx={{ width: 'fit-content', fontWeight: 700 }} />
              <Typography variant="h1" sx={{ fontSize: { xs: '2.5rem', md: '3.5rem' } }}>
                For pharmacy groups that need centralized control
              </Typography>
              <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 400 }}>
                If your organization manages multiple pharmacies, multiple admins, or a larger staffing rollout, talk to us about a tailored setup and pricing plan.
              </Typography>
            </Stack>
          </Container>
        </Box>

        <Box sx={{ py: 8, bgcolor: 'background.default' }}>
          <Container maxWidth="lg">
            <Card sx={{ borderRadius: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 18px 35px rgba(15, 23, 42, 0.08)', mb: 6 }}>
              <CardContent sx={{ p: { xs: 4, md: 5 } }}>
                <Stack spacing={2}>
                  <Typography variant="h3">What this plan is built for</Typography>
                  <Typography color="text.secondary">
                    ChemistTasker already supports organization dashboards, claimed pharmacies, organization shift posting, shared pharmacy management, team invites, chat, hub activity, and public organization profiles. This plan is for groups that want those capabilities packaged around a larger operating model.
                  </Typography>
                  <Typography variant="h4" color="primary.main">
                    Contact us
                  </Typography>
                  <Typography color="text.secondary">
                    We will tailor pricing based on your structure, number of pharmacies, rollout needs, and support requirements.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}>
              {featureGroups.map((group) => (
                <Card key={group.title} sx={{ borderRadius: '1.25rem', border: '1px solid #e2e8f0', boxShadow: '0 14px 30px rgba(15, 23, 42, 0.06)' }}>
                  <CardContent sx={{ p: 4 }}>
                    <Stack spacing={2.5}>
                      <Box>{group.icon}</Box>
                      <Typography variant="h5">{group.title}</Typography>
                      <Stack spacing={1.5}>
                        {group.items.map((item) => (
                          <Box key={item} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                            <CheckCircleIcon sx={{ color: 'primary.main', mt: '2px' }} />
                            <Typography color="text.secondary">{item}</Typography>
                          </Box>
                        ))}
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Container>
        </Box>

        <PublicContactFormSection
          title="Ask about organization pricing"
          subtitle="Tell us more about your organization, the pharmacies you manage, and the support or rollout you need. We will get back to you."
          subjectPlaceholder="Inquiry subject"
          defaultSubject="Organization pricing inquiry"
          defaultMessage="Tell us more about your organization, how many pharmacies you manage, how many admins or internal staff need access, and what kind of staffing workflow or rollout support you are looking for."
          submitLabel="Send Inquiry"
          source="web-org-pricing"
          pageUrl={`${window.location.origin}/pricing/organization`}
        />
      </main>
    </ThemeProvider>
  );
}
