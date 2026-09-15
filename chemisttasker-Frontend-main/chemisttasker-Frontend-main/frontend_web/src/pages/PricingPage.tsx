import React, { useEffect, useState } from 'react';
import {
    AppBar, Box, Button, Container, IconButton, Menu, MenuItem, ThemeProvider,
    Toolbar, Typography, createTheme, styled, Link, Card, CardContent, Divider, Grid
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useNavigate } from 'react-router-dom';
import logoBanner from '../assets/clipsnap-edit-6-1-2026.png';
import AuthLayout from '../layouts/AuthLayout';
import { useAuth } from '../contexts/AuthContext';
import { resolveDashboardPath } from '../utils/dashboardPath';
import { setCanonical, setPageMeta, setSocialMeta } from '../utils/seo';

// --- Constants ---
const PAGE_ROUTES = {
    login: '/login',
    register: '/register',
    publicJobBoard: '/shifts/public-board',
    publicTalentBoard: '/talent/public-board',
    privacyPolicy: '/privacy-policy',
    termsOfService: '/terms-of-service',
};

const orgFeatures = [
    'Centralized pharmacy management across one organization',
    'Invite and coordinate multiple admins and internal teams',
    'Organization shift operations, chat, and pharmacy hub workflows',
];

// --- Theme and Global Styles ---
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
        transform: 'translateY(-5px) scale(1.05)',
        boxShadow: `0 7px 14px rgba(0, 0, 0, 0.1), 0 15px 30px ${theme.palette.primary.main}4D`,
    },
}));

const PricingCard = styled(Card)(() => ({
    borderRadius: '1.5rem',
    border: '1px solid #e2e8f0',
    transition: 'all 0.3s ease',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
    height: '100%',
    position: 'relative',
    overflow: 'visible',
    '&:hover': {
        transform: 'translateY(-10px)',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
    },
}));

function PricingPage() {
    const [anchorElNav, setAnchorElNav] = useState<null | HTMLElement>(null);
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const dashboardHref = resolveDashboardPath(user?.role);

    useEffect(() => {
        const title = 'Pricing | ChemistTasker';
        const description = 'Transparent pricing for pharmacy owners. Simple subscriptions and low shift fulfillment fees.';
        const origin = window.location.origin;

        setPageMeta(title, description);
        setCanonical(`${origin}/pricing`);
        setSocialMeta({ title, description, url: `${origin}/pricing`, type: 'website' });
    }, []);

    const handleOpenNavMenu = (event: React.MouseEvent<HTMLElement>) => setAnchorElNav(event.currentTarget);
    const handleCloseNavMenu = () => setAnchorElNav(null);
    const handleLogout = () => {
        logout();
        handleCloseNavMenu();
        navigate(PAGE_ROUTES.login, { replace: true });
    };
    const handleOwnerSubscribe = () => {
        if (!user) {
            navigate(PAGE_ROUTES.register);
            return;
        }

        if (user.role === 'OWNER') {
            navigate('/dashboard/owner/overview?view=billing');
            return;
        }

        navigate('/dashboard');
    };

    return (
        <AuthLayout title="Pricing" maxWidth={false} noCard showTitle={false}>
        <ThemeProvider theme={theme}>
            <Box sx={{ width: '100%' }}>
            <AppBar position="sticky" sx={{ bgcolor: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)', boxShadow: 'none', borderBottom: '1px solid #e2e8f0' }}>
                <Container maxWidth="xl">
                    <Toolbar disableGutters sx={{ justifyContent: 'space-between' }}>
                        <a href="/" style={{ display: 'flex', alignItems: 'center' }}>
                            <img src={logoBanner} alt="ChemistTaskerRx Logo" style={{ height: '48px', width: 'auto' }} />
                        </a>
                        <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'flex' }, justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
                            <Button href="/" sx={{ color: 'text.primary', fontWeight: 500 }}>Home</Button>
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
                            <Menu anchorEl={anchorElNav} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                                keepMounted transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                                open={Boolean(anchorElNav)} onClose={handleCloseNavMenu}
                                sx={{ display: { xs: 'block', md: 'none' } }}>
                                <MenuItem component="a" href="/"><Typography>Home</Typography></MenuItem>
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
                {/* Pricing Header */}
                <Box sx={{ pt: { xs: 8, md: 12 }, pb: { xs: 6, md: 10 }, bgcolor: 'transparent', textAlign: 'center' }}>
                    <Container maxWidth="md">
                        <Typography variant="h1" sx={{ fontSize: { xs: '2.5rem', md: '3.5rem' }, mb: 3 }}>
                            Clear, transparent pricing
                        </Typography>
                        <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 400, mb: 4, px: { xs: 2, md: 8 } }}>
                            No hidden fees. Built for pharmacy owners and growing organizations. Pharmacy staff use ChemistTasker for free.
                        </Typography>
                    </Container>
                </Box>

                {/* Pricing Cards Section */}
                <Box sx={{ py: 8, bgcolor: 'transparent' }}>
                    <Container maxWidth="lg">
                        <Grid container spacing={4} justifyContent="center" alignItems="stretch">

                            {/* Pay As You Go */}
                            <Grid size={{ xs: 12, md: 4 }}>
                                <PricingCard>
                                    <CardContent sx={{ p: { xs: 4, md: 5 } }}>
                                        <Typography variant="h4" color="text.primary" gutterBottom>
                                            Pay As You Go
                                        </Typography>
                                        <Typography variant="body1" color="text.secondary" sx={{ mb: 4, minHeight: '48px' }}>
                                            For occasional shift coverage. Only pay when a shift is successfully filled.
                                        </Typography>

                                        <Typography variant="h3" sx={{ mb: 1 }}>
                                            $0 <Typography component="span" variant="h6" color="text.secondary">/ month</Typography>
                                        </Typography>

                                        <Box sx={{ mt: 4, mb: 4 }}>
                                            <Divider sx={{ mb: 3 }} />
                                            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                                                Shift Fulfillment Fees:
                                            </Typography>
                                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                                <CheckCircleIcon sx={{ color: 'primary.main', mr: 2 }} />
                                                <Typography><strong>$30</strong> per Locum Shift</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                                <CheckCircleIcon sx={{ color: 'primary.main', mr: 2 }} />
                                                <Typography><strong>$80</strong> per Part/Full Time Job</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                                <CheckCircleIcon sx={{ color: 'primary.main', mr: 2 }} />
                                                <Typography color="text.secondary">No fee if shift goes unfilled</Typography>
                                            </Box>
                                        </Box>

                                        <Button
                                            variant="outlined"
                                            color="primary"
                                            fullWidth
                                            href={PAGE_ROUTES.register}
                                            sx={{ py: 1.5, borderRadius: 2, fontWeight: 'bold' }}
                                        >
                                            Get Started Free
                                        </Button>
                                    </CardContent>
                                </PricingCard>
                            </Grid>

                            {/* Subscriber Pro */}
                            <Grid size={{ xs: 12, md: 4 }}>
                                <PricingCard sx={{ border: '2px solid #00a99d' }}>
                                    {/* Badge */}
                                    <Box sx={{
                                        position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)',
                                        bgcolor: 'primary.main', color: 'white', px: 3, py: 0.5, borderRadius: '20px',
                                        fontWeight: 'bold', fontSize: '0.875rem', letterSpacing: '0.05em', zIndex: 1
                                    }}>
                                        RECOMMENDED
                                    </Box>

                                    <CardContent sx={{ p: { xs: 4, md: 5 } }}>
                                        <Typography variant="h4" color="primary.main" gutterBottom>
                                            Owner Subscription
                                        </Typography>
                                        <Typography variant="body1" color="text.secondary" sx={{ mb: 4, minHeight: '48px' }}>
                                            Best for active pharmacies. Get 50% off all your shift fulfillment fees.
                                        </Typography>

                                        <Typography variant="h3" sx={{ mb: 1 }}>
                                            $30 <Typography component="span" variant="h6" color="text.secondary">/ month</Typography>
                                        </Typography>

                                        <Box sx={{ mt: 4, mb: 4 }}>
                                            <Divider sx={{ mb: 3 }} />
                                            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                                                Includes:
                                            </Typography>
                                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                                <CheckCircleIcon sx={{ color: 'primary.main', mr: 2 }} />
                                                <Typography>Connect up to <strong>5 internal staff</strong> per Pharmacy</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                                <CheckCircleIcon sx={{ color: 'primary.main', mr: 2 }} />
                                                <Typography><strong>$5</strong> per additional staff member</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                                <CheckCircleIcon sx={{ color: 'secondary.main', mr: 2 }} />
                                                <Typography fontWeight="bold">50% off public shift fees</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                                <Typography sx={{ ml: 5, color: 'text.secondary', fontSize: '0.9rem' }}>
                                                    ($15 Locum / $40 Part/Full time)
                                                </Typography>
                                            </Box>
                                        </Box>

                                        <CtaButton
                                            fullWidth
                                            onClick={handleOwnerSubscribe}
                                            sx={{ py: 1.5, borderRadius: 2 }}
                                        >
                                            Subscribe & Save
                                        </CtaButton>
                                    </CardContent>
                                </PricingCard>
                            </Grid>

                            <Grid size={{ xs: 12, md: 4 }}>
                                <PricingCard>
                                    <CardContent sx={{ p: { xs: 4, md: 5 } }}>
                                        <Typography variant="h4" color="text.primary" gutterBottom>
                                            Organization
                                        </Typography>
                                        <Typography variant="body1" color="text.secondary" sx={{ mb: 4, minHeight: '48px' }}>
                                            For groups managing multiple pharmacies, teams, and shared staffing operations.
                                        </Typography>

                                        <Typography variant="h3" sx={{ mb: 1 }}>
                                            Contact us
                                        </Typography>

                                        <Box sx={{ mt: 4, mb: 4 }}>
                                            <Divider sx={{ mb: 3 }} />
                                            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                                                Best for:
                                            </Typography>
                                            {orgFeatures.map((feature) => (
                                                <Box key={feature} sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                                    <CheckCircleIcon sx={{ color: 'primary.main', mr: 2 }} />
                                                    <Typography>{feature}</Typography>
                                                </Box>
                                            ))}
                                        </Box>

                                        <Button
                                            variant="outlined"
                                            color="primary"
                                            fullWidth
                                            href="/pricing/organization"
                                            sx={{ py: 1.5, borderRadius: 2, fontWeight: 'bold' }}
                                        >
                                            Contact Us
                                        </Button>
                                    </CardContent>
                                </PricingCard>
                            </Grid>

                        </Grid>
                    </Container>
                </Box>

                {/* Cancellation section */}
                <Box sx={{ py: 10, bgcolor: 'transparent' }}>
                    <Container maxWidth="md" sx={{ textAlign: 'center' }}>
                        <Typography variant="h3" sx={{ mb: 4 }}>Fair Cancellation Policies</Typography>
                        <Typography color="text.secondary" sx={{ fontSize: '1.1rem', mb: 4 }}>
                            To ensure reliability for our workforce, cancellation penalties apply to shifts that have already been filled and confirmed.
                        </Typography>

                        <Grid container spacing={4} justifyContent="center" sx={{ mt: 2 }}>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <Box sx={{ p: 4, bgcolor: '#f8f9fa', borderRadius: 4, height: '100%' }}>
                                    <Typography variant="h2" color="primary.main" sx={{ mb: 1 }}>20%</Typography>
                                    <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>Within 24 Hours</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Of the total shift wage if cancelled within 24 hours of the shift start time.
                                    </Typography>
                                </Box>
                            </Grid>
                            <Grid size={{ xs: 12, sm: 6 }}>
                                <Box sx={{ p: 4, bgcolor: '#f8f9fa', borderRadius: 4, height: '100%' }}>
                                    <Typography variant="h2" color="secondary.main" sx={{ mb: 1 }}>10%</Typography>
                                    <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>Within 72 Hours</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Of the total shift wage if cancelled between 24 and 72 hours of the shift start time.
                                    </Typography>
                                </Box>
                            </Grid>
                        </Grid>
                    </Container>
                </Box>

            </main>

            <Box component="footer" sx={{ bgcolor: '#e9ecef', py: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                    &copy; {new Date().getFullYear()} CHEMISTTASKER PTY LTD. All rights reserved.
                </Typography>
                <Box sx={{ mt: 1 }}>
                    <Link href={PAGE_ROUTES.termsOfService} color="text.secondary" underline="hover" sx={{ mx: 1 }}>
                        Terms of Service
                    </Link>
                    <Link href={PAGE_ROUTES.privacyPolicy} color="text.secondary" underline="hover" sx={{ mx: 1 }}>
                        Privacy Policy
                    </Link>
                </Box>
            </Box>
            </Box>
        </ThemeProvider>
        </AuthLayout>
    );
}

export default PricingPage;
