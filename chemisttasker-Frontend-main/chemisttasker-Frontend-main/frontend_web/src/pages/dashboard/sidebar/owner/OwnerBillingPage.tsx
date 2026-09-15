import { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    CircularProgress,
    Divider,
    FormControl,
    FormControlLabel,
    FormLabel,
    Grid,
    Paper,
    Radio,
    RadioGroup,
    Stack,
    TextField,
    Typography,
    styled,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { createSubscriptionCheckout } from '@chemisttasker/shared-core';
import { useToast } from '../../../../contexts/ToastContext';
import apiClient from '../../../../utils/apiClient';
import TopBar from './TopBar';
import { useSearchParams } from 'react-router-dom';

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

type SubscriptionState = {
    exists: boolean;
    active: boolean;
    status: string;
    staffCount: number;
    extraSeatCount: number;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: string | null;
    accountName?: string;
};

type View = 'plans' | 'subscribe' | 'manage';

const defaultSubscription: SubscriptionState = {
    exists: false,
    active: false,
    status: 'inactive',
    staffCount: 5,
    extraSeatCount: 0,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    currentPeriodEnd: null,
    accountName: '',
};

export default function OwnerBillingPage({ onBack, totalPharmacies }: { onBack: () => void; totalPharmacies: number }) {
    const { showToast } = useToast();
    const [searchParams] = useSearchParams();

    const [view, setView] = useState<View>('plans');
    const [paymentMethod, setPaymentMethod] = useState<'card' | 'invoice'>('card');
    const [subscription, setSubscription] = useState<SubscriptionState>(defaultSubscription);
    const [targetStaffCount, setTargetStaffCount] = useState<number>(5);
    const [targetExtraSeats, setTargetExtraSeats] = useState<number>(0);
    const [loading, setLoading] = useState(false);
    const [loadingSubscription, setLoadingSubscription] = useState(true);
    const seatsOnlyMode = searchParams.get('mode') === 'seats';

    const loadSubscription = async () => {
        setLoadingSubscription(true);
        try {
            const { data: res }: any = await apiClient.get('/billing/subscription/');
            const normalized: SubscriptionState = {
                exists: !!res.exists,
                active: !!res.active,
                status: res.status || 'inactive',
                staffCount: res.staffCount ?? 5,
                extraSeatCount: res.extraSeatCount ?? Math.max(0, (res.staffCount ?? 5) - 5),
                stripeCustomerId: res.stripeCustomerId ?? null,
                stripeSubscriptionId: res.stripeSubscriptionId ?? null,
                currentPeriodEnd: res.currentPeriodEnd ?? null,
                accountName: res.accountName ?? '',
            };
            setSubscription(normalized);
            setTargetStaffCount(Math.max(normalized.staffCount, 5));
            setTargetExtraSeats(Math.max(normalized.extraSeatCount, 0));
            if (seatsOnlyMode) {
                setView(normalized.active ? 'manage' : 'subscribe');
            } else {
                setView(normalized.active ? 'manage' : 'plans');
            }
        } catch (err: any) {
            showToast(err?.message || 'Failed to load subscription.', 'error');
        } finally {
            setLoadingSubscription(false);
        }
    };

    useEffect(() => {
        void loadSubscription();
        const query = new URLSearchParams(window.location.search);
        const checkout = query.get('checkout');
        if (checkout === 'success') {
            showToast('Stripe checkout completed. Syncing your subscription now.', 'success');
        } else if (checkout === 'cancel') {
            showToast('Stripe checkout was cancelled.', 'warning');
        } else if (checkout === 'seat_success') {
            showToast('Extra seat checkout completed. Syncing your subscription now.', 'success');
        } else if (checkout === 'seat_cancel') {
            showToast('Extra seat checkout was cancelled.', 'warning');
        }
    }, []);

    const handleSubscribe = async () => {
        setLoading(true);
        try {
            const res: any = await createSubscriptionCheckout({
                staffCount: 5,
                paymentMethod,
            });

            if (res.url) {
                window.location.href = res.url;
                return;
            }

            if (res.message) {
                showToast(res.message, 'success');
                await loadSubscription();
                return;
            }

            showToast('Unexpected response from server.', 'error');
        } catch (err: any) {
            showToast(err?.message || 'Failed to initialize subscription.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSeatUpdate = async () => {
        const desiredStaffCount = 5 + Math.max(targetExtraSeats, 0);
        if (desiredStaffCount < 5) {
            showToast('Minimum staff count is 5.', 'warning');
            return;
        }
        if (desiredStaffCount === subscription.staffCount) {
            showToast('No seat change detected.', 'info');
            return;
        }

        setLoading(true);
        try {
            const { data: res }: any = await apiClient.post('/billing/subscription/seats/', {
                staff_count: desiredStaffCount,
            });
            if (res.url) {
                window.location.href = res.url;
                return;
            }
            showToast(res.message || 'Redirecting to Stripe checkout.', 'success');
        } catch (err: any) {
            showToast(err?.message || 'Failed to update subscription seats.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const calculateTotal = useMemo(() => {
        const basePrice = 30;
        const extraStaff = subscription.active ? Math.max(0, targetExtraSeats) : 0;
        return basePrice + extraStaff * 5;
    }, [subscription.active, targetExtraSeats, targetStaffCount]);

    const nextInvoiceText = subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
        : 'Not available yet';

    if (loadingSubscription) {
        return (
            <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 4 }, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (view === 'plans') {
        return (
            <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 4 } }}>
                <TopBar onBack={onBack} breadcrumb={['Billing & Subscription']} />

                <Box sx={{ maxWidth: 1000, mx: 'auto', mt: 4 }}>
                    <Typography variant="h4" fontWeight={800} gutterBottom textAlign="center">
                        Choose Your Plan
                    </Typography>
                    <Typography variant="body1" color="text.secondary" paragraph textAlign="center" sx={{ mb: 6 }}>
                        Select the plan that best fits your pharmacy's needs.
                    </Typography>

                    {!subscription.active && subscription.exists && subscription.stripeCustomerId && !subscription.stripeSubscriptionId && (
                        <Alert severity="warning" sx={{ mb: 4 }}>
                            A Stripe customer exists, but your subscription has not been activated locally yet. Make sure your webhook listener is running and then refresh this page.
                        </Alert>
                    )}

                    <Grid container spacing={4} justifyContent="center" alignItems="stretch">
                        <Grid size={{ xs: 12, md: 5 }}>
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

                                    <Button variant="outlined" color="primary" fullWidth disabled sx={{ py: 1.5, borderRadius: 2, fontWeight: 'bold' }}>
                                        Current Plan
                                    </Button>
                                </CardContent>
                            </PricingCard>
                        </Grid>

                        <Grid size={{ xs: 12, md: 5 }}>
                            <PricingCard sx={{ border: '2px solid #00a99d' }}>
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

                                    <Button
                                        variant="contained"
                                        color="primary"
                                        fullWidth
                                        onClick={() => setView('subscribe')}
                                        sx={{ py: 1.5, borderRadius: 2, fontWeight: 'bold' }}
                                    >
                                        Subscribe & Save
                                    </Button>
                                </CardContent>
                            </PricingCard>
                        </Grid>
                    </Grid>
                </Box>
            </Box>
        );
    }

    if (view === 'subscribe') {
        return (
            <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 4 } }}>
                <TopBar onBack={() => setView('plans')} breadcrumb={['Billing & Subscription', 'Setup']} />

                <Box sx={{ maxWidth: 800, mx: 'auto', mt: 4 }}>
                    <Typography variant="h4" fontWeight={800} gutterBottom>
                        Setup Subscription
                    </Typography>
                <Typography variant="body1" color="text.secondary" paragraph>
                    Your subscription gives you access to full featured tools and locum booking for all your pharmacies.
                </Typography>

                {seatsOnlyMode && (
                    <Alert severity="info" sx={{ mb: 3 }}>
                        You opened billing from your profile section. Complete the base subscription first, then this page will switch to seat management only.
                    </Alert>
                )}

                    <Card sx={{ mt: 4, borderRadius: 3, boxShadow: 3 }}>
                        <CardContent sx={{ p: 4 }}>
                            <Typography variant="h6" fontWeight={700} gutterBottom>
                                Plan Details
                            </Typography>
                            <Divider sx={{ mb: 3 }} />

                            <Stack spacing={4}>
                                <Paper sx={{ p: 3, bgcolor: 'background.default', borderRadius: 2 }}>
                                    <Stack spacing={1}>
                                        <Typography variant="subtitle1" fontWeight={700}>Base subscription</Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            The owner subscription is a fixed base plan: $30/month and 5 included seats.
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Extra seats are purchased later as a separate $5/month add-on product.
                                        </Typography>
                                    </Stack>
                                </Paper>

                                <Box>
                                    <FormControl component="fieldset">
                                        <FormLabel component="legend" sx={{ fontWeight: 600, color: 'text.primary', mb: 1 }}>
                                            Payment Method
                                        </FormLabel>
                                        <RadioGroup value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as 'card' | 'invoice')}>
                                            <FormControlLabel
                                                value="card"
                                                control={<Radio />}
                                                label={
                                                    <Box>
                                                        <Typography fontWeight={500}>Credit/Debit Card</Typography>
                                                        <Typography variant="caption" color="text.secondary">Instant activation via Stripe secure checkout</Typography>
                                                    </Box>
                                                }
                                                sx={{ mb: 1 }}
                                            />
                                            <FormControlLabel
                                                value="invoice"
                                                control={<Radio />}
                                                label={
                                                    <Box>
                                                        <Typography fontWeight={500}>Invoice</Typography>
                                                        <Typography variant="caption" color="text.secondary">We will email you an invoice with 7-day payment terms</Typography>
                                                    </Box>
                                                }
                                            />
                                        </RadioGroup>
                                    </FormControl>
                                </Box>

                                <Paper sx={{ p: 3, bgcolor: 'background.default', borderRadius: 2 }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Typography variant="h6" fontWeight={600}>Total / Month:</Typography>
                                        <Typography variant="h5" fontWeight={800} color="primary">${calculateTotal} AUD</Typography>
                                    </Stack>
                                </Paper>

                                <Button
                                    variant="contained"
                                    color="primary"
                                    size="large"
                                    fullWidth
                                    disabled={loading || targetStaffCount < 5}
                                    onClick={handleSubscribe}
                                    sx={{ py: 1.5, fontSize: '1.1rem', fontWeight: 700 }}
                                >
                                    {loading ? <CircularProgress size={28} color="inherit" /> : `Subscribe with ${paymentMethod === 'card' ? 'Card' : 'Invoice'}`}
                                </Button>
                            </Stack>
                        </CardContent>
                    </Card>
                </Box>
            </Box>
        );
    }

    return (
        <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 4 } }}>
            <TopBar onBack={onBack} breadcrumb={['Billing & Subscription']} />

            <Box sx={{ maxWidth: 900, mx: 'auto', mt: 4 }}>
                <Typography variant="h4" fontWeight={800} gutterBottom>
                    Manage Subscription
                </Typography>
                <Typography variant="body1" color="text.secondary" paragraph>
                    Your owner subscription is active for all {totalPharmacies} pharmacies under this billing account.
                </Typography>

                <Stack spacing={3}>
                    <Alert severity="success">
                        Subscription is active. Use the controls below to buy extra staff seats using your separate recurring add-on product.
                    </Alert>

                    <Card sx={{ borderRadius: 3, boxShadow: 3 }}>
                        <CardContent sx={{ p: 4 }}>
                            <Stack spacing={3}>
                                {!seatsOnlyMode && (
                                    <>
                                        <Box>
                                            <Typography variant="h6" fontWeight={700}>Current Subscription</Typography>
                                            <Typography color="text.secondary">
                                                Billing account: <strong>{subscription.accountName || 'Owner account'}</strong>
                                            </Typography>
                                        </Box>

                                        <Divider />

                                        <Grid container spacing={3}>
                                            <Grid size={{ xs: 12, md: 4 }}>
                                                <Paper sx={{ p: 3, borderRadius: 2 }}>
                                                    <Typography variant="subtitle2" color="text.secondary">Status</Typography>
                                                    <Typography variant="h6" fontWeight={800} color="primary.main">
                                                        {subscription.status}
                                                    </Typography>
                                                </Paper>
                                            </Grid>
                                            <Grid size={{ xs: 12, md: 4 }}>
                                                <Paper sx={{ p: 3, borderRadius: 2 }}>
                                                    <Typography variant="subtitle2" color="text.secondary">Staff seats</Typography>
                                                    <Typography variant="h6" fontWeight={800}>
                                                        {subscription.staffCount}
                                                    </Typography>
                                                </Paper>
                                            </Grid>
                                            <Grid size={{ xs: 12, md: 4 }}>
                                                <Paper sx={{ p: 3, borderRadius: 2 }}>
                                                    <Typography variant="subtitle2" color="text.secondary">Extra seats</Typography>
                                                    <Typography variant="h6" fontWeight={800}>
                                                        {subscription.extraSeatCount}
                                                    </Typography>
                                                </Paper>
                                            </Grid>
                                        </Grid>

                                        <Paper sx={{ p: 3, bgcolor: 'background.default', borderRadius: 2 }}>
                                            <Stack spacing={1}>
                                                <Typography variant="subtitle1" fontWeight={700}>Renewal details</Typography>
                                                <Typography color="text.secondary">Next period end: {nextInvoiceText}</Typography>
                                                <Typography color="text.secondary">Stripe subscription ID: {subscription.stripeSubscriptionId || 'Not synced yet'}</Typography>
                                            </Stack>
                                        </Paper>
                                    </>
                                )}

                                <Box>
                                    <Typography variant="h6" fontWeight={700} gutterBottom>
                                        Buy extra seats
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        Base plan includes 5 staff seats. Each extra seat is billed at $5/month using your separate Stripe add-on product.
                                    </Typography>
                                    <TextField
                                        type="number"
                                        size="small"
                                        label="Extra seats"
                                        value={targetExtraSeats}
                                        onChange={(e) => setTargetExtraSeats(Math.max(parseInt(e.target.value, 10) || 0, 0))}
                                        inputProps={{ min: 0 }}
                                        sx={{ width: 180, mt: 1 }}
                                    />
                                </Box>

                                <Paper sx={{ p: 3, bgcolor: 'background.default', borderRadius: 2 }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Typography variant="h6" fontWeight={600}>New monthly total:</Typography>
                                        <Typography variant="h5" fontWeight={800} color="primary">
                                            ${calculateTotal} AUD
                                        </Typography>
                                    </Stack>
                                </Paper>

                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                    <Button variant="contained" onClick={handleSeatUpdate} disabled={loading || targetExtraSeats < 1}>
                                        {loading ? <CircularProgress size={24} color="inherit" /> : 'Buy Extra Seats'}
                                    </Button>
                                    <Button variant="outlined" onClick={loadSubscription} disabled={loading}>
                                        Refresh Status
                                    </Button>
                                </Stack>
                            </Stack>
                        </CardContent>
                    </Card>
                </Stack>
            </Box>
        </Box>
    );
}
