import type { Dispatch, SetStateAction } from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    alpha,
    Box,
    Button,
    Card,
    CardContent,
    CardHeader,
    Checkbox,
    Chip,
    CircularProgress,
    Divider,
    FormControlLabel,
    IconButton,
    Stack,
    Tooltip,
    Typography,
} from '@mui/material';
import {
    Edit,
    Delete as Trash2,
    Share as Share2,
    Business as Building,
    CalendarToday as CalendarDays,
    FavoriteBorder,
    Groups,
    LocationOn,
    ExpandMore,
} from '@mui/icons-material';
import type {
    Shift,
    ShiftMemberStatus,
    EscalationLevelKey,
} from '@chemisttasker/shared-core';
import { EscalationStepper } from './components/Escalation/EscalationStepper';
import { PublicLevelView } from './components/Candidates/PublicLevelView';
import { CommunityLevelView } from './components/Candidates/CommunityLevelView';
import {
    PUBLIC_LEVEL_KEY,
    getCurrentLevelKey,
    getShiftSummary,
    deriveLevelSequence,
} from './utils/shiftHelpers';
import { dedupeMembers } from './utils/candidateHelpers';
import { getCardBorderColor, getLocationText } from './utils/displayHelpers';
import {
    toFiniteNumber,
    resolveSlotId,
    getSlotIds,
    formatAuSlotDateTime,
    offerBelongsToSlot,
    interestBelongsToSlot,
    countUniquePeople,
    isActiveCounterOffer,
    getCandidateUserId,
} from './utils/activeShiftRuntime';
import type { DeleteConfirmDialogState } from './types';

type ActiveShiftCardData = {
    tabData: Record<string, any>;
    counterOffersByShift: Record<number, any[]>;
    counterOffersLoadingByShift: Record<number, boolean>;
};

type ActiveShiftCardState = {
    expandedShifts: Set<number>;
    selectedLevelByShift: Record<number, EscalationLevelKey>;
    selectedSlotByShift: Record<number, number>;
    paymentSlotSelection: Record<number, number[]>;
    setPaymentSlotSelection: Dispatch<SetStateAction<Record<number, number[]>>>;
    pillPayingShiftId: number | null;
    sharingShiftId: number | null;
    actionLoading: Record<string, boolean>;
    slotHasUpdatesByShift: Record<number, Record<number, boolean>>;
    revealingInterestId: number | null;
    buzzLoadingOfferId: number | null;
    reviewLoadingId: number | null;
    setDeleteConfirmDialog: Dispatch<SetStateAction<DeleteConfirmDialogState>>;
    setSelectedLevelByShift: Dispatch<SetStateAction<Record<number, EscalationLevelKey>>>;
};

type ActiveShiftCardActions = {
    getTabKey: (shiftId: number, levelKey: EscalationLevelKey) => string;
    handlePayWithStripe: (shift: Shift, offerIds?: number[]) => Promise<void>;
    handlePayWithPills: (shift: Shift, offerIds?: number[]) => Promise<void>;
    handleShare: (shift: Shift) => void | Promise<void>;
    handleEditShift: (shiftId: number) => void;
    toggleShiftExpansion: (shiftId: number) => void;
    handleLevelChange: (shift: Shift, levelKey: EscalationLevelKey) => void;
    handleEscalate: (shiftId: number, levelKey: any) => Promise<boolean>;
    loadTabDataForShift: (shift: Shift, levelKey: EscalationLevelKey) => Promise<any>;
    loadShifts: () => Promise<any>;
    handleRevealInterest: (shift: Shift, interest: any) => Promise<void>;
    handleSlotSelection: (shiftId: number, slotId: number) => void;
    handleReviewOffer: (shift: Shift, offer: any, tabData: any, slotId: number | null) => Promise<void>;
    handleBuzzWorker: (offerId: number) => Promise<void>;
    handleReviewCandidate: (
        shift: Shift,
        member: ShiftMemberStatus,
        offer: any | null,
        slotId: number | null,
    ) => Promise<void>;
};

type Props = {
    shift: Shift;
    dedicated: boolean;
    isDarkMode: boolean;
    data: ActiveShiftCardData;
    state: ActiveShiftCardState;
    actions: ActiveShiftCardActions;
};

export default function ActiveShiftCard({
    shift,
    dedicated,
    isDarkMode,
    data,
    state,
    actions,
}: Props) {
    const {
        tabData,
        counterOffersByShift,
        counterOffersLoadingByShift,
    } = data;
    const {
        expandedShifts,
        selectedLevelByShift,
        selectedSlotByShift,
        paymentSlotSelection,
        setPaymentSlotSelection,
        pillPayingShiftId,
        sharingShiftId,
        actionLoading,
        slotHasUpdatesByShift,
        revealingInterestId,
        buzzLoadingOfferId,
        reviewLoadingId,
        setDeleteConfirmDialog,
        setSelectedLevelByShift,
    } = state;
    const {
        getTabKey,
        handlePayWithStripe,
        handlePayWithPills,
        handleShare,
        handleEditShift,
        toggleShiftExpansion,
        handleLevelChange,
        handleEscalate,
        loadTabDataForShift,
        loadShifts,
        handleRevealInterest,
        handleSlotSelection,
        handleReviewOffer,
        handleBuzzWorker,
        handleReviewCandidate,
    } = actions;
        const isExpanded = expandedShifts.has(shift.id);
        const isSingleUserShift = Boolean((shift as any).singleUserOnly);
        const shiftLevel = getCurrentLevelKey(shift);
        const selectedLevel = selectedLevelByShift[shift.id] ?? shiftLevel;
        const tabKey = getTabKey(shift.id, selectedLevel);
        const currentTabData = tabData[tabKey] || { loading: false };
        const viewableLevelKeys = deriveLevelSequence(
            shiftLevel,
            (shift as any).allowedEscalationLevels,
        );
        const communityLevelKeys = viewableLevelKeys.filter(level => level !== PUBLIC_LEVEL_KEY);
        const communityTabData = communityLevelKeys.map(level => tabData[getTabKey(shift.id, level)]);
        const communityDataLoading = communityLevelKeys.some((_level, index) => {
            const data = communityTabData[index];
            return !data || data.loading;
        });
        const selectedSlotId = isSingleUserShift
            ? null
            : selectedSlotByShift[shift.id] ?? shift.slots?.[0]?.id ?? null;
        const offers = counterOffersByShift[shift.id];
        const counterOffersLoaded = Object.prototype.hasOwnProperty.call(counterOffersByShift, shift.id);
        const counterOffersLoading = counterOffersLoadingByShift[shift.id] ?? false;
        const slotIds = getSlotIds(shift);
        const consolidatedMembersBySlot = slotIds.reduce<Record<number, ShiftMemberStatus[]>>((acc, slotId) => {
            acc[slotId] = dedupeMembers(communityLevelKeys.flatMap((level, index) => (
                communityTabData[index]?.membersBySlot?.[slotId] || []
            ).map((member: any) => ({ ...member, sourceVisibility: level }))));
            return acc;
        }, {});
        const consolidatedMembers = dedupeMembers(communityLevelKeys.flatMap((level, index) => (
            communityTabData[index]?.members || []
        ).map((member: any) => ({ ...member, sourceVisibility: level }))));
        const knownCommunityUserIds = new Set(
            consolidatedMembers
                .map(getCandidateUserId)
                .filter((id): id is number => id != null)
        );
        const publicInterests = (currentTabData.interestsAll || []).filter((interest: any) => {
            const userId = getCandidateUserId(interest);
            return userId == null || !knownCommunityUserIds.has(userId);
        });
        const publicOffers = (offers || []).filter((offer: any) => {
            const userId = getCandidateUserId(offer);
            return userId == null || !knownCommunityUserIds.has(userId);
        });
        const membersForView = isSingleUserShift
            ? consolidatedMembers
            : consolidatedMembersBySlot[selectedSlotId ?? -1] || [];

        const cardBorderColor = getCardBorderColor((shift as any).visibility ?? 'PLATFORM');
        const summaryText = getShiftSummary(shift);
        const location = getLocationText(shift);
        const labelOverrides = undefined;
        const roleNeeded = (shift as any).roleNeeded ?? (shift as any).role_needed;
        const employmentType = (shift as any).employmentType ?? (shift as any).employment_type;
        const isUrgent = Boolean((shift as any).isUrgent ?? (shift as any).is_urgent);
        const slotsCount = Array.isArray((shift as any).slots) ? (shift as any).slots.length : 0;
        const allMembers = isSingleUserShift
            ? consolidatedMembers
            : Object.values(consolidatedMembersBySlot || {}).flatMap((slotMembers: any) => (
                Array.isArray(slotMembers) ? slotMembers : []
            ));
        const allInterests = publicInterests;
        const allOffers = publicOffers;
        const slotById = new Map<number, any>();
        (((shift as any).slots || []) as any[]).forEach((slot) => {
            const slotId = resolveSlotId(slot);
            if (slotId != null) slotById.set(slotId, slot);
        });
        const directPaymentOptions = (((shift as any).paymentOptions ?? (shift as any).payment_options ?? []) as any[])
            .map((option) => {
                const offerId = toFiniteNumber(option.offerId ?? option.offer_id);
                const slotId = toFiniteNumber(option.slotId ?? option.slot_id);
                if (!offerId || !slotId) return null;
                const slot = slotById.get(slotId) || {
                    id: slotId,
                    date: option.slotDate ?? option.slot_date,
                    start_time: option.startTime ?? option.start_time,
                    end_time: option.endTime ?? option.end_time,
                };
                return {
                    offerId,
                    slotId,
                    slot,
                    name: option.candidateName ?? option.candidate_name ?? option.candidateEmail ?? option.candidate_email ?? 'Participant',
                };
            })
            .filter(Boolean) as Array<{ offerId: number; slotId: number; slot: any; name: string }>;
        const memberPaymentOptions = dedupeMembers(allMembers)
            .map((member: any) => {
                const offerId = toFiniteNumber(member.awaitingPaymentOfferId ?? member.awaiting_payment_offer_id);
                const slotId = toFiniteNumber(member.slotId ?? member.slot_id) ?? selectedSlotId;
                if (!offerId || (!slotId && !isSingleUserShift)) return null;
                const slot = slotId != null ? slotById.get(slotId) : undefined;
                return {
                    offerId,
                    slotId: slotId ?? 0,
                    slot: slot || ((shift as any).slots || [])[0] || null,
                    name: member.displayName || member.display_name || member.name || member.email || 'Participant',
                };
            })
            .filter(Boolean) as Array<{ offerId: number; slotId: number; slot: any; name: string }>;
        const publicInterestPaymentOptions = dedupeMembers(allInterests)
            .map((interest: any) => {
                const offerId = toFiniteNumber(interest.awaitingPaymentOfferId ?? interest.awaiting_payment_offer_id);
                const slotId = toFiniteNumber(interest.slotId ?? interest.slot_id) ?? selectedSlotId;
                if (!offerId || (!slotId && !isSingleUserShift)) return null;
                return {
                    offerId,
                    slotId: slotId ?? 0,
                    slot: (slotId != null ? slotById.get(slotId) : undefined) || ((shift as any).slots || [])[0] || null,
                    name: interest.displayName || interest.display_name || interest.userName || interest.user_name || interest.email || 'Participant',
                };
            })
            .filter(Boolean) as Array<{ offerId: number; slotId: number; slot: any; name: string }>;
        const paymentRequiredOffers = directPaymentOptions.length > 0
            ? directPaymentOptions
            : [...memberPaymentOptions, ...publicInterestPaymentOptions].filter((item, index, list) => (
                list.findIndex((candidate) => candidate.offerId === item.offerId) === index
            ));
        const payableOfferIds = paymentRequiredOffers.map((item) => item.offerId);
        const defaultPaymentOfferIds = Array.from(
            paymentRequiredOffers.reduce((map, item) => {
                if (!map.has(item.slotId)) map.set(item.slotId, item.offerId);
                return map;
            }, new Map<number, number>()).values()
        );
        const rawSelectedPaymentOfferIds = paymentSlotSelection[shift.id];
        const selectedPaymentOfferIds = (rawSelectedPaymentOfferIds ?? defaultPaymentOfferIds).filter((offerId) => payableOfferIds.includes(offerId));
        const effectivePaymentOfferIds = selectedPaymentOfferIds;
        const paymentUnitCount = effectivePaymentOfferIds.length;
        const showPaymentRequired = paymentRequiredOffers.length > 0;
        const candidatesCount = countUniquePeople([
            ...dedupeMembers(allMembers),
            ...allInterests,
            ...allOffers,
        ]);
        const interestsCount = countUniquePeople([
            ...dedupeMembers(allMembers.filter((member: any) => member?.status === 'interested')),
            ...allInterests,
            ...allOffers.filter(isActiveCounterOffer),
        ]);
        const slotCandidateCounts = slotIds.reduce<Record<number, number>>((acc, slotId) => {
            const slotMembers = consolidatedMembersBySlot[slotId] || [];
            const slotInterests = allInterests.filter((interest: any) => interestBelongsToSlot(interest, slotId));
            const slotOffers = allOffers.filter((offer: any) => offerBelongsToSlot(offer, slotId));
            acc[slotId] = countUniquePeople([
                ...dedupeMembers(slotMembers),
                ...slotInterests,
                ...slotOffers,
            ]);
            return acc;
        }, {});
        const slotStatusCounts = slotIds.reduce<Record<number, { interested: number; assigned: number; rejected: number; noResponse: number }>>((acc, slotId) => {
            const slotMembers = dedupeMembers(consolidatedMembersBySlot[slotId] || []);
            const slotInterests = allInterests.filter((interest: any) => interestBelongsToSlot(interest, slotId));
            const slotOffers = allOffers.filter((offer: any) => offerBelongsToSlot(offer, slotId));
            const slotNoResponse = countUniquePeople(slotMembers.filter((member: any) => member?.status === 'no_response'));
            const shiftNoResponse = countUniquePeople(dedupeMembers(consolidatedMembers).filter((member: any) => member?.status === 'no_response'));
            acc[slotId] = {
                interested: countUniquePeople([
                    ...slotMembers.filter((member: any) => member?.status === 'interested'),
                    ...slotInterests,
                    ...slotOffers.filter(isActiveCounterOffer),
                ]),
                assigned: countUniquePeople(slotMembers.filter((member: any) => member?.status === 'accepted')),
                rejected: countUniquePeople(slotMembers.filter((member: any) => member?.status === 'rejected')),
                noResponse: slotNoResponse || shiftNoResponse,
            };
            return acc;
        }, {});
        if (selectedSlotId != null) {
            const selectedMembers = dedupeMembers(membersForView);
            slotStatusCounts[selectedSlotId] = {
                interested: countUniquePeople([
                    ...selectedMembers.filter((member: any) => member?.status === 'interested'),
                    ...allInterests.filter((interest: any) => interestBelongsToSlot(interest, selectedSlotId)),
                    ...allOffers.filter((offer: any) => offerBelongsToSlot(offer, selectedSlotId) && isActiveCounterOffer(offer)),
                ]),
                assigned: countUniquePeople(selectedMembers.filter((member: any) => member?.status === 'accepted')),
                rejected: countUniquePeople(selectedMembers.filter((member: any) => member?.status === 'rejected')),
                noResponse: countUniquePeople(selectedMembers.filter((member: any) => member?.status === 'no_response')),
            };
        }
        const metricItems = [
            { label: 'Slots', value: slotsCount || '-', icon: <CalendarDays fontSize="small" /> },
            { label: 'Candidates', value: candidatesCount, icon: <Groups fontSize="small" /> },
            { label: 'Interests', value: interestsCount, icon: <FavoriteBorder fontSize="small" /> },
        ];
        const headerActions = (
            <Box
                onClick={(event) => event.stopPropagation()}
                sx={{ display: 'flex', gap: 0.5, alignItems: 'center', justifyContent: 'flex-end' }}
            >
                <Tooltip title="Share">
                    <span>
                        <IconButton
                            size="small"
                            sx={{
                                color: isDarkMode ? alpha('#FFFFFF', 0.86) : '#475569',
                                bgcolor: isDarkMode ? alpha('#FFFFFF', 0.08) : 'transparent',
                                border: isDarkMode ? `1px solid ${alpha('#FFFFFF', 0.12)}` : '1px solid transparent',
                                '&:hover': {
                                    bgcolor: isDarkMode ? alpha('#8B5CF6', 0.22) : alpha('#8B5CF6', 0.08),
                                    color: isDarkMode ? '#FFFFFF' : '#6D28D9',
                                },
                                '&.Mui-disabled': {
                                    color: isDarkMode ? alpha('#FFFFFF', 0.28) : undefined,
                                },
                            }}
                            onClick={e => {
                                e.stopPropagation();
                                handleShare(shift);
                            }}
                            disabled={sharingShiftId === shift.id}
                        >
                            <Share2 fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="Edit">
                    <IconButton
                        size="small"
                        sx={{
                            color: isDarkMode ? alpha('#FFFFFF', 0.86) : '#475569',
                            bgcolor: isDarkMode ? alpha('#FFFFFF', 0.08) : 'transparent',
                            border: isDarkMode ? `1px solid ${alpha('#FFFFFF', 0.12)}` : '1px solid transparent',
                            '&:hover': {
                                bgcolor: isDarkMode ? alpha('#8B5CF6', 0.22) : alpha('#8B5CF6', 0.08),
                                color: isDarkMode ? '#FFFFFF' : '#6D28D9',
                            },
                        }}
                        onClick={e => {
                            e.stopPropagation();
                            handleEditShift(shift.id);
                        }}
                    >
                        <Edit fontSize="small" />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                    <IconButton
                        size="small"
                        sx={{
                            color: isDarkMode ? alpha('#FFFFFF', 0.86) : '#475569',
                            bgcolor: isDarkMode ? alpha('#FFFFFF', 0.08) : 'transparent',
                            border: isDarkMode ? `1px solid ${alpha('#FFFFFF', 0.12)}` : '1px solid transparent',
                            '&:hover': {
                                bgcolor: isDarkMode ? alpha('#EF4444', 0.2) : alpha('#EF4444', 0.08),
                                color: isDarkMode ? '#FCA5A5' : '#DC2626',
                            },
                            '&.Mui-disabled': {
                                color: isDarkMode ? alpha('#FFFFFF', 0.28) : undefined,
                            },
                        }}
                        onClick={e => {
                            e.stopPropagation();
                            setDeleteConfirmDialog({ open: true, shiftId: shift.id });
                        }}
                        disabled={actionLoading[`delete_${shift.id}`]}
                    >
                        <Trash2 fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
        );

        return (
            <Card
                id={`active-shift-card-${shift.id}`}
                key={shift.id}
                onClick={() => toggleShiftExpansion(shift.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleShiftExpansion(shift.id);
                    }
                }}
                sx={{
                    position: 'relative',
                    overflow: 'hidden',
                    maxWidth: '100%',
                    borderRadius: 6,
                    border: '1px solid #D9E2F2',
                    background: 'linear-gradient(180deg, #F6FBFF 0%, #F8FAFC 46%, #FFFFFF 100%)',
                    boxShadow: '0 24px 60px rgba(15, 23, 42, 0.08)',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
                    '&:hover': {
                        transform: 'translateY(-1px)',
                        borderColor: '#C7D2FE',
                        boxShadow: '0 28px 66px rgba(15, 23, 42, 0.10)',
                    },
                    '&:focus-visible': {
                        outline: '3px solid rgba(124,58,237,.28)',
                        outlineOffset: 3,
                    },
                    '&:before': {
                        content: '""',
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                        background: 'radial-gradient(circle at top right, rgba(37,99,235,.10), transparent 32%), radial-gradient(circle at top left, rgba(124,58,237,.10), transparent 28%)',
                    },
                }}
            >
                <CardHeader
                    disableTypography
                    sx={{ px: { xs: 2, md: 3 }, pt: { xs: 2, md: 3 }, pb: 1.5, minWidth: 0, position: 'relative' }}
                    title={
                        <Stack direction={{ xs: 'column', xl: 'row' }} spacing={{ xs: 1.5, md: 2 }} justifyContent="space-between" alignItems={{ xs: 'stretch', xl: 'flex-start' }} sx={{ width: '100%', minWidth: 0 }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.25, sm: 2 }} sx={{ minWidth: 0, width: { xs: '100%', xl: 'auto' }, maxWidth: { xl: '52%' } }}>
                                <Box
                                    sx={{
                                        width: { xs: 54, sm: 58 },
                                        height: { xs: 54, sm: 58 },
                                        flexShrink: 0,
                                        display: 'grid',
                                        placeItems: 'center',
                                        borderRadius: 3.5,
                                        color: '#fff',
                                        background: 'linear-gradient(135deg, #5EEAD4 0%, #7C3AED 100%)',
                                        boxShadow: '0 18px 40px rgba(124,58,237,.24)',
                                    }}
                                >
                                    <Building />
                                </Box>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="h6" component="div" sx={{ fontWeight: 900, color: '#111827', fontSize: { xs: 21, sm: 24 }, lineHeight: 1.18, overflowWrap: 'anywhere' }}>
                                        {(shift as any).pharmacyDetail?.name ?? "Unnamed Pharmacy"}
                                    </Typography>
                                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                                        {roleNeeded && (
                                            <Chip label={roleNeeded} size="small" sx={{ bgcolor: cardBorderColor, color: '#fff', fontWeight: 800 }} />
                                        )}
                                        {employmentType && (
                                            <Chip label={employmentType} size="small" sx={{ bgcolor: '#F8FAFC', border: '1px solid #E5E7EB', fontWeight: 700 }} />
                                        )}
                                        {isUrgent && <Chip label="Urgent" color="error" size="small" sx={{ fontWeight: 800 }} />}
                                        {summaryText && (
                                            <Chip
                                                icon={<CalendarDays sx={{ fontSize: 15 }} />}
                                                label={summaryText}
                                                size="small"
                                                variant="outlined"
                                                sx={{ color: '#475569', fontWeight: 600 }}
                                            />
                                        )}
                                        {showPaymentRequired && (
                                            <Chip label="Payment Required" color="error" size="small" sx={{ fontWeight: 800 }} />
                                        )}
                                    </Stack>
                                </Box>
                            </Stack>
                            <Stack sx={{ ml: { xl: 'auto' }, width: '100%', maxWidth: { xs: '100%', xl: 520 }, alignItems: { xs: 'stretch', xl: 'flex-end' }, minWidth: 0 }}>
                                {headerActions}
                                <Box
                                    sx={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                        gap: { xs: 0.75, sm: 1.25 },
                                        width: '100%',
                                        mt: 1.25,
                                    }}
                                >
                                    {metricItems.map((item) => (
                                        <Box
                                            key={item.label}
                                            sx={{
                                                borderRadius: 3,
                                                border: `1px solid ${isDarkMode ? alpha('#FFFFFF', 0.14) : '#D9E2F2'}`,
                                                background: isDarkMode ? alpha('#FFFFFF', 0.075) : '#FFFFFFCC',
                                                minWidth: 0,
                                                width: '100%',
                                                px: { xs: 1.25, sm: 2 },
                                                py: { xs: 1.25, sm: 1.75 },
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: { xs: 0.75, sm: 1.25 },
                                                boxShadow: isDarkMode
                                                    ? `0 12px 28px ${alpha('#000000', 0.16)}`
                                                    : '0 12px 24px rgba(15,23,42,.05)',
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    width: { xs: 30, sm: 36 },
                                                    height: { xs: 30, sm: 36 },
                                                    borderRadius: '50%',
                                                    bgcolor: isDarkMode ? alpha('#A78BFA', 0.18) : '#F3E8FF',
                                                    color: isDarkMode ? '#C4B5FD' : '#7C3AED',
                                                    display: 'grid',
                                                    placeItems: 'center',
                                                    flexShrink: 0,
                                                    '& svg': { fontSize: { xs: 18, sm: 20 } },
                                                }}
                                            >
                                                {item.icon}
                                            </Box>
                                            <Box sx={{ minWidth: 0, textAlign: 'center' }}>
                                                <Typography sx={{ fontWeight: 800, color: isDarkMode ? '#F8FAFC' : '#0F172A', lineHeight: 1.05, fontSize: { xs: '1.2rem', sm: '1.5rem' } }}>
                                                    {item.value}
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        color: isDarkMode ? alpha('#FFFFFF', 0.72) : '#64748B',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: { xs: 0.2, sm: 0.6 },
                                                        fontSize: { xs: '0.62rem', sm: '0.75rem' },
                                                        fontWeight: 400,
                                                    }}
                                                >
                                                    {item.label}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    ))}
                                </Box>
                            </Stack>
                        </Stack>
                    }
                />
                <CardContent sx={{ px: { xs: 2, md: 3 }, pt: 0, minWidth: 0, position: 'relative' }}>
                    <Box
                        sx={{
                            display: 'flex',
                            gap: 1,
                            alignItems: 'center',
                            mb: 2,
                            color: isDarkMode ? alpha('#FFFFFF', 0.66) : '#64748B',
                        }}
                    >
                        <LocationOn sx={{ fontSize: 17 }} />
                        <Typography variant="body2" sx={{ color: 'inherit' }}>
                            {location}
                        </Typography>
                    </Box>

                    {dedicated && (
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
                            <Chip label="Direct / Private" color="info" size="small" />
                            <Chip label="Pending" variant="outlined" size="small" />
                        </Box>
                    )}

                    {isExpanded && (
                        <Box
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                        >
                            <Divider sx={{ my: 2.5 }} />

                            <EscalationStepper
                                shift={shift}
                                currentLevel={shiftLevel}
                                selectedLevel={selectedLevel}
                                onSelectLevel={(levelKey) => handleLevelChange(shift, levelKey)}
                                onEscalate={async (_s, levelKey) => {
                                    const success = await handleEscalate(shift.id, levelKey);
                                    if (!success) return;
                                    const updatedShift = { ...shift, visibility: levelKey, visibilityLevel: levelKey } as Shift;
                                    setSelectedLevelByShift(prev => ({ ...prev, [shift.id]: levelKey }));
                                    await loadTabDataForShift(updatedShift, levelKey);
                                    await loadShifts();
                                }}
                                escalating={actionLoading[`escalate_${shift.id}`]}
                                labelOverrides={labelOverrides}
                                showPrivateFirst={dedicated}
                            />

                            {showPaymentRequired && (
                                <Accordion
                                    defaultExpanded
                                    sx={{ mt: 3, border: '1px solid #FCA5A5', bgcolor: '#FEF2F2', boxShadow: 'none', borderRadius: 2, '&:before': { display: 'none' } }}
                                >
                                    <AccordionSummary expandIcon={<ExpandMore />}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 1 }}>
                                            <Box>
                                                <Typography variant="h6" color="error.main">
                                                    Payments Required
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {isSingleUserShift
                                                        ? `${paymentRequiredOffers.length} bundle payment option${paymentRequiredOffers.length === 1 ? '' : 's'}`
                                                        : `${paymentUnitCount} selected from ${paymentRequiredOffers.length} payment option${paymentRequiredOffers.length === 1 ? '' : 's'}`}
                                                </Typography>
                                            </Box>
                                            <Chip label={`$${paymentUnitCount * 30} AUD`} color="error" sx={{ fontWeight: 800 }} />
                                        </Box>
                                    </AccordionSummary>
                                    <AccordionDetails>
                                        <Stack spacing={1.25}>
                                            {paymentRequiredOffers.map((item) => {
                                                const checked = selectedPaymentOfferIds.includes(item.offerId);
                                                const bundleSlots = isSingleUserShift ? (((shift as any).slots || []) as any[]) : [];
                                                return (
                                                    <Box
                                                        key={`${shift.id}-${item.offerId}`}
                                                        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, p: 1.25, bgcolor: 'background.paper', borderRadius: 1.5, border: '1px solid #FECACA' }}
                                                    >
                                                        {isSingleUserShift ? (
                                                            <Box>
                                                                <Typography variant="body2" sx={{ fontWeight: 800 }}>
                                                                    {item.name} | Offer #{item.offerId}
                                                                </Typography>
                                                                <Stack spacing={0.25} sx={{ mt: 0.75 }}>
                                                                    {(bundleSlots.length > 0 ? bundleSlots : [item.slot]).filter(Boolean).map((slot: any, idx: number) => (
                                                                        <Typography key={resolveSlotId(slot) ?? idx} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                                                            {formatAuSlotDateTime(slot)}
                                                                        </Typography>
                                                                    ))}
                                                                </Stack>
                                                            </Box>
                                                        ) : (
                                                            <FormControlLabel
                                                                control={
                                                                    <Checkbox
                                                                        checked={checked}
                                                                        onChange={(event) => {
                                                                            const isChecked = event.target.checked;
                                                                            setPaymentSlotSelection((prev) => {
                                                                                const current = new Set(prev[shift.id] ?? defaultPaymentOfferIds);
                                                                                if (isChecked) {
                                                                                    paymentRequiredOffers
                                                                                        .filter((candidate) => candidate.slotId === item.slotId)
                                                                                        .forEach((candidate) => current.delete(candidate.offerId));
                                                                                    current.add(item.offerId);
                                                                                } else {
                                                                                    current.delete(item.offerId);
                                                                                }
                                                                                return { ...prev, [shift.id]: Array.from(current) };
                                                                            });
                                                                        }}
                                                                    />
                                                                }
                                                                label={
                                                                    <Box>
                                                                        <Typography variant="body2" sx={{ fontWeight: 800 }}>
                                                                            {formatAuSlotDateTime(item.slot)}
                                                                        </Typography>
                                                                        <Typography variant="caption" color="text.secondary">
                                                                            {item.name} | Offer #{item.offerId}
                                                                        </Typography>
                                                                    </Box>
                                                                }
                                                            />
                                                        )}
                                                        <Chip label="Payment pending" color="error" size="small" />
                                                    </Box>
                                                );
                                            })}
                                        </Stack>
                                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap', mt: 2 }}>
                                            <Button
                                                variant="contained"
                                                color="error"
                                                disabled={paymentUnitCount === 0}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    void handlePayWithStripe(shift, effectivePaymentOfferIds);
                                                }}
                                            >
                                                {isSingleUserShift ? 'Pay with Stripe' : 'Pay selected with Stripe'}
                                            </Button>
                                            <Button
                                                variant="contained"
                                                disabled={paymentUnitCount === 0 || pillPayingShiftId === shift.id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    void handlePayWithPills(shift, effectivePaymentOfferIds);
                                                }}
                                            >
                                                {pillPayingShiftId === shift.id ? 'Paying...' : isSingleUserShift ? 'Pay with Pills' : 'Pay selected with Pills'}
                                            </Button>
                                        </Box>
                                    </AccordionDetails>
                                </Accordion>
                            )}

                            <Divider sx={{ my: 2.5 }} />

                            {currentTabData.loading ? (
                                <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                                    <CircularProgress />
                                </Box>
                            ) : selectedLevel === PUBLIC_LEVEL_KEY ? (
                                counterOffersLoading || !counterOffersLoaded ? (
                                    <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                                        <CircularProgress />
                                    </Box>
                                ) : (
                                    <PublicLevelView
                                        shift={shift}
                                        slotId={selectedSlotId}
                                        slotHasUpdates={slotHasUpdatesByShift[shift.id] || {}}
                                        slotCandidateCounts={slotCandidateCounts}
                                        slotStatusCounts={slotStatusCounts}
                                        interestsAll={publicInterests}
                                        counterOffers={publicOffers}
                                        counterOffersLoaded={counterOffersLoaded}
                                        onReveal={handleRevealInterest}
                                        onSelectSlot={(slotId) => handleSlotSelection(shift.id, slotId)}
                                        onReviewOffer={(s, o, slotId) =>
                                            handleReviewOffer(s, o, currentTabData, slotId)
                                        }
                                        revealingInterestId={revealingInterestId}
                                        onBuzzWorker={handleBuzzWorker}
                                        buzzLoadingOfferId={buzzLoadingOfferId}
                                    />
                                )
                            ) : (
                                communityDataLoading ? (
                                    <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                                        <CircularProgress />
                                    </Box>
                                ) : (
                                    <CommunityLevelView
                                        shift={shift}
                                        members={membersForView}
                                        selectedSlotId={selectedSlotId}
                                        slotHasUpdates={slotHasUpdatesByShift[shift.id] || {}}
                                        slotCandidateCounts={slotCandidateCounts}
                                        slotStatusCounts={slotStatusCounts}
                                        offers={offers || []}
                                        onSelectSlot={(slotId) => handleSlotSelection(shift.id, slotId)}
                                        onReviewCandidate={(member, _shiftId, offer, slotId) =>
                                            handleReviewCandidate(shift, member, offer, slotId)
                                        }
                                        reviewLoadingId={reviewLoadingId}
                                        onBuzzWorker={handleBuzzWorker}
                                        buzzLoadingOfferId={buzzLoadingOfferId}
                                    />
                                )
                            )}
                            {selectedLevel === PUBLIC_LEVEL_KEY && (
                                <Box sx={{ mt: 2.5 }}>
                                    {communityDataLoading ? (
                                        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                                            <CircularProgress />
                                        </Box>
                                    ) : (
                                        <CommunityLevelView
                                            shift={shift}
                                            members={membersForView}
                                            selectedSlotId={selectedSlotId}
                                            slotHasUpdates={slotHasUpdatesByShift[shift.id] || {}}
                                            slotCandidateCounts={slotCandidateCounts}
                                            slotStatusCounts={slotStatusCounts}
                                            offers={offers || []}
                                            showSlotSelector={false}
                                            onSelectSlot={(slotId) => handleSlotSelection(shift.id, slotId)}
                                            onReviewCandidate={(member, _shiftId, offer, slotId) =>
                                                handleReviewCandidate(shift, member, offer, slotId)
                                            }
                                            reviewLoadingId={reviewLoadingId}
                                            onBuzzWorker={handleBuzzWorker}
                                            buzzLoadingOfferId={buzzLoadingOfferId}
                                        />
                                    )}
                                </Box>
                            )}
                        </Box>
                    )}
                </CardContent>
            </Card>
        );
    }
