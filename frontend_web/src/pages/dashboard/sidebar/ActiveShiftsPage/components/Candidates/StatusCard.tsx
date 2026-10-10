import React from 'react';
import { ShiftMemberStatus } from '@chemisttasker/shared-core';
import { CandidateColumn, CandidateRow, Pill, RowAction, type ShiftTone } from '../ShiftCentreParts';
import { getAudienceLevel, humanizeEnum } from '../../utils/audience';

interface StatusCardProps {
    title: string;
    /** One line under the title saying what this column means. */
    helper: string;
    emptyText: string;
    members: ShiftMemberStatus[];
    icon: React.ReactElement;
    tone: ShiftTone;
    /** Only the Interested column offers review / buzz actions. */
    actionable?: boolean;
    shiftId: number;
    onReviewCandidate: (member: ShiftMemberStatus, shiftId: number, offer: any | null, slotId: number | null) => void;
    getOfferForMember?: (member: ShiftMemberStatus) => { offer: any | null; slotId: number | null };
    reviewLoadingId?: number | null;
    onBuzzWorker?: (offerId: number) => void;
    buzzLoadingOfferId?: number | null;
}

export const StatusCard: React.FC<StatusCardProps> = ({
    title,
    helper,
    emptyText,
    members,
    icon,
    tone,
    actionable = false,
    shiftId,
    onReviewCandidate,
    getOfferForMember,
    reviewLoadingId,
    onBuzzWorker,
    buzzLoadingOfferId,
}) => (
    <CandidateColumn title={title} helper={helper} tone={tone} icon={icon} count={members.length} emptyText={emptyText}>
        {members.map((member) => {
            const memberAny = member as any;
            const name = memberAny.name || [memberAny.first_name, memberAny.last_name].filter(Boolean).join(' ') || 'Team member';
            const ratingValue = memberAny.averageRating ?? memberAny.rating ?? null;
            const match = getOfferForMember ? getOfferForMember(member) : { offer: null, slotId: null };
            const hasOffer = Boolean(match.offer);
            const pendingConfirmation = Boolean(memberAny.pendingConfirmation ?? memberAny.pending_confirmation);
            const awaitingPayment = Boolean(memberAny.awaitingPayment ?? memberAny.awaiting_payment);
            const isCounterOffer = hasOffer && Boolean(
                match.offer?.counterOffer ?? match.offer?.counter_offer ?? match.offer?.slots
            );
            const offerStatus = String(match.offer?.status ?? '').toUpperCase();
            const isPendingConfirmation = !awaitingPayment && !isCounterOffer && (
                pendingConfirmation || (hasOffer && offerStatus === 'PENDING')
            );
            const pendingOfferId = memberAny.pendingOfferId ?? memberAny.pending_offer_id ?? match.offer?.id ?? null;
            const sourceVisibility = memberAny.sourceVisibility ?? memberAny.visibilityLevel ?? memberAny.visibility_level;
            const organizationName = memberAny.organizationName ?? memberAny.organization_name;
            const sourceLabel = sourceVisibility === 'ORG_CHAIN' && organizationName
                ? organizationName
                : getAudienceLevel(sourceVisibility)?.label;
            const meta = [humanizeEnum(memberAny.employmentType ?? memberAny.employment_type), sourceLabel && `via ${sourceLabel}`]
                .filter(Boolean)
                .join(' · ');

            const pills = actionable ? (
                <>
                    {isPendingConfirmation && <Pill tone="amber" label="Offer sent · awaiting reply" />}
                    {awaitingPayment && <Pill tone="red" label="Awaiting payment" />}
                    {isCounterOffer && !isPendingConfirmation && <Pill tone="violet" label="Counter offer" />}
                </>
            ) : null;

            const actions = actionable ? (
                <>
                    <RowAction
                        kind={isPendingConfirmation || awaitingPayment ? 'secondary' : 'primary'}
                        loading={reviewLoadingId === memberAny.userId}
                        disabled={reviewLoadingId === memberAny.userId}
                        onClick={() => {
                            const reviewMember = isPendingConfirmation && match.offer?.id != null
                                ? {
                                    ...memberAny,
                                    pendingConfirmation: true,
                                    pendingOfferId: match.offer.id,
                                    pendingConfirmationCounterOffer: match.offer,
                                }
                                : member;
                            onReviewCandidate(
                                reviewMember,
                                shiftId,
                                isPendingConfirmation || awaitingPayment ? null : match.offer,
                                match.slotId
                            );
                        }}
                    >
                        {isPendingConfirmation || awaitingPayment ? 'View' : isCounterOffer ? 'Review offer' : 'Review'}
                    </RowAction>
                    {isPendingConfirmation && pendingOfferId != null && onBuzzWorker && (
                        <RowAction
                            kind="buzz"
                            title="Send a reminder to confirm"
                            loading={buzzLoadingOfferId === Number(pendingOfferId)}
                            disabled={buzzLoadingOfferId === Number(pendingOfferId)}
                            onClick={() => onBuzzWorker(Number(pendingOfferId))}
                        >
                            Buzz
                        </RowAction>
                    )}
                </>
            ) : null;

            return (
                <CandidateRow
                    key={memberAny.userId}
                    name={name}
                    meta={meta || undefined}
                    rating={typeof ratingValue === 'number' ? ratingValue : null}
                    tone={tone}
                    pills={pills}
                    actions={actions}
                />
            );
        })}
    </CandidateColumn>
);
