import React, { useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StorefrontIcon from '@mui/icons-material/Storefront';
import GroupsIcon from '@mui/icons-material/Groups';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import { useNavigate } from '@/public/navigation';
import AuthLayout from '../layouts/AuthLayout';
import { useAuth } from '../contexts/AuthContext';
import { setCanonical, setPageMeta, setSocialMeta } from '../utils/seo';

const PAGE_ROUTES = {
  register: '/register',
  organizationPricing: '/pricing/organization',
};

const orgFeatures = [
  'Centralized pharmacy management across one organization',
  'Invite and coordinate multiple admins and internal teams',
  'Organization shift operations, chat, and pharmacy hub workflows',
];

type FeatureRowProps = {
  children: React.ReactNode;
  emphasis?: boolean;
};

function FeatureRow({ children, emphasis = false }: FeatureRowProps) {
  return (
    <Stack direction="row" spacing={1.25} alignItems="flex-start">
      <CheckCircleIcon sx={{ color: emphasis ? 'secondary.main' : 'primary.main', mt: '2px', fontSize: 20 }} />
      <Typography sx={{ color: emphasis ? 'text.primary' : 'text.secondary', fontWeight: emphasis ? 800 : 600, lineHeight: 1.55 }}>
        {children}
      </Typography>
    </Stack>
  );
}

export default function PricingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const title = 'Pricing | ChemistTasker';
    const description = 'Transparent pricing for pharmacy owners. Simple subscriptions and shift fulfillment fees.';
    const origin = window.location.origin;
    setPageMeta(title, description);
    setCanonical(`${origin}/pricing`);
    setSocialMeta({ title, description, url: `${origin}/pricing`, type: 'website' });
  }, []);

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
      <Box sx={{ pb: { xs: 4, md: 8 } }}>
        <Container maxWidth="lg">
          <Stack spacing={2} alignItems="center" textAlign="center" sx={{ maxWidth: 760, mx: 'auto', mb: { xs: 4, md: 6 } }}>
            <Chip label="Simple choices" />
            <Typography variant="h2" component="h2" sx={{ fontSize: { xs: 34, md: 48 } }}>
              Choose how your pharmacy uses ChemistTasker.
            </Typography>
            <Typography color="text.secondary" sx={{ fontSize: { xs: 15, md: 17 }, lineHeight: 1.75, maxWidth: 670 }}>
              Start without a monthly subscription, reduce public shift fulfillment fees with an owner subscription, or talk to us about an organisation rollout. Pharmacy staff use ChemistTasker for free.
            </Typography>
          </Stack>

          <Grid container spacing={2.5} alignItems="stretch">
            <Grid size={{ xs: 12, md: 4 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ p: { xs: 3, md: 4 }, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                    <Box>
                      <Typography variant="h4">Pay as you go</Typography>
                      <Typography color="text.secondary" sx={{ mt: .75 }}>For occasional shift coverage.</Typography>
                    </Box>
                    <Box sx={{ width: 46, height: 46, borderRadius: 2.5, bgcolor: '#E7F0FF', color: '#063BDA', display: 'grid', placeItems: 'center' }}>
                      <StorefrontIcon />
                    </Box>
                  </Stack>

                  <Typography sx={{ mt: 4, fontSize: 42, fontWeight: 900, color: 'text.primary', lineHeight: 1 }}>
                    $0 <Typography component="span" sx={{ color: 'text.secondary', fontSize: 15, fontWeight: 700 }}>/ month</Typography>
                  </Typography>

                  <Divider sx={{ my: 3 }} />
                  <Stack spacing={1.6} sx={{ flex: 1 }}>
                    <FeatureRow><strong>$30</strong>&nbsp;per locum shift fulfillment</FeatureRow>
                    <FeatureRow><strong>$80</strong>&nbsp;per part/full-time job fulfillment</FeatureRow>
                    <FeatureRow>No fulfillment fee when the shift goes unfilled</FeatureRow>
                  </Stack>

                  <Button
                    fullWidth
                    variant="outlined"
                    sx={{ mt: 3 }}
                    onClick={() => navigate(user ? '/dashboard' : PAGE_ROUTES.register)}
                  >
                    {user ? 'Open my dashboard' : 'Get started'}
                  </Button>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Card sx={{ height: '100%', border: '2px solid #5222B8', position: 'relative', overflow: 'visible' }}>
                <Chip
                  label="Best for active pharmacies"
                  sx={{ position: 'absolute', top: -15, left: 24, bgcolor: '#5222B8', color: '#fff' }}
                />
                <CardContent sx={{ p: { xs: 3, md: 4 }, pt: { xs: 4.25, md: 4.5 }, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                    <Box>
                      <Typography variant="h4" color="primary.main">Owner subscription</Typography>
                      <Typography color="text.secondary" sx={{ mt: .75 }}>Lower public shift fulfillment fees.</Typography>
                    </Box>
                    <Box sx={{ width: 46, height: 46, borderRadius: 2.5, bgcolor: '#EFE7FF', color: '#5222B8', display: 'grid', placeItems: 'center' }}>
                      <SavingsOutlinedIcon />
                    </Box>
                  </Stack>

                  <Typography sx={{ mt: 4, fontSize: 42, fontWeight: 900, color: 'text.primary', lineHeight: 1 }}>
                    $30 <Typography component="span" sx={{ color: 'text.secondary', fontSize: 15, fontWeight: 700 }}>/ month</Typography>
                  </Typography>

                  <Divider sx={{ my: 3 }} />
                  <Stack spacing={1.6} sx={{ flex: 1 }}>
                    <FeatureRow>Connect up to <strong>5 internal staff</strong> per pharmacy</FeatureRow>
                    <FeatureRow><strong>$5</strong>&nbsp;per additional staff member</FeatureRow>
                    <FeatureRow emphasis>50% off public shift fulfillment fees</FeatureRow>
                    <Typography sx={{ pl: 4, color: 'text.secondary', fontSize: 13, fontWeight: 700 }}>
                      $15 locum / $40 part-full time
                    </Typography>
                  </Stack>

                  <Button fullWidth variant="contained" sx={{ mt: 3 }} onClick={handleOwnerSubscribe}>
                    {user?.role === 'OWNER' ? 'Manage subscription' : 'Subscribe & save'}
                  </Button>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ p: { xs: 3, md: 4 }, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                    <Box>
                      <Typography variant="h4">Organisation</Typography>
                      <Typography color="text.secondary" sx={{ mt: .75 }}>For multi-pharmacy operating models.</Typography>
                    </Box>
                    <Box sx={{ width: 46, height: 46, borderRadius: 2.5, bgcolor: '#FDE7F5', color: '#D600C8', display: 'grid', placeItems: 'center' }}>
                      <GroupsIcon />
                    </Box>
                  </Stack>

                  <Typography sx={{ mt: 4, fontSize: 34, fontWeight: 900, color: 'text.primary', lineHeight: 1.1 }}>
                    Talk to us
                  </Typography>

                  <Divider sx={{ my: 3 }} />
                  <Stack spacing={1.6} sx={{ flex: 1 }}>
                    {orgFeatures.map((feature) => <FeatureRow key={feature}>{feature}</FeatureRow>)}
                  </Stack>

                  <Button fullWidth variant="outlined" sx={{ mt: 3 }} onClick={() => navigate(PAGE_ROUTES.organizationPricing)}>
                    Organisation pricing
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Box sx={{ mt: { xs: 5, md: 8 }, p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: '#061B54', color: '#fff' }}>
            <Stack spacing={1.2} sx={{ maxWidth: 760 }}>
              <Typography variant="h3" sx={{ color: '#fff' }}>Cancellation after a shift is filled</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.78)', lineHeight: 1.7 }}>
                The current ChemistTasker cancellation rules apply after a shift has been filled and confirmed.
              </Typography>
            </Stack>
            <Grid container spacing={2} sx={{ mt: 1.5 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Box sx={{ p: 2.5, borderRadius: 3, bgcolor: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.14)' }}>
                  <Typography sx={{ fontSize: 38, fontWeight: 900 }}>20%</Typography>
                  <Typography sx={{ fontWeight: 800, mt: .5 }}>Within 24 hours</Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,.72)', fontSize: 13, mt: .75, lineHeight: 1.6 }}>
                    Of the total shift wage if cancelled within 24 hours of the shift start time.
                  </Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Box sx={{ p: 2.5, borderRadius: 3, bgcolor: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.14)' }}>
                  <Typography sx={{ fontSize: 38, fontWeight: 900 }}>10%</Typography>
                  <Typography sx={{ fontWeight: 800, mt: .5 }}>Between 24 and 72 hours</Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,.72)', fontSize: 13, mt: .75, lineHeight: 1.6 }}>
                    Of the total shift wage if cancelled between 24 and 72 hours of the shift start time.
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Box>
        </Container>
      </Box>
    </AuthLayout>
  );
}
