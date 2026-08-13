import apiClient from '../../../../../utils/apiClient';
import { ShiftCounterOfferPayload } from '@chemisttasker/shared-core';

export async function submitCounterOfferDirect(payload: ShiftCounterOfferPayload) {
  const body = {
    request_travel: payload.requestTravel ?? false,
    travel_origin_input: payload.travelOrigin ?? payload.travel_origin ?? '',
    slots: (payload.slots || []).map((slot) => ({
      slot_id: slot.slotId,
      slot_date: slot.slotDate,
      proposed_start_time: slot.proposedStartTime,
      proposed_end_time: slot.proposedEndTime,
      proposed_rate: slot.proposedRate ?? null,
    })),
  };
  await apiClient.post(`/client-profile/shifts/${payload.shiftId}/counter-offers/`, body);
}
