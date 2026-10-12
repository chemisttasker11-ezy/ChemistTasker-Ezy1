import { describe, expect, it } from 'vitest';
import { expandShiftDraftSlots, buildShiftDraftSlotPayload, reconcileShiftDraftRateRows } from './draftSlots';

const recurring = {date:'2026-10-19',startTime:'09:00',endTime:'17:00',isRecurring:true,recurringDays:[1,6],recurringEndDate:'2026-10-24'};
describe('shared shift draft slots', () => {
  it('persists different weekday/weekend rates on their actual dates', () => {
    const rows=expandShiftDraftSlots([recurring]);
    const payload=buildShiftDraftSlotPayload([recurring],rows,[{rate:'65'},{rate:'80'}]);
    expect(payload.map(slot=>[slot.date,slot.rate,slot.is_recurring])).toEqual([['2026-10-19','65.00',false],['2026-10-24','80.00',false]]);
  });
  it('keeps uniform recurrence metadata and handles a start date outside the selected weekdays', () => {
    const slot={...recurring,date:'2026-10-18'};
    const rows=expandShiftDraftSlots([slot]);
    expect(rows.map(row=>row.date)).toEqual(['2026-10-19','2026-10-24']);
    expect(buildShiftDraftSlotPayload([slot],rows,[{rate:'65'},{rate:65}])).toEqual([{date:'2026-10-18',start_time:'09:00',end_time:'17:00',rate:'65.00',is_recurring:true,recurring_days:[1,6],recurring_end_date:'2026-10-24'}]);
  });
  it('keeps manual rates attached to their date when an earlier occurrence is removed', () => {
    const previous=expandShiftDraftSlots([recurring]);
    const manual={rate:'80',dirty:true};
    expect(reconcileShiftDraftRateRows(previous,[previous[1]],[{rate:'65',dirty:false},manual],()=>({rate:'',dirty:false}))).toEqual([manual]);
  });
});
