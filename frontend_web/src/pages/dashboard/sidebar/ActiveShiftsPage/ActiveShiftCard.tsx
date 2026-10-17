import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
    Box,
    Button,
    Card,
    Checkbox,
    Divider,
    FormControlLabel,
    IconButton,
    Skeleton,
    Stack,
    Tooltip,
    Typography,
} from '@mui/material';
import {
    Building2,
    CalendarDays,
    ChevronDown,
    CreditCard,
    Lock,
    MapPin,
    Pencil,
    Share2,
    Trash2,
    UserCheck,
    Users,
} from 'lucide-react';
import IconTile, { type Tone } from '../../../../components/ui/IconTile';
import { NewActivityBadge, PlatformMark } from '../../shiftCenter/ShiftCentreParts';
import { Hint } from '../../../../components/ui/Hint';
import { Pill } from '../../../../components/ui/Pill';
import { getAudienceLevel } from './utils/audience';
import { humanizeEnum } from '../../../../utils/labels';
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
    isDarkMode: _isDarkMode,
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
        // Candidate counts are only final once every audience list has loaded; until then show a placeholder, not 0.
        const publicTabData = viewableLevelKeys.includes(PUBLIC_LEVEL_KEY) ? tabData[getTabKey(shift.id, PUBLIC_LEVEL_KEY)] : undefined;
        const countsLoading = communityDataLoading || (viewableLevelKeys.includes(PUBLIC_LEVEL_KEY) && (!publicTabData || publicTabData.loading));
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
                if (!offerId || (!slotId && !isSingleUserShift)) return null;
                const resolvedSlotId = slotId ?? 0;
                const slot = slotById.get(resolvedSlotId) || (((shift as any).slots || []) as any[])[0] || {
                    id: resolvedSlotId,
                    date: option.slotDate ?? option.slot_date,
                    start_time: option.startTime ?? option.start_time,
                    end_time: option.endTime ?? option.end_time,
                };
                return {
                    offerId,
                    slotId: resolvedSlotId,
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
        const reservationDueTimes = (((shift as any).paymentOptions ?? (shift as any).payment_options ?? []) as any[])
            .map(option => option.paymentDueAt ?? option.payment_due_at)
            .filter((value): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
            .sort();
        const earliestReservationDue = reservationDueTimes[0] ?? null;
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
        const updatedSlotCount = Object.values(slotHasUpdatesByShift[shift.id] || {}).filter(Boolean).length;
        const audience = getAudienceLevel(shiftLevel);
        const audienceLabel = audience ? (labelOverrides?.[audience.key] ?? audience.label) : null;
        const AudienceIcon = audience?.icon;
        const internalAudienceLabels = communityLevelKeys
            .map((level) => getAudienceLevel(level)?.label)
            .filter((label): label is string => Boolean(label));
        const pharmacyName = (shift as any).pharmacyDetail?.name ?? 'Unnamed Pharmacy';
        const metricItems: Array<{ label: string; value: number | string; icon: ReactNode; tone: Tone; hint: string; loading?: boolean }> = [
            { label: 'Slots', value: slotsCount || '-', icon: <CalendarDays />, tone: 'violet', hint: 'Dates in this shift. Each date is filled separately.' },
            { label: 'Candidates', value: candidatesCount, icon: <Users />, tone: 'magenta', hint: 'Everyone who responded or was invited, across all dates and audiences.', loading: countsLoading },
            { label: 'Interested', value: interestsCount, icon: <UserCheck />, tone: 'cyan', hint: 'Said yes or sent an offer, and are waiting for your review.', loading: countsLoading },
        ];
        const iconButtonSx = {
            width: 36,
            height: 36,
            borderRadius: '10px',
            color: 'var(--ct-text-secondary)',
            '& svg': { width: 18, height: 18 },
            '&:hover': { bgcolor: 'var(--ct-tone-violet-bg)', color: 'var(--ct-accent-strong)' },
        };
        const candidatesLoading = (
            <Box role="status" aria-label="Loading candidates" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 1.5 }}>
                {[0, 1, 2, 3].map((index) => (
                    <Skeleton key={index} variant="rounded" height={168} sx={{ borderRadius: '16px' }} />
                ))}
            </Box>
        );
        const communityView = (showSlotSelector: boolean) => (
            communityDataLoading ? candidatesLoading : (
                <CommunityLevelView
                    shift={shift}
                    members={membersForView}
                    selectedSlotId={selectedSlotId}
                    slotHasUpdates={slotHasUpdatesByShift[shift.id] || {}}
                    slotCandidateCounts={slotCandidateCounts}
                    slotStatusCounts={slotStatusCounts}
                    offers={offers || []}
                    showSlotSelector={showSlotSelector}
                    audienceLabels={internalAudienceLabels}
                    onSelectSlot={(slotId) => handleSlotSelection(shift.id, slotId)}
                    onReviewCandidate={(member, _shiftId, offer, slotId) =>
                        handleReviewCandidate(shift, member, offer, slotId)
                    }
                    reviewLoadingId={reviewLoadingId}
                    onBuzzWorker={handleBuzzWorker}
                    buzzLoadingOfferId={buzzLoadingOfferId}
                />
            )
        );

        return (
            <Card
                id={`active-shift-card-${shift.id}`}
                key={shift.id}
                onClick={() => toggleShiftExpansion(shift.id)}
                sx={{
                    position: 'relative',
                    overflow: 'hidden',
                    maxWidth: '100%',
                    borderRadius: 'var(--ct-card-radius)',
                    border: '1px solid',
                    borderColor: isExpanded ? 'var(--ct-tone-violet-bg)' : 'var(--ct-border-color)',
                    background: 'var(--ct-surface-bg)',
                    boxShadow: isExpanded ? '0 14px 36px rgba(6, 18, 58, 0.08)' : 'none',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    '&:hover': {
                        borderColor: 'var(--ct-tone-violet-bg)',
                        boxShadow: '0 10px 28px rgba(6, 18, 58, 0.07)',
                    },
                    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                }}
            >
                {/* Summary: what, where, when, and how it is going. */}
                <Box
                    sx={{
                        p: { xs: 2, md: 3 },
                        pb: { xs: 2, md: 2.5 },
                        display: 'grid',
                        gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) auto' },
                        gap: { xs: 2, lg: 3 },
                        alignItems: 'start',
                    }}
                >
                    <Stack direction="row" spacing={2} sx={{ minWidth: 0 }}>
                        <IconTile icon={<Building2 />} tone="violet" size={48} />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
                                <Typography component="h3" sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, color: 'var(--ct-text-primary)', fontSize: { xs: 18, sm: 20 }, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
                                    {pharmacyName}
                                </Typography>
                                <Box onClick={(event) => event.stopPropagation()} sx={{ display: { xs: 'flex', lg: 'none' }, gap: 0.25, flexShrink: 0 }}>
                                    {/* Phone/tablet: actions sit beside the title. */}
                                    {renderShiftActions()}
                                </Box>
                            </Stack>
                            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                                {roleNeeded && <Pill tone="navy" label={humanizeEnum(roleNeeded)} />}
                                {employmentType && <Pill outlined label={humanizeEnum(employmentType)} />}
                                {isUrgent && <Pill tone="red" label="Urgent" />}
                                {summaryText && <Pill outlined icon={<CalendarDays />} label={summaryText} />}
                                {dedicated && <Pill tone="blue" icon={<Lock />} label="Direct / Private" />}
                                {dedicated && <Pill tone="amber" label="Pending" />}
                            </Stack>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1.25, color: 'var(--ct-text-secondary)', '& svg': { width: 15, height: 15, flexShrink: 0 } }}>
                                <MapPin />
                                <Typography sx={{ fontSize: 13.5, color: 'inherit', overflowWrap: 'anywhere' }}>{location}</Typography>
                            </Stack>
                        </Box>
                    </Stack>

                    <Stack spacing={1.25} alignItems={{ xs: 'stretch', lg: 'flex-end' }} sx={{ minWidth: 0 }}>
                        <Box onClick={(event) => event.stopPropagation()} sx={{ display: { xs: 'none', lg: 'flex' }, gap: 0.25 }}>
                            {renderShiftActions()}
                        </Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, width: { xs: '100%', lg: 408 } }}>
                            {metricItems.map((item) => (
                                <Hint key={item.label} title={item.loading ? `Counting ${item.label.toLowerCase()}` : `${item.value} ${item.label.toLowerCase()}`} body={item.hint}>
                                    <Stack
                                        direction="row"
                                        spacing={1.25}
                                        alignItems="center"
                                        sx={{ minWidth: 0, p: { xs: 1, sm: 1.25 }, borderRadius: '14px', border: '1px solid var(--ct-border-color)', bgcolor: 'var(--ct-surface-bg)', cursor: 'help' }}
                                    >
                                        <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                                            <IconTile icon={item.icon} tone={item.tone} size={36} />
                                        </Box>
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 22, lineHeight: 1.05, color: 'var(--ct-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                                {item.loading ? <Skeleton variant="text" width={26} aria-label="Loading" /> : item.value}
                                            </Typography>
                                            <Typography sx={{ fontSize: 12, color: 'var(--ct-text-secondary)', lineHeight: 1.3 }}>{item.label}</Typography>
                                        </Box>
                                    </Stack>
                                </Hint>
                            ))}
                        </Box>
                    </Stack>
                </Box>

                {/* Status bar: who can see it, what needs attention, and the candidates toggle. */}
                <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.25}
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                    justifyContent="space-between"
                    sx={{ px: { xs: 2, md: 3 }, py: 1.25, borderTop: '1px solid var(--ct-border-color)', bgcolor: 'var(--ct-subtle-bg)' }}
                >
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ minWidth: 0 }}>
                        {audienceLabel && (
                            <Hint
                                title={audience?.scope === 'platform' ? 'Open to the ChemistTasker platform' : 'Internal only'}
                                body={`Visible now to ${audience?.reach}.${audience?.scope === 'internal' ? ' Escalate inside the card to reach more people.' : ''}`}
                            >
                                <Box component="span" tabIndex={0} onClick={(event) => event.stopPropagation()} sx={{ display: 'inline-flex', borderRadius: '999px', '&:focus-visible': { outline: '2px solid var(--ct-accent-strong)', outlineOffset: 2 } }}>
                                    <Pill
                                        tone={audience?.scope === 'platform' ? 'cyan' : 'violet'}
                                        icon={audience?.scope === 'platform' ? <PlatformMark size={15} /> : AudienceIcon ? <AudienceIcon /> : undefined}
                                        label={`${audience?.scope === 'platform' ? 'Platform' : 'Internal'} · ${audienceLabel}`}
                                    />
                                </Box>
                            </Hint>
                        )}
                        {interestsCount > 0 && (
                            <Pill tone="cyan" icon={<UserCheck />} label={`${interestsCount} waiting for review`} />
                        )}
                        {showPaymentRequired && <Pill tone="red" icon={<CreditCard />} label="Payment required" />}
                        {updatedSlotCount > 0 && (
                            <Box component="span" onClick={(event) => event.stopPropagation()}>
                                <NewActivityBadge
                                    label={`New activity${slotsCount > 1 ? ` on ${updatedSlotCount} ${updatedSlotCount === 1 ? 'date' : 'dates'}` : ''}`}
                                    hint="Someone showed interest, sent an offer or replied since you last looked. Open the candidates and select the marked date to review it."
                                />
                            </Box>
                        )}
                    </Stack>
                    <Button
                        size="small"
                        aria-expanded={isExpanded}
                        aria-controls={`active-shift-details-${shift.id}`}
                        onClick={(event) => {
                            event.stopPropagation();
                            toggleShiftExpansion(shift.id);
                        }}
                        endIcon={<ChevronDown style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
                        sx={{ alignSelf: { xs: 'flex-end', sm: 'center' }, minHeight: 36, px: 1.5, borderRadius: '10px', color: 'var(--ct-accent-strong)', fontWeight: 600, '&:hover': { bgcolor: 'var(--ct-tone-violet-bg)' }, '& .MuiButton-endIcon svg': { width: 16, height: 16 } }}
                    >
                        {isExpanded ? 'Hide candidates' : 'Manage candidates'}
                    </Button>
                </Stack>

                {isExpanded && (
                    <Stack
                        id={`active-shift-details-${shift.id}`}
                        spacing={3}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                        sx={{ px: { xs: 2, md: 3 }, py: { xs: 2.5, md: 3 }, borderTop: '1px solid var(--ct-border-color)' }}
                    >
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
                            <Box component="section" aria-label="Payment required" sx={{ borderRadius: '16px', border: '1px solid var(--ct-status-red-bg)', overflow: 'hidden' }}>
                                <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5, bgcolor: 'var(--ct-status-red-bg)' }}>
                                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                                        <Box sx={{ color: 'var(--ct-status-red-fg)', display: 'grid', '& svg': { width: 20, height: 20 } }}><CreditCard /></Box>
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography component="h3" sx={{ fontSize: 15, fontWeight: 600, color: 'var(--ct-status-red-fg)' }}>Payment required to confirm</Typography>
                                            <Typography sx={{ fontSize: 12.5, color: 'var(--ct-text-secondary)' }}>
                                                {isSingleUserShift
                                                    ? `${paymentRequiredOffers.length} bundle payment option${paymentRequiredOffers.length === 1 ? '' : 's'}`
                                                    : `${paymentUnitCount} selected of ${paymentRequiredOffers.length} payment option${paymentRequiredOffers.length === 1 ? '' : 's'}`}
                                            </Typography>
                                            {earliestReservationDue && (
                                                <Typography sx={{ fontSize: 12, color: 'var(--ct-status-red-fg)' }}>
                                                    Reservation expires {new Date(earliestReservationDue).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Stack>
                                    <Typography sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 20, color: 'var(--ct-text-primary)', whiteSpace: 'nowrap' }}>
                                        ${paymentUnitCount * 30} <Box component="span" sx={{ fontSize: 13, color: 'var(--ct-text-secondary)', fontFamily: 'var(--ct-font-body)' }}>AUD</Box>
                                    </Typography>
                                </Stack>
                                <Stack spacing={1} sx={{ p: 1.5, bgcolor: 'var(--ct-surface-bg)' }}>
                                    {paymentRequiredOffers.map((item) => {
                                        const checked = selectedPaymentOfferIds.includes(item.offerId);
                                        const bundleSlots = isSingleUserShift ? (((shift as any).slots || []) as any[]) : [];
                                        return (
                                            <Stack
                                                key={`${shift.id}-${item.offerId}`}
                                                direction="row"
                                                alignItems="center"
                                                justifyContent="space-between"
                                                spacing={2}
                                                sx={{ px: 1.25, py: 1, borderRadius: '12px', border: '1px solid var(--ct-border-color)' }}
                                            >
                                                {isSingleUserShift ? (
                                                    <Box sx={{ minWidth: 0 }}>
                                                        <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ct-text-primary)' }}>
                                                            {item.name} · Offer #{item.offerId}
                                                        </Typography>
                                                        <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                                                            {(bundleSlots.length > 0 ? bundleSlots : [item.slot]).filter(Boolean).map((slot: any, idx: number) => (
                                                                <Typography key={resolveSlotId(slot) ?? idx} sx={{ fontSize: 12.5, color: 'var(--ct-text-secondary)' }}>
                                                                    {formatAuSlotDateTime(slot)}
                                                                </Typography>
                                                            ))}
                                                        </Stack>
                                                    </Box>
                                                ) : (
                                                    <FormControlLabel
                                                        sx={{ m: 0, minWidth: 0 }}
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
                                                            <Box sx={{ minWidth: 0 }}>
                                                                <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ct-text-primary)' }}>
                                                                    {formatAuSlotDateTime(item.slot)}
                                                                </Typography>
                                                                <Typography sx={{ fontSize: 12.5, color: 'var(--ct-text-secondary)' }}>
                                                                    {item.name} · Offer #{item.offerId}
                                                                </Typography>
                                                            </Box>
                                                        }
                                                    />
                                                )}
                                                <Pill tone="red" label="Payment pending" />
                                            </Stack>
                                        );
                                    })}
                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="flex-end" sx={{ pt: 0.5 }}>
                                        <Button
                                            variant="contained"
                                            disabled={paymentUnitCount === 0}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void handlePayWithStripe(shift, effectivePaymentOfferIds);
                                            }}
                                        >
                                            {isSingleUserShift ? 'Pay with Stripe' : 'Pay selected with Stripe'}
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            disabled={paymentUnitCount === 0 || pillPayingShiftId === shift.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void handlePayWithPills(shift, effectivePaymentOfferIds);
                                            }}
                                        >
                                            {pillPayingShiftId === shift.id ? 'Paying…' : isSingleUserShift ? 'Pay with Pills' : 'Pay selected with Pills'}
                                        </Button>
                                    </Stack>
                                </Stack>
                            </Box>
                        )}

                        <Divider />

                        {currentTabData.loading ? candidatesLoading : selectedLevel === PUBLIC_LEVEL_KEY ? (
                            <>
                                {counterOffersLoading || !counterOffersLoaded ? candidatesLoading : (
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
                                )}
                                {communityView(false)}
                            </>
                        ) : communityView(true)}
                    </Stack>
                )}
            </Card>
        );

        function renderShiftActions() {
            return (
                <>
                    <Tooltip title="Share shift link">
                        <span>
                            <IconButton
                                aria-label="Share shift link"
                                sx={iconButtonSx}
                                onClick={e => {
                                    e.stopPropagation();
                                    handleShare(shift);
                                }}
                                disabled={sharingShiftId === shift.id}
                            >
                                <Share2 />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Edit shift">
                        <IconButton
                            aria-label="Edit shift"
                            sx={iconButtonSx}
                            onClick={e => {
                                e.stopPropagation();
                                handleEditShift(shift.id);
                            }}
                        >
                            <Pencil />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete shift">
                        <span>
                            <IconButton
                                aria-label="Delete shift"
                                sx={{ ...iconButtonSx, '&:hover': { bgcolor: 'var(--ct-status-red-bg)', color: 'var(--ct-status-red-fg)' } }}
                                onClick={e => {
                                    e.stopPropagation();
                                    setDeleteConfirmDialog({ open: true, shiftId: shift.id });
                                }}
                                disabled={actionLoading[`delete_${shift.id}`]}
                            >
                                <Trash2 />
                            </IconButton>
                        </span>
                    </Tooltip>
                </>
            );
        }
    }
