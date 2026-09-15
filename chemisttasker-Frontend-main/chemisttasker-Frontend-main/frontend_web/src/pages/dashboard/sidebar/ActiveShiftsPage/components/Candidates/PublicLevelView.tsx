import React from 'react';
import {
    Avatar,
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    Chip,
    CircularProgress,
    Divider,
    Paper,
    Stack,
    Typography,
} from '@mui/material';
import { LocalOffer, PersonAdd } from '@mui/icons-material';
import { Shift, ShiftInterest } from '@chemisttasker/shared-core';
import { SlotSelector } from './SlotSelector';
import { getInterestDisplayName } from '../../utils/candidateHelpers';

const chemisttaskerBadge = '/images/ChatGPT Image Jan 18, 2026, 08_14_43 PM.png';

interface PublicLevelViewProps {
    shift: Shift;
    slotId: number | null;
    slotHasUpdates?: Record<number, boolean>;
    slotCandidateCounts?: Record<number, number>;
    slotStatusCounts?: Record<number, { interested: number; assigned: number; rejected: number; noResponse: number }>;
    interestsAll: any[];
    counterOffers: any[];
    counterOffersLoaded: boolean;
    onReveal: (shift: Shift, interest: ShiftInterest) => void;
    onReviewOffer: (shift: Shift, offer: any, slotId: number | null) => void;
    onSelectSlot?: (slotId: number) => void;
    revealingInterestId: number | null;
    onBuzzWorker?: (offerId: number) => void;
    buzzLoadingOfferId?: number | null;
}

const publicCardPalettes = {
    offer: {
        bg: 'linear-gradient(180deg,#F7F0FF 0%,#EFE6FF 100%)',
        fg: '#6D28D9',
        border: '#C4B5FD',
        shadow: 'rgba(109,40,217,.14)',
    },
    match: {
        bg: 'linear-gradient(180deg,#E8FCFF 0%,#DDF8FF 100%)',
        fg: '#008EA6',
        border: '#A5F3FC',
        shadow: 'rgba(8,190,234,.16)',
    },
};

const PublicCandidateCard: React.FC<{
    title: string;
    count: number;
    icon: React.ReactElement;
    palette: keyof typeof publicCardPalettes;
    emptyTitle: string;
    emptySubtitle: string;
    children: React.ReactNode;
}> = ({ title, count, icon, palette, emptyTitle, emptySubtitle, children }) => {
    const colors = publicCardPalettes[palette];

    return (
    <Card
        sx={{
            background: colors.bg,
            boxShadow: `0 12px 28px ${colors.shadow}`,
            border: `1px solid ${colors.border}`,
            borderRadius: { xs: 2, sm: 3 },
            height: '100%',
            minHeight: { xs: 168, sm: 190 },
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
        }}
    >
        <CardHeader
            sx={{
                pb: 0,
                pt: { xs: 1, sm: 1.5 },
                px: { xs: 1, sm: 2 },
                '& .MuiCardHeader-content': { minWidth: 0 },
                '& .MuiCardHeader-action': { alignSelf: 'flex-start', mt: 0 },
                '& .MuiCardHeader-avatar': { mr: { xs: 0.75, sm: 2 } },
            }}
            avatar={
                <Avatar
                    sx={{
                        width: { xs: 32, sm: 40 },
                        height: { xs: 32, sm: 40 },
                        bgcolor: '#fff',
                        color: colors.fg,
                        boxShadow: `0 10px 20px ${colors.shadow}`,
                        '& svg': { fontSize: { xs: 19, sm: 24 } },
                    }}
                >
                    {icon}
                </Avatar>
            }
            title={
                <Typography
                    sx={{
                        fontSize: { xs: 14, sm: 18 },
                        fontWeight: 900,
                        color: colors.fg,
                        lineHeight: 1.12,
                        overflowWrap: 'anywhere',
                    }}
                >
                    {title}
                </Typography>
            }
            action={
                <Chip
                    label={count}
                    size="small"
                    sx={{
                        backgroundColor: colors.fg,
                        color: 'white',
                        fontWeight: 'bold',
                        height: { xs: 22, sm: 24 },
                        minWidth: { xs: 24, sm: 28 },
                        '& .MuiChip-label': { px: { xs: 0.75, sm: 1 } },
                    }}
                />
            }
        />
        <CardContent sx={{ pt: { xs: 1, sm: 1.5 }, pb: { xs: '12px !important', sm: '16px !important' }, px: { xs: 1, sm: 2 }, flex: 1, minHeight: 0 }}>
            {count > 0 ? (
                <Stack
                    spacing={1}
                    sx={{
                        maxHeight: 245,
                        overflowY: 'auto',
                        pr: 0.25,
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                        '&::-webkit-scrollbar': {
                            display: 'none',
                            width: 0,
                            height: 0,
                        },
                    }}
                >
                    {children}
                </Stack>
            ) : (
                <Box sx={{ maxWidth: { xs: 160, sm: 240 }, mx: 'auto', py: 3, textAlign: 'center' }}>
                    <Typography color="text.secondary" sx={{ fontWeight: 800, lineHeight: 1.25, fontSize: { xs: 13, sm: 16 } }}>
                        {emptyTitle}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.35, fontSize: { xs: 10.5, sm: 12 } }}>
                        {emptySubtitle}
                    </Typography>
                </Box>
            )}
        </CardContent>
    </Card>
    );
};

export const PublicLevelView: React.FC<PublicLevelViewProps> = ({
    shift,
    slotId,
    slotHasUpdates,
    slotCandidateCounts,
    slotStatusCounts,
    interestsAll,
    counterOffers,
    counterOffersLoaded,
    onReveal,
    onReviewOffer,
    onSelectSlot,
    revealingInterestId,
    onBuzzWorker,
    buzzLoadingOfferId,
}) => {
    const slots = (shift as any).slots || [];
    const multiSlots = !(shift as any).singleUserOnly && slots.length > 0;
    const offersList = counterOffersLoaded ? counterOffers : [];

    const getOfferSlotId = (offer: any): number | null => {
        const offerSlots = offer?.slots || offer?.offer_slots || [];
        const slotIdFromSlots =
            offerSlots
                .map((s: any) => s.slot_id ?? s.slotId ?? s.slot?.id ?? null)
                .find((id: any) => id != null) ?? null;
        const fallback = offer?.slotId ?? offer?.slot_id ?? null;
        return slotIdFromSlots ?? fallback ?? null;
    };

    const findInterestForOffer = (offer: any, offerSlotId: number | null) => {
        const offerUserId = typeof offer.user === 'object' ? offer.user?.id : offer.user;
        if (offerUserId == null) return null;
        return interestsAll.find((i: any) => {
            const iUserId = i.userId ?? i.user?.id ?? null;
            if (iUserId !== offerUserId) return false;
            if (offerSlotId == null) {
                return i.slotId == null;
            }
            return i.slotId === offerSlotId;
        }) || null;
    };

    // Filter interests based on slot
    const slotInterests = slotId
        ? interestsAll.filter(i => i.slotId === slotId || i.slotId == null)
        : interestsAll;

    // Filter counter offers based on slot
    const slotOffers = slotId
        ? counterOffers.filter(o => {
            const offerSlots = o.slots || o.offer_slots || [];
            return offerSlots.some((s: any) => (s.slot_id ?? s.slotId ?? s.slot?.id) === slotId);
        })
        : offersList;

    const offerUserIds = new Set(
        slotOffers
            .map(o => (typeof o.user === 'object' ? o.user?.id : o.user))
            .filter((id: any) => id != null)
    );

    const slotInterestsFiltered = slotInterests.filter(interest => {
        const iUserId = interest.userId ?? interest.user?.id ?? null;
        if (iUserId == null) return true;
        return !offerUserIds.has(iUserId);
    });

    return (
        <Stack spacing={2}>
            {/* Slot Selector for multi-slot shifts */}
            {multiSlots && onSelectSlot && (
                <SlotSelector
                    slots={slots}
                    selectedSlotId={slotId}
                    onSelectSlot={onSelectSlot}
                    slotHasUpdates={slotHasUpdates}
                    slotCandidateCounts={slotCandidateCounts}
                    slotStatusCounts={slotStatusCounts}
                />
            )}
            <Divider>
                <Chip
                    avatar={
                        <Avatar
                            src={chemisttaskerBadge}
                            alt="ChemistTasker"
                            sx={{ bgcolor: '#fff', '& img': { objectFit: 'contain' } }}
                        />
                    }
                    label="ChemistTasker Public Candidates"
                    sx={{
                        height: 40,
                        px: 0.75,
                        bgcolor: '#F5F0FF',
                        color: '#4C1D95',
                        border: '1px solid #C4B5FD',
                        boxShadow: '0 10px 24px rgba(109,40,217,.16)',
                        fontWeight: 950,
                        '& .MuiChip-label': {
                            px: 1,
                            fontSize: { xs: 12, sm: 14 },
                        },
                    }}
                />
            </Divider>
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                        xs: 'repeat(1, minmax(0, 1fr))',
                        md: 'repeat(2, minmax(230px, 1fr))',
                    },
                    gap: { xs: 1.25, sm: 2 },
                    alignItems: 'stretch',
                }}
            >
                <PublicCandidateCard
                    title="Counter offers"
                    count={slotOffers.length}
                    icon={<LocalOffer />}
                    palette="offer"
                    emptyTitle="No counter offers yet."
                    emptySubtitle="When candidates send counter offers, they'll appear here."
                >
                    {slotOffers.map((offer) => {
                        const offerSlotId = slotId ?? getOfferSlotId(offer);
                        const interest = findInterestForOffer(offer, offerSlotId);
                        const label = interest && !interest.revealed ? 'Reveal offer' : 'Review offer';
                        const isRevealLabel = label.toLowerCase().includes('reveal');
                        const title = (() => {
                            if (interest && interest.revealed) {
                                if (interest.user) {
                                    const userObj = typeof interest.user === 'object' ? interest.user : null;
                                    if (userObj) {
                                        const name =
                                            (userObj.firstName && userObj.lastName)
                                                ? `${userObj.firstName} ${userObj.lastName}`
                                                : (userObj.first_name && userObj.last_name)
                                                    ? `${userObj.first_name} ${userObj.last_name}`
                                                    : userObj.name || userObj.displayName || userObj.display_name;
                                        if (name) return name;
                                    }
                                    if (typeof userObj === 'string') return userObj;
                                }
                                const displayName = (interest as any).displayName || interest.userName;
                                if (displayName) return displayName;
                            }
                            return 'Someone sent a counter offer';
                        })();

                        return (
                            <Paper
                                key={offer.id}
                                variant="outlined"
                                sx={{
                                    p: 1.25,
                                    borderRadius: 2,
                                    bgcolor: '#fff',
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    minWidth: 0,
                                    boxShadow: '0 8px 18px rgba(15,23,42,.04)',
                                }}
                            >
                                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ width: '100%', minWidth: 0 }}>
                                <Typography
                                    noWrap
                                    title={title}
                                    sx={{
                                        fontWeight: 800,
                                        lineHeight: 1.2,
                                        fontSize: 'clamp(0.72rem, 0.95vw, 0.95rem)',
                                        flex: '1 1 auto',
                                        minWidth: 0,
                                        maxWidth: '100%',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {title}
                                </Typography>
                                    <Button
                                        size="small"
                                        variant={isRevealLabel ? 'contained' : 'outlined'}
                                        color="secondary"
                                        sx={{ flexShrink: 0, minHeight: 36, borderRadius: 1.5, fontWeight: 800 }}
                                        onClick={() => onReviewOffer(shift, offer, offerSlotId)}
                                    >
                                        {label}
                                    </Button>
                                </Stack>
                            </Paper>
                        );
                    })}
                </PublicCandidateCard>

                <PublicCandidateCard
                    title="Interested matches"
                    count={slotInterestsFiltered.length}
                    icon={<PersonAdd />}
                    palette="match"
                    emptyTitle="No matches yet."
                    emptySubtitle="When public candidates show interest, they'll appear here."
                >
                    {slotInterestsFiltered.map((interest) => {
                        const isPendingConfirmation = Boolean(interest.pendingConfirmation ?? interest.pending_confirmation);
                        const isAwaitingPayment = Boolean(interest.awaitingPayment ?? interest.awaiting_payment);
                        const pendingOfferId = interest.pendingOfferId ?? interest.pending_offer_id ?? null;
                        return (
                            <Paper
                                key={interest.id}
                                variant="outlined"
                                sx={{
                                    p: 1.25,
                                    borderRadius: 2,
                                    bgcolor: '#fff',
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    minWidth: 0,
                                    boxShadow: '0 8px 18px rgba(15,23,42,.04)',
                                }}
                            >
                                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ width: '100%', minWidth: 0 }}>
                                    <Typography
                                        noWrap
                                        title={interest.revealed ? getInterestDisplayName(interest, interest.user) : 'Anonymous Interest User'}
                                        sx={{
                                            fontWeight: 800,
                                            lineHeight: 1.2,
                                            fontSize: 'clamp(0.72rem, 0.95vw, 0.95rem)',
                                            flex: '1 1 auto',
                                            minWidth: 0,
                                            maxWidth: '100%',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {interest.revealed
                                            ? getInterestDisplayName(interest, interest.user)
                                            : 'Anonymous Interest User'}
                                    </Typography>
                                    {isAwaitingPayment ? (
                                        <Chip label="Awaiting payment" size="small" color="error" sx={{ flexShrink: 0, fontWeight: 800 }} />
                                    ) : isPendingConfirmation && (
                                        <Chip label="Pending" size="small" color="warning" sx={{ flexShrink: 0, fontWeight: 800 }} />
                                    )}
                                    <Button
                                        size="small"
                                        variant={interest.revealed ? 'outlined' : 'contained'}
                                        color="secondary"
                                        sx={{ flexShrink: 0, minHeight: 36, borderRadius: 1.5, fontWeight: 800 }}
                                        onClick={() => onReveal(shift, interest)}
                                        disabled={revealingInterestId === interest.id}
                                        startIcon={
                                            revealingInterestId === interest.id ? (
                                                <CircularProgress size={16} color="inherit" />
                                            ) : undefined
                                        }
                                    >
                                        {isPendingConfirmation || isAwaitingPayment ? 'View' : interest.revealed ? 'Review' : 'Reveal'}
                                    </Button>
                                    {isPendingConfirmation && !isAwaitingPayment && pendingOfferId != null && onBuzzWorker && (
                                        <Button
                                            size="small"
                                            variant="contained"
                                            sx={{
                                                flexShrink: 0,
                                                minHeight: 36,
                                                borderRadius: 1.5,
                                                fontWeight: 800,
                                                bgcolor: '#F9F295',
                                                backgroundImage: 'linear-gradient(90deg, #F9F295 0%, #E0AA3E 55%, #B88A44 100%)',
                                                color: '#111827',
                                                boxShadow: '0 8px 16px rgba(184,138,68,.24)',
                                                '&:hover': {
                                                    bgcolor: '#E0AA3E',
                                                    backgroundImage: 'linear-gradient(90deg, #FAF398 0%, #D2AC47 55%, #926F34 100%)',
                                                },
                                            }}
                                            onClick={() => onBuzzWorker(Number(pendingOfferId))}
                                            disabled={buzzLoadingOfferId === Number(pendingOfferId)}
                                            startIcon={
                                                buzzLoadingOfferId === Number(pendingOfferId) ? (
                                                    <CircularProgress size={16} color="inherit" />
                                                ) : undefined
                                            }
                                        >
                                            Buzz
                                        </Button>
                                    )}
                                </Stack>
                            </Paper>
                        );
                    })}
                </PublicCandidateCard>
            </Box>
        </Stack>
    );
};
