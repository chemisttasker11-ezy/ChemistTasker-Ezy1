import { Shift } from '@chemisttasker/shared-core';

// Map offer slots to include shift context and selected-slot filtering.
// - For single-user shifts: show all offered slots (or a single shift-wide entry if none provided).
// - For multi-slot shifts: show slots matching filterSlotId when provided; otherwise show all.
export function mapOfferSlotsWithShift(
    offer: any,
    shift: Shift,
    filterSlotId: number | null
) {
    const offerSlots = offer.slots || offer.offer_slots || [];
    const shiftSlots = shift.slots || [];
    const shiftAny = shift as any;

    const mapEntry = (os: any) => {
        const slotId = os.slot_id ?? os.slotId ?? os.slot?.id ?? null;
        const matchedSlot = shiftSlots.find((ss: any) => ss.id === slotId);
        const date =
            os.slot_date ??
            os.slotDate ??
            matchedSlot?.date ??
            os.slot?.date ??
            shiftAny.date ??
            null;
        const proposedStart =
            os.proposed_start_time ??
            os.proposedStartTime ??
            os.start_time ??
            os.startTime ??
            os.start ??
            null;
        const proposedEnd =
            os.proposed_end_time ??
            os.proposedEndTime ??
            os.end_time ??
            os.endTime ??
            os.end ??
            null;
        const proposedRate = os.proposed_rate ?? os.proposedRate ?? os.rate ?? null;
        return {
            slotId,
            date,
            proposedStart,
            proposedEnd,
            proposedRate,
        };
    };

    if (shift.singleUserOnly) {
        if (offerSlots.length > 0) {
            return offerSlots.map(mapEntry);
        }
        return [
            {
                slotId: null,
                date: shiftAny.date ?? null,
                proposedStart: offer.proposedStartTime ?? offer.proposed_start_time ?? null,
                proposedEnd: offer.proposedEndTime ?? offer.proposed_end_time ?? null,
                proposedRate: offer.proposedRate ?? offer.proposed_rate ?? null,
            },
        ];
    }

    const filtered =
        filterSlotId == null
            ? offerSlots
            : offerSlots.filter(
                (os: any) => (os.slot_id ?? os.slotId ?? os.slot?.id) === filterSlotId
            );
    const finalList = filtered.length > 0 ? filtered : offerSlots;

    return finalList.map(mapEntry);
}
