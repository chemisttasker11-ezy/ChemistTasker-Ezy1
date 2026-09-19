import type { Shift, ShiftInterest, ShiftMemberStatus } from '@chemisttasker/shared-core';

export const ACTIVE_SHIFT_SLOT_SEEN_KEY_PREFIX = 'active_shift_slot_seen_v2';

export const toFiniteNumber = (raw: any): number | null => {
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
};

export const resolveSlotIdAny = (slot: any): number | null => {
    const raw = slot?.id ?? slot?.slotId ?? slot?.slot_id ?? null;
    return toFiniteNumber(raw);
};

export const getSlotIds = (shift: Shift): number[] => {
    const slots = (shift as any).slots || [];
    return slots
        .map((slot: any) => resolveSlotIdAny(slot))
        .filter((id: number | null): id is number => id != null);
};

export const slotHasAwaitingPayment = (slot: any): boolean => {
    return Boolean(slot?.awaitingPayment ?? slot?.awaiting_payment);
};

export const getSlotAwaitingPaymentOfferId = (slot: any): number | null => {
    return toFiniteNumber(slot?.awaitingPaymentOfferId ?? slot?.awaiting_payment_offer_id);
};

export const formatAuSlotDateTime = (slot: any): string => {
    const date = slot?.date ? new Date(`${slot.date}T00:00:00`) : null;
    const dateLabel = date && !Number.isNaN(date.getTime())
        ? new Intl.DateTimeFormat('en-AU', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        }).format(date)
        : 'Date not set';
    const time = [slot?.startTime ?? slot?.start_time, slot?.endTime ?? slot?.end_time]
        .filter(Boolean)
        .map((value: string) => String(value).slice(0, 5))
        .join(' - ');
    return time ? `${dateLabel} | ${time}` : dateLabel;
};

export const getCandidateNameForPaymentSlot = (shift: Shift, slotId: number): string => {
    const offers = ((shift as any).offers ?? (shift as any).shiftOffers ?? []) as any[];
    const match = offers.find((offer) => {
        const status = String(offer?.status ?? '').toUpperCase();
        const offerSlotId = toFiniteNumber(
            offer?.slotId ?? offer?.slot_id ?? offer?.slot?.id ?? offer?.slot,
        );
        return status === 'ACCEPTED_AWAITING_PAYMENT' && offerSlotId === slotId;
    });
    const user =
        match?.userDetail ??
        match?.user_detail ??
        (typeof match?.user === 'object' ? match.user : null);
    const name =
        user?.name ||
        user?.displayName ||
        user?.display_name ||
        [user?.firstName ?? user?.first_name, user?.lastName ?? user?.last_name]
            .filter(Boolean)
            .join(' ');
    return name || 'Participant';
};

export const shouldShowPaymentRequired = (
    shift: Shift,
    selectedSlotId: number | null,
): boolean => {
    const shiftAny = shift as any;
    const paymentStatus = shiftAny.paymentStatus ?? shiftAny.payment_status;
    if (paymentStatus !== 'PENDING') return false;

    const slots = Array.isArray(shiftAny.slots) ? shiftAny.slots : [];
    const isSingleUserShift = Boolean(shiftAny.singleUserOnly ?? shiftAny.single_user_only);
    if (selectedSlotId != null) {
        const selectedSlot = slots.find((slot: any) => resolveSlotIdAny(slot) === selectedSlotId);
        if (selectedSlot && slotHasAwaitingPayment(selectedSlot)) return true;
        if (selectedSlot && ('awaiting_payment' in selectedSlot || 'awaitingPayment' in selectedSlot)) {
            return false;
        }
    }

    const rawPendingSlotIds = shiftAny.pendingPaymentSlotIds ?? shiftAny.pending_payment_slot_ids;
    if (!Array.isArray(rawPendingSlotIds)) return isSingleUserShift || slots.length <= 1;
    if (selectedSlotId == null) return false;

    const pendingSlotIds = rawPendingSlotIds
        .map((value: any) => Number(value))
        .filter((value: number) => Number.isFinite(value));
    return pendingSlotIds.includes(selectedSlotId);
};

export const offerBelongsToSlot = (offer: any, slotId: number) => {
    const offerSlots = offer?.slots || offer?.offer_slots || [];
    if (Array.isArray(offerSlots) && offerSlots.length > 0) {
        return offerSlots.some(
            (slot: any) =>
                resolveSlotIdAny(slot?.slot) === slotId || resolveSlotIdAny(slot) === slotId,
        );
    }
    const fallbackSlotId =
        resolveSlotIdAny(offer?.slot) ?? toFiniteNumber(offer?.slot_id ?? offer?.slotId);
    if (fallbackSlotId == null) return false;
    return fallbackSlotId === slotId;
};

export const interestBelongsToSlot = (interest: any, slotId: number) => {
    const explicitSlotId =
        resolveSlotIdAny(interest?.slot) ??
        toFiniteNumber(interest?.slot_id ?? interest?.slotId);
    if (explicitSlotId == null) return false;
    return explicitSlotId === slotId;
};

export const findInterestForMember = (
    member: any,
    data: any,
    slotId: number | null,
): ShiftInterest | null => {
    const memberUserId = toFiniteNumber(member?.userId ?? member?.user_id ?? member?.user?.id);
    const lists: any[] = [];
    if (slotId != null) {
        lists.push(...(data?.interestsBySlot?.[slotId] ?? data?.interests_by_slot?.[slotId] ?? []));
    }
    lists.push(...(data?.interestsAll ?? data?.interests_all ?? []));

    return (
        lists.find((interest: any) => {
            const interestUserId = toFiniteNumber(
                interest?.userId ??
                interest?.user_id ??
                interest?.userDetail?.id ??
                interest?.user_detail?.id ??
                (typeof interest?.user === 'object' ? interest.user?.id : interest?.user),
            );
            const slotMatches = slotId == null || interestBelongsToSlot(interest, slotId);
            return memberUserId != null && interestUserId === memberUserId && slotMatches;
        }) ?? null
    );
};

export const buildPublicSlotSignature = (slotId: number, interests: any[], offers: any[]) => {
    const interestSig = interests
        .filter((interest: any) => interestBelongsToSlot(interest, slotId))
        .map((interest: any) => {
            const userId = interest?.userId ?? interest?.user_id ?? interest?.user?.id ?? '';
            const timestamp = interest?.expressedAt ?? interest?.expressed_at ?? '';
            return `${interest?.id ?? ''}:${userId}:${interest?.revealed ? 1 : 0}:${timestamp}`;
        })
        .sort()
        .join('|');

    const offerSig = offers
        .filter((offer: any) => offerBelongsToSlot(offer, slotId))
        .map(
            (offer: any) =>
                `${offer?.id ?? ''}:${offer?.status ?? ''}:${
                    offer?.updatedAt ??
                    offer?.updated_at ??
                    offer?.createdAt ??
                    offer?.created_at ??
                    ''
                }`,
        )
        .sort()
        .join('|');

    return `i:${interestSig}#o:${offerSig}`;
};

export const buildMemberSlotSignature = (
    slotId: number,
    members: ShiftMemberStatus[],
    offers: any[],
) => {
    const memberSig = members
        .map((member: any) => `${member?.userId ?? member?.user_id ?? ''}:${member?.status ?? ''}`)
        .sort()
        .join('|');
    const offerSig = offers
        .filter((offer: any) => offerBelongsToSlot(offer, slotId))
        .map(
            (offer: any) =>
                `${offer?.id ?? ''}:${offer?.status ?? ''}:${
                    offer?.updatedAt ??
                    offer?.updated_at ??
                    offer?.createdAt ??
                    offer?.created_at ??
                    ''
                }`,
        )
        .sort()
        .join('|');
    return `m:${memberSig}#o:${offerSig}`;
};

const getPersonIdentity = (record: any): string | null => {
    if (!record) return null;
    const user = record.user;
    const userDetail = record.userDetail ?? record.user_detail;
    const rawId =
        record.userId ??
        record.user_id ??
        userDetail?.id ??
        (typeof user === 'object' ? user?.id : user) ??
        null;
    if (rawId != null) return `user:${rawId}`;

    const email =
        record.email ?? userDetail?.email ?? (typeof user === 'object' ? user?.email : null);
    if (email) return `email:${String(email).toLowerCase()}`;

    const recordId = record.id ?? null;
    return recordId != null ? `record:${recordId}` : null;
};

export const countUniquePeople = (records: any[]): number => {
    const seen = new Set<string>();
    records.forEach((record) => {
        const key = getPersonIdentity(record);
        if (key) seen.add(key);
    });
    return seen.size;
};

export const isActiveCounterOffer = (offer: any): boolean => {
    const status = String(offer?.status ?? '').toLowerCase();
    return !['accepted', 'rejected', 'declined', 'cancelled', 'canceled', 'expired'].includes(status);
};

export const getCandidateUserId = (record: any): number | null => {
    const raw =
        record?.userId ??
        record?.user_id ??
        record?.userDetail?.id ??
        record?.user_detail?.id ??
        (typeof record?.user === 'object' ? record.user?.id : record?.user) ??
        null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
};
