import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    IconButton,
    Paper,
    Stack,
    Typography,
} from '@mui/material';
import { ArrowLeft, Check, CreditCard, Minus, Plus, ReceiptText, RefreshCw, Users } from 'lucide-react';
import { createSubscriptionCheckout } from '@chemisttasker/shared-core';
import { useToast } from '../../../../contexts/ToastContext';
import apiClient from '../../../../utils/apiClient';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../../../components/ui/PageHeader';
import IconTile from '../../../../components/ui/IconTile';
import DashboardContentState from '../../../../components/dashboard/DashboardContentState';
import { Pill } from '../../shiftCenter/ShiftCentreParts';

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

const cardSx = { borderRadius: 'var(--ct-card-radius)', borderColor: 'var(--ct-border-color)', bgcolor: 'var(--ct-surface-bg)' } as const;
const priceSx = { fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: { xs: 36, md: 40 }, lineHeight: 1.1, color: 'var(--ct-text-primary)' } as const;
const titleSx = { fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 20, color: 'var(--ct-text-primary)' } as const;

function Feature({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
    return (
        <Stack direction="row" spacing={1.25} alignItems="flex-start" component="li" sx={{ listStyle: 'none' }}>
            <Box sx={{ mt: '2px', color: muted ? 'var(--ct-text-muted)' : 'var(--ct-accent-strong)', display: 'flex' }} aria-hidden>
                <Check size={18} strokeWidth={2.25} />
            </Box>
            <Typography sx={{ color: muted ? 'var(--ct-text-secondary)' : 'var(--ct-text-primary)', fontSize: 15 }}>{children}</Typography>
        </Stack>
    );
}

function PaymentOption({ selected, onSelect, icon, title, body }: { selected: boolean; onSelect: () => void; icon: ReactNode; title: string; body: string }) {
    return (
        <Box
            component="label"
            sx={{
                display: 'flex', gap: 1.5, alignItems: 'flex-start', p: 2, cursor: 'pointer', flex: 1,
                borderRadius: '14px',
                border: selected ? '2px solid var(--ct-accent-strong)' : '1px solid var(--ct-border-color)',
                m: selected ? 0 : '1px',
                bgcolor: selected ? 'var(--ct-tone-violet-bg)' : 'var(--ct-surface-bg)',
                '&:has(input:focus-visible)': { outline: '2px solid var(--ct-accent-strong)', outlineOffset: 2 },
            }}
        >
            <input type="radio" name="payment-method" checked={selected} onChange={onSelect} style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
            <IconTile icon={icon} size={40} />
            <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600, color: 'var(--ct-text-primary)' }}>{title}</Typography>
                <Typography variant="body2" sx={{ color: selected ? 'var(--ct-text-primary)' : 'var(--ct-text-secondary)' }}>{body}</Typography>
            </Box>
        </Box>
    );
}

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
    const [loadFailed, setLoadFailed] = useState(false);
    const [loadedOnce, setLoadedOnce] = useState(false);
    const seatsOnlyMode = searchParams.get('mode') === 'seats';

    const loadSubscription = async () => {
        setLoadingSubscription(true);
        setLoadFailed(false);
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
            setLoadedOnce(true);
            setTargetStaffCount(Math.max(normalized.staffCount, 5));
            setTargetExtraSeats(Math.max(normalized.extraSeatCount, 0));
            if (seatsOnlyMode) {
                setView(normalized.active ? 'manage' : 'subscribe');
            } else {
                setView(normalized.active ? 'manage' : 'plans');
            }
        } catch {
            setLoadFailed(true);
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

    const renewal = subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
        : null;
    const seatsChanged = targetExtraSeats !== subscription.extraSeatCount;
    const backButton = (onClick: () => void, label: string) => (
        <Button variant="outlined" onClick={onClick} startIcon={<ArrowLeft size={16} />} sx={{ minHeight: 40 }}>{label}</Button>
    );

    if (loadingSubscription && !loadedOnce) {
        return (
            <Box>
                <PageHeader title="Billing & subscription" />
                <DashboardContentState kind="loading" title="Loading your subscription" />
            </Box>
        );
    }

    if (loadFailed && !loadedOnce) {
        return (
            <Box>
                <PageHeader title="Billing & subscription" actions={backButton(onBack, 'Back to overview')} />
                <DashboardContentState
                    kind="error"
                    title="We couldn't load your subscription"
                    description="Your plan hasn't changed. Check your connection and try again."
                    actionLabel="Try again"
                    onAction={() => void loadSubscription()}
                />
            </Box>
        );
    }

    if (view === 'plans') {
        const pendingActivation = !subscription.active && subscription.exists && subscription.stripeCustomerId && !subscription.stripeSubscriptionId;
        return (
            <Box>
                <PageHeader
                    title="Billing & subscription"
                    subtitle="Pay only when a shift is filled, or subscribe to halve your fees and connect your own team."
                    actions={backButton(onBack, 'Back to overview')}
                />

                {pendingActivation && (
                    <Alert
                        severity="warning"
                        sx={{ mb: 2.5 }}
                        action={<Button color="inherit" size="small" onClick={() => void loadSubscription()} disabled={loadingSubscription}>Check again</Button>}
                    >
                        Your payment details are saved, but the subscription isn't active yet. This usually takes a minute.
                    </Alert>
                )}

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2.5, maxWidth: 980 }}>
                    <Paper variant="outlined" sx={{ ...cardSx, p: { xs: 2.5, md: 3.5 }, display: 'flex', flexDirection: 'column' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                            <Typography component="h2" sx={titleSx}>Pay as you go</Typography>
                            <Pill tone="neutral" label="Current plan" />
                        </Stack>
                        <Typography color="text.secondary" sx={{ mt: 0.75 }}>For occasional cover. You pay only when a shift is filled.</Typography>
                        <Typography sx={{ ...priceSx, mt: 2.5 }}>$0 <Box component="span" sx={{ fontSize: 16, color: 'var(--ct-text-secondary)', fontFamily: 'var(--ct-font-body)' }}>/ month</Box></Typography>
                        <Typography sx={{ mt: 2.5, mb: 1.25, fontWeight: 600, color: 'var(--ct-text-primary)' }}>Fees when a shift is filled</Typography>
                        <Stack component="ul" spacing={1.25} sx={{ p: 0, m: 0 }}>
                            <Feature><strong>$30</strong> per locum shift</Feature>
                            <Feature><strong>$80</strong> per part-time or full-time job</Feature>
                            <Feature muted>No fee if the shift goes unfilled</Feature>
                        </Stack>
                    </Paper>

                    <Paper variant="outlined" sx={{ ...cardSx, p: { xs: 2.5, md: 3.5 }, display: 'flex', flexDirection: 'column', borderWidth: 2, borderColor: 'var(--ct-accent-strong)' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                            <Typography component="h2" sx={titleSx}>Owner subscription</Typography>
                            <Pill tone="violet" label="Recommended" />
                        </Stack>
                        <Typography color="text.secondary" sx={{ mt: 0.75 }}>For active pharmacies. Half price on every filled public shift.</Typography>
                        <Typography sx={{ ...priceSx, mt: 2.5 }}>$30 <Box component="span" sx={{ fontSize: 16, color: 'var(--ct-text-secondary)', fontFamily: 'var(--ct-font-body)' }}>/ month</Box></Typography>
                        <Typography sx={{ mt: 2.5, mb: 1.25, fontWeight: 600, color: 'var(--ct-text-primary)' }}>Includes</Typography>
                        <Stack component="ul" spacing={1.25} sx={{ p: 0, m: 0, flex: 1 }}>
                            <Feature>Connect up to <strong>5 internal staff</strong> per pharmacy</Feature>
                            <Feature><strong>$5</strong> a month per extra staff member</Feature>
                            <Feature><strong>50% off public shift fees</strong>: $15 per locum shift, $40 per part-time or full-time job</Feature>
                        </Stack>
                        <Button variant="contained" size="large" fullWidth onClick={() => setView('subscribe')} sx={{ mt: 3, minHeight: 48 }}>
                            Subscribe and save
                        </Button>
                    </Paper>
                </Box>
            </Box>
        );
    }

    if (view === 'subscribe') {
        return (
            <Box>
                <PageHeader
                    title="Set up your subscription"
                    subtitle="Covers locum booking and team tools for all your pharmacies."
                    actions={backButton(() => setView('plans'), 'Back to plans')}
                />

                {seatsOnlyMode && (
                    <Alert severity="info" sx={{ mb: 2.5, maxWidth: 760 }}>
                        Start the base subscription first. You can then add staff seats on this page.
                    </Alert>
                )}

                <Paper variant="outlined" sx={{ ...cardSx, p: { xs: 2.5, md: 3.5 }, maxWidth: 760 }}>
                    <Stack spacing={3}>
                        <Box>
                            <Typography component="h2" sx={titleSx}>Base subscription</Typography>
                            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                                $30 a month with 5 staff seats included. Extra seats are $5 a month each, added once you're subscribed.
                            </Typography>
                        </Box>

                        <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
                            <Typography component="legend" sx={{ fontWeight: 600, color: 'var(--ct-text-primary)', mb: 1.25 }}>How would you like to pay?</Typography>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                                <PaymentOption selected={paymentMethod === 'card'} onSelect={() => setPaymentMethod('card')} icon={<CreditCard />} title="Card" body="Active straight away through Stripe's secure checkout." />
                                <PaymentOption selected={paymentMethod === 'invoice'} onSelect={() => setPaymentMethod('invoice')} icon={<ReceiptText />} title="Invoice" body="We email an invoice with 7-day payment terms." />
                            </Stack>
                        </Box>

                        <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ p: 2, borderRadius: '14px', bgcolor: 'var(--ct-subtle-bg)' }}>
                            <Typography sx={{ fontWeight: 600, color: 'var(--ct-text-primary)' }}>Monthly total</Typography>
                            <Typography sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 26, color: 'var(--ct-accent-strong)' }}>${calculateTotal} AUD</Typography>
                        </Stack>

                        <Button
                            variant="contained"
                            size="large"
                            fullWidth
                            disabled={loading || targetStaffCount < 5}
                            onClick={handleSubscribe}
                            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : undefined}
                            sx={{ minHeight: 48 }}
                        >
                            {paymentMethod === 'card' ? 'Continue to card payment' : 'Subscribe by invoice'}
                        </Button>
                    </Stack>
                </Paper>
            </Box>
        );
    }

    const statusLabel = subscription.active ? 'Active' : subscription.status.replaceAll('_', ' ');
    return (
        <Box>
            <PageHeader
                title={seatsOnlyMode ? 'Staff seats' : 'Billing & subscription'}
                subtitle={`Your owner subscription covers all ${totalPharmacies} ${totalPharmacies === 1 ? 'pharmacy' : 'pharmacies'} on this account.`}
                actions={
                    <Stack direction="row" spacing={1}>
                        <Button variant="outlined" onClick={() => void loadSubscription()} disabled={loadingSubscription || loading} startIcon={loadingSubscription ? <CircularProgress size={16} color="inherit" /> : <RefreshCw size={16} />} sx={{ minHeight: 40 }}>
                            Refresh
                        </Button>
                        {backButton(onBack, 'Back')}
                    </Stack>
                }
            />

            {loadFailed && (
                <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setLoadFailed(false)}>We couldn't refresh your subscription. Showing the last details we had.</Alert>
            )}

            <Stack spacing={2.5} sx={{ maxWidth: 980 }} aria-busy={loadingSubscription}>
                {!seatsOnlyMode && (
                    <Paper variant="outlined" sx={{ ...cardSx, p: { xs: 2.5, md: 3 } }}>
                        <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography component="h2" sx={titleSx}>Owner subscription</Typography>
                            <Pill tone={subscription.active ? 'green' : 'amber'} label={statusLabel} />
                        </Stack>
                        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                            Billing account: <Box component="strong" sx={{ color: 'var(--ct-text-primary)', fontWeight: 600 }}>{subscription.accountName || 'Owner account'}</Box>
                        </Typography>
                        <Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
                            {[
                                ['Staff seats', String(subscription.staffCount), subscription.extraSeatCount > 0 ? `5 included + ${subscription.extraSeatCount} extra` : '5 included'],
                                ['Renews', renewal ?? 'Not set yet', renewal ? 'Next billing date' : 'Appears after the first payment'],
                                ['Monthly total', `$${30 + subscription.extraSeatCount * 5}`, 'AUD, before shift fees'],
                            ].map(([label, value, hint]) => (
                                <Box key={label} sx={{ p: 2, borderRadius: '14px', border: '1px solid var(--ct-border-color)' }}>
                                    <Typography variant="body2" color="text.secondary">{label}</Typography>
                                    <Typography sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 24, color: 'var(--ct-text-primary)' }}>{value}</Typography>
                                    <Typography variant="body2" color="text.secondary">{hint}</Typography>
                                </Box>
                            ))}
                        </Box>
                        {subscription.stripeSubscriptionId && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                                Reference for support: {subscription.stripeSubscriptionId}
                            </Typography>
                        )}
                    </Paper>
                )}

                <Paper variant="outlined" sx={{ ...cardSx, p: { xs: 2.5, md: 3 } }}>
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                        <IconTile icon={<Users />} size={44} />
                        <Box sx={{ minWidth: 0 }}>
                            <Typography component="h2" sx={titleSx}>Extra staff seats</Typography>
                            <Typography color="text.secondary" sx={{ mt: 0.25 }}>
                                5 seats are included. Each extra seat is $5 a month, so you can connect more of your own staff.
                            </Typography>
                        </Box>
                    </Stack>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} alignItems={{ sm: 'center' }} sx={{ mt: 2.5 }}>
                        <Box>
                            <Typography id="extra-seats-label" variant="body2" sx={{ fontWeight: 600, color: 'var(--ct-text-primary)', mb: 0.75 }}>Extra seats</Typography>
                            <Stack direction="row" alignItems="center" spacing={1} role="group" aria-labelledby="extra-seats-label">
                                <IconButton aria-label="One fewer extra seat" onClick={() => setTargetExtraSeats((n) => Math.max(n - 1, 0))} disabled={loading || targetExtraSeats <= 0} sx={{ width: 44, height: 44, border: '1px solid var(--ct-border-color)' }}>
                                    <Minus size={18} />
                                </IconButton>
                                <Typography aria-live="polite" sx={{ minWidth: 40, textAlign: 'center', fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 26, color: 'var(--ct-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                    {targetExtraSeats}
                                </Typography>
                                <IconButton aria-label="One more extra seat" onClick={() => setTargetExtraSeats((n) => n + 1)} disabled={loading} sx={{ width: 44, height: 44, border: '1px solid var(--ct-border-color)' }}>
                                    <Plus size={18} />
                                </IconButton>
                            </Stack>
                        </Box>
                        <Box sx={{ flex: 1, p: 2, borderRadius: '14px', bgcolor: 'var(--ct-subtle-bg)' }}>
                            <Typography variant="body2" color="text.secondary">New monthly total</Typography>
                            <Typography sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 26, color: 'var(--ct-accent-strong)' }}>${calculateTotal} AUD</Typography>
                            <Typography variant="body2" color="text.secondary">$30 base + {targetExtraSeats} × $5 · {5 + targetExtraSeats} seats in total</Typography>
                        </Box>
                    </Stack>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mt: 2.5 }}>
                        <Button
                            variant="contained"
                            onClick={handleSeatUpdate}
                            disabled={loading || targetExtraSeats < 1 || !seatsChanged}
                            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
                            sx={{ minHeight: 44 }}
                        >
                            {seatsChanged ? `Change to ${targetExtraSeats} extra ${targetExtraSeats === 1 ? 'seat' : 'seats'}` : 'Change extra seats'}
                        </Button>
                        <Typography variant="body2" color="text.secondary">
                            {seatsChanged ? 'You will confirm the change on Stripe\'s secure checkout.' : 'Use + and − to choose how many extra seats you need.'}
                        </Typography>
                    </Stack>
                </Paper>
            </Stack>
        </Box>
    );
}
