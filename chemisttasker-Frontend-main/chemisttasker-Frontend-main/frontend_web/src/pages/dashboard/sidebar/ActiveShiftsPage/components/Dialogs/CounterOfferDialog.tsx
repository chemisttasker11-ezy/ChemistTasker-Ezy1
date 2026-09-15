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
    Chip,
    CircularProgress,
    Rating,
    Skeleton,
    Pagination,
} from '@mui/material';

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
            <DialogTitle sx={{ fontWeight: 'bold' }}>
                {awaitingPayment ? 'Awaiting Payment' : pendingConfirmation ? 'Pending Confirmation' : isActionableCounterOffer ? 'Counter Offer' : 'Candidate Review'}
            </DialogTitle>
            <DialogContent dividers>
                {candidate || offer ? (
                    <Stack spacing={1.5}>
                        {/* Candidate Information */}
                        {candidate && (
                            <Box sx={{ mb: 1 }}>
                                <Typography variant="subtitle2">Candidate</Typography>
                                <Typography variant="body2" fontWeight={600}>
                                    {candidate.name || 'Candidate'}
                                </Typography>
                                {candidate.shortBio && (
                                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                                        {candidate.shortBio}
                                    </Typography>
                                )}
                                {pendingConfirmation && (
                                    <Chip
                                        label="Offer sent. Waiting for candidate confirmation."
                                        size="small"
                                        color="warning"
                                        sx={{ mt: 1, fontWeight: 700 }}
                                    />
                                )}
                                {awaitingPayment && (
                                    <Chip
                                        label="Candidate confirmed. Payment is required to finalize."
                                        size="small"
                                        color="error"
                                        sx={{ mt: 1, fontWeight: 700 }}
                                    />
                                )}
                            </Box>
                        )}

                        {/* Counter-offer details: candidate proposed time/rate/travel before owner accepts. */}
                        {counterOfferDetails && (
                            <>
                                <Typography variant="subtitle1" fontWeight="bold">
                                    Proposed Shift Terms
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
                                            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    No proposed slot details were attached to this counter offer.
                                                </Typography>
                                            </Paper>
                                        );
                                    }
                                    return slotsToRender.map((slot: any, idx: number) => (
                                        <Paper
                                            key={`${slot.slotId ?? slot.id ?? idx}-${slot.slotDate ?? slot.slot?.date ?? slot.date ?? idx
                                                }`}
                                            variant="outlined"
                                            sx={{ p: 1.5, borderRadius: 2 }}
                                        >
                                            <Typography variant="body2" fontWeight="bold">
                                                {slot.date || slot.slotDate || slot.slot?.date
                                                    ? new Date(
                                                        slot.date || slot.slotDate || slot.slot?.date!
                                                    ).toLocaleDateString()
                                                    : 'Shift-wide'}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Proposed time:{' '}
                                                {(
                                                    slot.proposedStart ??
                                                    slot.proposedStartTime ??
                                                    slot.proposed_start_time ??
                                                    slot.startTime ??
                                                    slot.start_time
                                                )?.slice(0, 5) || 'N/A'}{' '}
                                                -{' '}
                                                {(
                                                    slot.proposedEnd ??
                                                    slot.proposedEndTime ??
                                                    slot.proposed_end_time ??
                                                    slot.endTime ??
                                                    slot.end_time
                                                )?.slice(0, 5) || 'N/A'}
                                            </Typography>
                                            {slot.proposedRate != null ? (
                                                <Typography variant="body2" color="text.secondary">
                                                    Proposed rate: ${slot.proposedRate}
                                                </Typography>
                                            ) : (
                                                <Typography variant="body2" color="text.secondary">
                                                    Proposed rate: N/A
                                                </Typography>
                                            )}
                                        </Paper>
                                    ));
                                })()}

                                <Stack spacing={0.5}>
                                    <Typography variant="subtitle2">Travel</Typography>
                                    {requestTravel ? (
                                        <>
                                            <Chip size="small" color="info" label="Requested travel support" sx={{ alignSelf: 'flex-start' }} />
                                            <Typography variant="body2" color="text.secondary">
                                                Traveling from: {travelSuburb || rawOrigin || 'Location not provided'}
                                            </Typography>
                                        </>
                                    ) : (
                                        <Typography variant="body2" color="text.secondary">
                                            No travel support requested.
                                        </Typography>
                                    )}
                                </Stack>

                                <Divider sx={{ my: 2 }} />
                            </>
                        )}

                        {/* Ratings & Reviews - Always show if we have candidate info */}
                        <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                            Ratings & Reviews
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            {workerRatingSummary ? (
                                <>
                                    <Rating
                                        value={workerRatingSummary.average}
                                        precision={0.5}
                                        readOnly
                                    />
                                    <Typography variant="body1" color="text.secondary">
                                        {workerRatingSummary.average.toFixed(1)} (
                                        {workerRatingSummary.count} reviews)
                                    </Typography>
                                </>
                            ) : (
                                <Skeleton variant="rectangular" width={200} height={28} />
                            )}
                        </Box>
                        <Box sx={{ display: 'grid', gap: 1.5, mt: 2 }}>
                            {workerRatingComments.map((comment) => (
                                <Paper
                                    key={comment.id}
                                    variant="outlined"
                                    sx={{ p: 1.5, borderRadius: 2, bgcolor: 'background.default' }}
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
