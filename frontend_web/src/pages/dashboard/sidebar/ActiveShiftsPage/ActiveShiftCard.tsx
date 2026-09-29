import type { Dispatch, SetStateAction } from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Box,
    Alert,
    Button,
    Card,
    CardContent,
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
    CalendarToday as CalendarDays,
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
import { getLocationText } from './utils/displayHelpers';
import { formatShiftLabel, getShiftJourneyStatus } from '@chemisttasker/shared-core';
import { ShiftAudienceChip, ShiftStatusChip } from '../../shiftCenter/ShiftJourneyUI';
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
    counterOffersErrorByShift: Record<number, boolean>;
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
    loadCounterOffers: (shiftId: number) => Promise<void>;
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
    data,
    state,
    actions,
}: Props) {
    const {
        tabData,
        counterOffersByShift,
        counterOffersLoadingByShift,
        counterOffersErrorByShift,
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
        loadCounterOffers,
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
        const publicTabData = tabData[getTabKey(shift.id, PUBLIC_LEVEL_KEY)];
        const publicInterests = (publicTabData?.interestsAll || []).filter((interest: any) => {
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

        const summaryText = getShiftSummary(shift);
        const location = getLocationText(shift);
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
        const responseDataError = counterOffersErrorByShift[shift.id] || communityTabData.some((item) => item?.error) || publicTabData?.error;
        const responsesReady = !communityDataLoading && counterOffersLoaded && !counterOffersLoading && !responseDataError &&
            (shiftLevel !== PUBLIC_LEVEL_KEY || (publicTabData && !publicTabData.loading));
        const isAwaiting = (item: any) => item.pendingConfirmation || item.pending_confirmation || item.awaitingPayment || item.awaiting_payment;
        const actionableCount = countUniquePeople([
            ...allMembers.filter((item: any) => item.status === 'interested' && !isAwaiting(item)),
            ...allInterests.filter((item: any) => !isAwaiting(item)),
            ...allOffers.filter(isActiveCounterOffer),
        ]);
        const pendingCount = countUniquePeople([...allMembers, ...allInterests].filter((item: any) => item.pendingConfirmation || item.pending_confirmation));
        const journeyStatus = getShiftJourneyStatus(shift, { paymentRequired: showPaymentRequired, interestedCount: responsesReady ? actionableCount : 0,
            pendingConfirmationCount: responsesReady ? pendingCount : 0, responsesReady });
        const retryResponses = () => {
            void loadCounterOffers(shift.id);
            viewableLevelKeys.forEach((level) => void loadTabDataForShift(shift, level));
        };
        return (
            <Card component="article" id={`active-shift-card-${shift.id}`} aria-labelledby={`shift-title-${shift.id}`} elevation={0}
                sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', minWidth: 0 }}>
                <CardContent sx={{ p: { xs: 2, md: 3 }, '&:last-child': { pb: { xs: 2, md: 3 } } }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Shift #{shift.id}</Typography>
                            <Typography id={`shift-title-${shift.id}`} component="h3" variant="h6" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>
                                {shift.pharmacyDetail?.name ?? shift.pharmacyName ?? 'Pharmacy'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{formatShiftLabel(roleNeeded)} · {formatShiftLabel(employmentType)}</Typography>
                        </Box>
                        <Stack direction="row" spacing={0.25}>
                            <Tooltip title="Share shift"><span><IconButton aria-label={`Share shift ${shift.id}`} onClick={() => void handleShare(shift)} disabled={sharingShiftId === shift.id} sx={{ minWidth: 44, minHeight: 44 }}><Share2 fontSize="small" /></IconButton></span></Tooltip>
                            <Tooltip title="Edit shift"><IconButton aria-label={`Edit shift ${shift.id}`} onClick={() => handleEditShift(shift.id)} sx={{ minWidth: 44, minHeight: 44 }}><Edit fontSize="small" /></IconButton></Tooltip>
                            <Tooltip title="Delete shift"><IconButton aria-label={`Delete shift ${shift.id}`} onClick={() => setDeleteConfirmDialog({ open: true, shiftId: shift.id })} disabled={actionLoading[`delete_${shift.id}`]} sx={{ minWidth: 44, minHeight: 44 }}><Trash2 fontSize="small" /></IconButton></Tooltip>
                        </Stack>
                    </Stack>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ my: 2 }}>
                        <ShiftStatusChip status={journeyStatus} />
                        <ShiftAudienceChip shift={shift} dedicated={dedicated} />
                        {isUrgent && <Chip label="Urgent" size="small" color="error" variant="outlined" />}
                    </Stack>
                    <Stack spacing={0.5}>
                        <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CalendarDays fontSize="small" color="action" />{summaryText}</Typography>
                        <Typography variant="body2" color="text.secondary">{location}</Typography>
                    </Stack>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ sm: 'center' }}
                        sx={{ mt: 2.5, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                        <Box>
                            <Typography variant="body2" fontWeight={600}>{responsesReady
                                ? `${interestsCount} interested · ${candidatesCount} people · ${slotsCount} slot${slotsCount === 1 ? '' : 's'}`
                                : responseDataError ? 'Some responses could not be loaded' : 'Loading candidate responses…'}</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{journeyStatus.description}</Typography>
                        </Box>
                        <Button variant={showPaymentRequired ? 'contained' : 'outlined'} onClick={() => toggleShiftExpansion(shift.id)}
                            aria-expanded={isExpanded} aria-controls={`shift-responses-${shift.id}`}
                            endIcon={<ExpandMore sx={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }} />}
                            sx={{ minHeight: 44, flexShrink: 0 }}>
                            {isExpanded ? 'Hide details' : showPaymentRequired ? 'Review payment' : 'View responses'}
                        </Button>
                    </Stack>
                    {isExpanded && (
                        <Box id={`shift-responses-${shift.id}`}>
                            {responseDataError && <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" onClick={retryResponses}>Try again</Button>}>Some candidate responses could not be loaded.</Alert>}
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

                            {responseDataError ? null : currentTabData.loading ? (
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
                            {!responseDataError && selectedLevel === PUBLIC_LEVEL_KEY && (
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
