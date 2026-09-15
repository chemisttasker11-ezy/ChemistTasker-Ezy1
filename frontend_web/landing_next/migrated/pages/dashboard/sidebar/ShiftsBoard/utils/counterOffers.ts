import { CounterOfferTrack } from '../types';

export const normalizeCounterOffers = (raw: any): Record<number, CounterOfferTrack> => {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<number, CounterOfferTrack> = {};
  Object.entries(raw).forEach(([shiftIdStr, payload]) => {
    const shiftId = Number(shiftIdStr);
    if (!Number.isFinite(shiftId) || !payload || typeof payload !== 'object') return;
    const slotsObj = (payload as any).slots || {};
    const normalizedSlots: Record<number, { rate: string; start: string; end: string }> = {};
    Object.entries(slotsObj).forEach(([slotIdStr, info]) => {
      const slotId = Number(slotIdStr);
      if (!Number.isFinite(slotId) || !info) return;
      const rate = (info as any).rate ?? '';
      const start = (info as any).start ?? '';
      const end = (info as any).end ?? '';
      normalizedSlots[slotId] = { rate, start, end };
    });
    result[shiftId] = {
      slots: normalizedSlots,
      summary: (payload as any).summary ?? '',
    };
  });
  return result;
};
