import { ShiftMemberStatus } from '@chemisttasker/shared-core';

export function dedupeMembers(members: ShiftMemberStatus[]): ShiftMemberStatus[] {
    const seen = new Set<number | string>();
    return members.filter(m => {
        const memberAny = m as any;
        const userId = memberAny.userId ?? memberAny.user?.id ?? memberAny.user_id ?? memberAny.id ?? null;
        if (userId == null) return true;
        if (seen.has(userId)) return false;
        seen.add(userId);
        return true;
    });
}

export function getCandidateDisplayName(member: ShiftMemberStatus): string {
    const memberAny = member as any;
    if (memberAny.firstName && memberAny.lastName) {
        return `${memberAny.firstName} ${memberAny.lastName}`;
    }
    if (member.displayName) {
        return member.displayName;
    }
    if (memberAny.email) {
        return memberAny.email;
    }
    return 'Candidate';
}

export function getInterestDisplayName(interest: any, userObj?: any): string {
    if (userObj) {
        if (userObj.firstName && userObj.lastName) {
            return `${userObj.firstName} ${userObj.lastName}`;
        }
        if (userObj.first_name && userObj.last_name) {
            return `${userObj.first_name} ${userObj.last_name}`;
        }
        if (userObj.name) return userObj.name;
        if (userObj.displayName) return userObj.displayName;
        if (userObj.display_name) return userObj.display_name;
        if (typeof userObj === 'string') return userObj;
    }

    if (interest.displayName) return interest.displayName;
    if (typeof interest.user === 'string') return interest.user;
    if (interest.userName) return interest.userName;
    return 'Candidate';
}

export function findInterestForOffer(offer: any, tabData: any, slotId: number | null): any {
    if (!tabData?.interestsAll) return null;

    const offerUserId = typeof offer.user === 'object' ? offer.user?.id : offer.user;

    return tabData.interestsAll.find((i: any) => {
        const iUserId = i.userId ?? i.user?.id ?? null;
        const slotMatch = slotId == null || i.slotId == null || i.slotId === slotId;
        return iUserId === offerUserId && slotMatch;
    });
}

export function markInterestRevealedInState(
    tabData: Record<string, any>,
    shiftId: number,
    levelKey: string,
    interestId: number,
    userDetail: any
): Record<string, any> {
    const key = `${shiftId}_${levelKey}`;
    const current = tabData[key];
    if (!current) return tabData;

    const updatedInterestsAll = (current.interestsAll || []).map((i: any) =>
        i.id === interestId ? { ...i, revealed: true, user: userDetail, user_detail: userDetail } : i
    );

    const updatedInterestsBySlot: Record<number, any[]> = {};
    Object.entries(current.interestsBySlot || {}).forEach(([sid, list]) => {
        updatedInterestsBySlot[Number(sid)] = (list as any[]).map(i =>
            i.id === interestId ? { ...i, revealed: true, user: userDetail, user_detail: userDetail } : i
        );
    });

    return {
        ...tabData,
        [key]: {
            ...current,
            interestsAll: updatedInterestsAll,
            interestsBySlot: updatedInterestsBySlot,
        },
    };
}

export function findOfferForMemberInShift(
    offers: any[],
    member: ShiftMemberStatus,
    selectedSlotId: number | null
): any | null {
    if (!offers || offers.length === 0) return null;

    const getUserId = (record: any): number | null => {
        const raw =
            record?.userId ??
            record?.user_id ??
            record?.userDetail?.id ??
            record?.user_detail?.id ??
            (typeof record?.user === 'object' ? record.user?.id : record?.user) ??
            null;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const getSlotId = (record: any): number | null => {
        const raw = record?.slotId ?? record?.slot_id ?? record?.slot?.id ?? record?.slot ?? null;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const memberAny = member as any;
    const userId = getUserId(memberAny);
    const memberSlotId = getSlotId(memberAny);

    return offers.find((offer: any) => {
        const offerUserId = getUserId(offer);
        if (offerUserId !== userId) return false;

        const effectiveSlotId = selectedSlotId ?? memberSlotId;
        if (effectiveSlotId == null) return true;

        const offerSlots = offer.slots || offer.offer_slots || [];
        if (offerSlots.length === 0) {
            const offerSlotId = getSlotId(offer);
            return offerSlotId == null || offerSlotId === effectiveSlotId;
        }

        return offerSlots.some((s: any) => getSlotId(s) === effectiveSlotId);
    }) || null;
}
