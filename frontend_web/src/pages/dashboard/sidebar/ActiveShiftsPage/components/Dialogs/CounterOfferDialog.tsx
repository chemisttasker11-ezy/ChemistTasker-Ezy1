import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    Stack,
    Paper,
    Divider,
    CircularProgress,
    Rating,
    Skeleton,
    Pagination,
} from '@mui/material';
import { CircleAlert, CreditCard, MapPin } from 'lucide-react';
import { InitialsAvatar, Pill } from '../../../../shiftCenter/ShiftCentreParts';

const formatSlotDate = (value?: string | null) =>
    value
        ? new Date(value).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
        : 'Whole shift';

const sectionTitleSx = { fontSize: 14.5, fontWeight: 600, color: 'var(--ct-text-primary)' } as const;

const STATE_CODES = new Set(['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']);

const extractSuburb = (origin?: string | null) => {
    if (!origin) return null;
    const cleaned = origin.replace(/\s+/g, ' ').trim();
    if (!cleaned) return null;
    const commaParts = cleaned.split(',').map((part) => part.trim()).filter(Boolean);
    const candidate = commaParts.length >= 2 ? commaParts[1] : cleaned;
    const tokens = candidate.split(' ').filter(Boolean);
    const stateIndex = tokens.findIndex((token) => STATE_CODES.has(token.toUpperCase()));
    if (stateIndex > 0) {
        const beforeState = tokens.slice(0, stateIndex);
        if (beforeState.length >= 2) return beforeState.slice(-2).join(' ');
        return beforeState.join(' ');
    }
    if (/^\d/.test(tokens[0]) && tokens.length >= 2) {
        return tokens.slice(-2).join(' ');
    }
    return tokens.join(' ') || null;
};

interface CounterOfferDialogProps {
    open: boolean;
    offer: any | null;
    candidate: any | null;
    slotId: number | null;
    workerRatingSummary: any;
    workerRatingComments: any[];
    workerCommentsPage: number;
    workerCommentsPageCount: number;
    counterActionLoading: number | null;
    assignLoading?: boolean;
    assignLabel?: string;
    onClose: () => void;
    onAccept: (offer: any) => void;
    onReject: (offer: any) => void;
    onAssign?: (userId: number, slotId: number | null) => void;
    onPageChange: (_: React.ChangeEvent<unknown>, value: number) => void;
}

export const CounterOfferDialog: React.FC<CounterOfferDialogProps> = ({
    open,
    offer,
    candidate,
    slotId,
    workerRatingSummary,
    workerRatingComments,
    workerCommentsPage,
    workerCommentsPageCount,
    counterActionLoading,
    assignLoading,
    assignLabel,
    onClose,
    onAccept,
    onReject,
    onAssign,
    onPageChange,
}) => {
    const awaitingPayment = Boolean(
        candidate?.awaitingPayment ?? candidate?.awaiting_payment
    );
    const pendingConfirmation = !awaitingPayment && Boolean(
        candidate?.pendingConfirmation ?? candidate?.pending_confirmation
    );
    const offerStatus = String(offer?.status ?? '').toUpperCase();
    const isActionableCounterOffer = Boolean(offer) && !pendingConfirmation && !awaitingPayment && offerStatus === 'PENDING';
    const counterOfferDetails =
        offer ||
        candidate?.pendingConfirmationCounterOffer ||
        candidate?.pending_confirmation_counter_offer ||
        candidate?.awaitingPaymentCounterOffer ||
        candidate?.awaiting_payment_counter_offer ||
        null;
    const rawOrigin =
        (counterOfferDetails as any)?.travel_origin ??
        (counterOfferDetails as any)?.travelOrigin ??
        null;
    const travelSuburb = extractSuburb(rawOrigin);
    const requestTravel = Boolean(
        (counterOfferDetails as any)?.requestTravel ??
        (counterOfferDetails as any)?.request_travel
    );

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>
                {awaitingPayment ? 'Awaiting payment' : pendingConfirmation ? 'Waiting for confirmation' : isActionableCounterOffer ? 'Counter offer' : 'Candidate review'}
            </DialogTitle>
            <DialogContent dividers>
                {candidate || offer ? (
                    <Stack spacing={2}>
                        {/* Candidate Information */}
                        {candidate && (
                            <Stack spacing={1.5}>
                                <Stack direction="row" spacing={1.5} alignItems="center">
                                    <InitialsAvatar name={candidate.name || 'Candidate'} size={44} />
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--ct-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Candidate
                                        </Typography>
                                        <Typography sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 19, color: 'var(--ct-text-primary)', lineHeight: 1.25 }}>
                                            {candidate.name || 'Candidate'}
                                        </Typography>
                                    </Box>
                                </Stack>
                                {candidate.shortBio && (
                                    <Typography sx={{ fontSize: 14, color: 'var(--ct-text-secondary)', lineHeight: 1.55 }}>
                                        {candidate.shortBio}
                                    </Typography>
                                )}
                                {(pendingConfirmation || awaitingPayment) && (
                                    <Stack
                                        direction="row"
                                        spacing={1.25}
                                        alignItems="flex-start"
                                        sx={{
                                            p: 1.5,
                                            borderRadius: '12px',
                                            bgcolor: awaitingPayment ? 'var(--ct-status-red-bg)' : 'var(--ct-status-amber-bg)',
                                            color: awaitingPayment ? 'var(--ct-status-red-fg)' : 'var(--ct-status-amber-fg)',
                                            '& svg': { width: 18, height: 18, flexShrink: 0, mt: '1px' },
                                        }}
                                    >
                                        {awaitingPayment ? <CreditCard /> : <CircleAlert />}
                                        <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: 'inherit', lineHeight: 1.45 }}>
                                            {awaitingPayment
                                                ? 'Candidate confirmed. Payment is required to finalise the booking.'
                                                : 'Offer sent. Waiting for the candidate to confirm.'}
                                        </Typography>
                                    </Stack>
                                )}
                            </Stack>
                        )}

                        {/* Counter-offer details: candidate proposed time/rate/travel before owner accepts. */}
                        {counterOfferDetails && (
                            <>
                                <Typography component="h3" sx={sectionTitleSx}>
                                    Proposed shift terms
                                </Typography>
                                {(() => {
                                    const rawSlots = counterOfferDetails._mappedSlots || counterOfferDetails.slots || [];
                                    const filterId = slotId;
                                    const visible =
                                        filterId == null
                                            ? rawSlots
                                            : rawSlots.filter(
                                                (s: any) =>
                                                    (s.slotId ?? s.slot_id ?? s.slot?.id ?? s.id) === filterId
                                            );
                                    const slotsToRender = visible.length ? visible : rawSlots;
                                    if (!slotsToRender.length) {
                                        return (
                                            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: '12px' }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    No proposed slot details were attached to this counter offer.
                                                </Typography>
                                            </Paper>
                                        );
                                    }
                                    return slotsToRender.map((slot: any, idx: number) => {
                                        const start = (slot.proposedStart ?? slot.proposedStartTime ?? slot.proposed_start_time ?? slot.startTime ?? slot.start_time)?.slice(0, 5);
                                        const end = (slot.proposedEnd ?? slot.proposedEndTime ?? slot.proposed_end_time ?? slot.endTime ?? slot.end_time)?.slice(0, 5);
                                        return (
                                            <Box
                                                key={`${slot.slotId ?? slot.id ?? idx}-${slot.slotDate ?? slot.slot?.date ?? slot.date ?? idx}`}
                                                sx={{ p: 1.5, borderRadius: '12px', border: '1px solid var(--ct-border-color)', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.3fr 1fr 1fr' }, gap: { xs: 0.75, sm: 2 }, alignItems: 'center' }}
                                            >
                                                <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--ct-text-primary)' }}>
                                                    {formatSlotDate(slot.date || slot.slotDate || slot.slot?.date)}
                                                </Typography>
                                                <Box>
                                                    <Typography sx={{ fontSize: 12, color: 'var(--ct-text-muted)' }}>Proposed time</Typography>
                                                    <Typography sx={{ fontSize: 14, fontWeight: 500, color: 'var(--ct-text-primary)' }}>
                                                        {start || 'N/A'} – {end || 'N/A'}
                                                    </Typography>
                                                </Box>
                                                <Box>
                                                    <Typography sx={{ fontSize: 12, color: 'var(--ct-text-muted)' }}>Proposed rate</Typography>
                                                    <Typography sx={{ fontSize: 14, fontWeight: 500, color: 'var(--ct-text-primary)' }}>
                                                        {slot.proposedRate != null ? `$${slot.proposedRate}` : 'N/A'}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        );
                                    });
                                })()}

                                <Stack spacing={0.75}>
                                    <Typography component="h3" sx={sectionTitleSx}>Travel</Typography>
                                    {requestTravel ? (
                                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                                            <Pill tone="blue" label="Travel support requested" />
                                            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'var(--ct-text-secondary)', '& svg': { width: 14, height: 14 } }}>
                                                <MapPin />
                                                <Typography sx={{ fontSize: 13.5, color: 'inherit' }}>
                                                    From {travelSuburb || rawOrigin || 'an unspecified location'}
                                                </Typography>
                                            </Stack>
                                        </Stack>
                                    ) : (
                                        <Typography sx={{ fontSize: 13.5, color: 'var(--ct-text-secondary)' }}>
                                            No travel support requested.
                                        </Typography>
                                    )}
                                </Stack>

                                <Divider />
                            </>
                        )}

                        {/* Ratings & Reviews - Always show if we have candidate info */}
                        <Typography component="h3" sx={sectionTitleSx}>
                            Ratings & reviews
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {workerRatingSummary ? (
                                <>
                                    <Rating
                                        value={workerRatingSummary.average}
                                        precision={0.5}
                                        readOnly
                                    />
                                    <Typography sx={{ fontSize: 14, color: 'var(--ct-text-secondary)' }}>
                                        <Box component="span" sx={{ fontWeight: 600, color: 'var(--ct-text-primary)' }}>{workerRatingSummary.average.toFixed(1)}</Box>
                                        {' '}· {workerRatingSummary.count} {workerRatingSummary.count === 1 ? 'review' : 'reviews'}
                                    </Typography>
                                </>
                            ) : (
                                <Skeleton variant="rectangular" width={200} height={28} />
                            )}
                        </Box>
                        <Box sx={{ display: 'grid', gap: 1.25 }}>
                            {workerRatingComments.map((comment) => (
                                <Paper
                                    key={comment.id}
                                    variant="outlined"
                                    sx={{ p: 1.5, borderRadius: '12px', bgcolor: 'var(--ct-subtle-bg)', borderColor: 'var(--ct-border-color)' }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Rating value={comment.stars} readOnly size="small" />
                                        {comment.createdAt && (
                                            <Typography variant="caption" color="text.secondary">
                                                {new Date(comment.createdAt).toLocaleDateString()}
                                            </Typography>
                                        )}
                                    </Box>
                                    {comment.comment && (
                                        <Typography variant="body2" sx={{ mt: 0.5 }}>
                                            {comment.comment}
                                        </Typography>
                                    )}
                                </Paper>
                            ))}
                            {workerRatingComments.length === 0 && (
                                <Typography variant="body2" color="text.secondary">
                                    No reviews yet.
                                </Typography>
                            )}
                            {workerCommentsPageCount > 1 && (
                                <Box display="flex" justifyContent="center" mt={1}>
                                    <Pagination
                                        count={workerCommentsPageCount}
                                        page={workerCommentsPage}
                                        onChange={onPageChange}
                                        color="primary"
                                        size="small"
                                    />
                                </Box>
                            )}
                        </Box>
                    </Stack>
                ) : (
                    <Typography color="text.secondary">No candidate information available.</Typography>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
                {!offer && !pendingConfirmation && !awaitingPayment && onAssign && candidate?.userId != null && (
                    <Button
                        variant="contained"
                        color="success"
                        onClick={() => onAssign(candidate.userId, slotId)}
                        disabled={assignLoading}
                        startIcon={
                            assignLoading ? (
                                <CircularProgress size={16} color="inherit" />
                            ) : undefined
                        }
                    >
                        {assignLabel || 'Assign to Shift'}
                    </Button>
                )}
                {isActionableCounterOffer && (
                    <>
                        <Button
                            variant="contained"
                            color="success"
                            onClick={() => onAccept(offer)}
                            disabled={counterActionLoading === offer.id}
                            startIcon={
                                counterActionLoading === offer.id ? (
                                    <CircularProgress size={16} color="inherit" />
                                ) : undefined
                            }
                        >
                            Accept offer
                        </Button>
                        <Button
                            variant="outlined"
                            color="error"
                            onClick={() => onReject(offer)}
                            disabled={counterActionLoading === offer.id}
                        >
                            Reject offer
                        </Button>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
};
