import { describe, expect, it } from 'vitest';
import { canNotifyShiftChainMembers, isPrivateShiftBooking, automaticShiftEscalationDates, showPublishedShiftRates } from './visibility';
import { mapShift } from './mappers';

describe('chain notification capability', () => {
  it('preserves the backend pay decision through the mapped boundary used by all hosts', () => {
    const shift = mapShift({id:1,role_needed:'PHARMACIST',visibility:'PLATFORM',published_rates_visible:false,slots:[{id:1,date:'2026-10-19',start_time:'09:00',end_time:'17:00'}]});
    expect(showPublishedShiftRates(shift)).toBe(false);
    expect(showPublishedShiftRates({publishedRatesVisible:true})).toBe(true);
    expect(showPublishedShiftRates({})).toBe(true); // Unsaved manager previews / older responses.
  });
  it('derives privacy from a valid dedicated worker independently of embedding', () => {
    expect(isPrivateShiftBooking('42')).toBe(true);
    for (const value of [null,undefined,'',0,'bad',-1]) expect(isPrivateShiftBooking(value)).toBe(false);
  });
  it('schedules only available wider audiences using the chosen interval', () => {
    const from=new Date(2026,9,12,9,0);
    const dates=automaticShiftEscalationDates(['FULL_PART_TIME','LOCUM_CASUAL','PLATFORM'],'FULL_PART_TIME',12,from);
    expect(dates).toEqual({LOCUM_CASUAL:'2026-10-12T21:00',PLATFORM:'2026-10-13T09:00'});
  });
  it('does not infer a chain from platform or organisation visibility', () => {
    expect(canNotifyShiftChainMembers(['FULL_PART_TIME', 'LOCUM_CASUAL', 'PLATFORM'], 'PLATFORM')).toBe(false);
    expect(canNotifyShiftChainMembers(['FULL_PART_TIME', 'LOCUM_CASUAL', 'ORG_CHAIN', 'PLATFORM'], 'ORG_CHAIN')).toBe(false);
    expect(canNotifyShiftChainMembers(['FULL_PART_TIME', 'LOCUM_CASUAL', 'ORG_CHAIN', 'PLATFORM'], 'PLATFORM')).toBe(false);
  });
  it('only permits outreach when the audience includes the available chain', () => {
    const tiers = ['FULL_PART_TIME', 'LOCUM_CASUAL', 'OWNER_CHAIN', 'ORG_CHAIN', 'PLATFORM'];
    expect(canNotifyShiftChainMembers(tiers, 'LOCUM_CASUAL')).toBe(false);
    for (const audience of ['OWNER_CHAIN', 'ORG_CHAIN', 'PLATFORM']) expect(canNotifyShiftChainMembers(tiers, audience)).toBe(true);
    expect(canNotifyShiftChainMembers(tiers, 'UNKNOWN')).toBe(false);
    expect(canNotifyShiftChainMembers([], 'PLATFORM')).toBe(false);
  });
  it('revokes an enabled chain selection when switching to a pharmacy without that tier', () => {
    const selected = true;
    expect(selected && canNotifyShiftChainMembers(['FULL_PART_TIME', 'LOCUM_CASUAL', 'PLATFORM'], 'PLATFORM')).toBe(false);
  });
});
