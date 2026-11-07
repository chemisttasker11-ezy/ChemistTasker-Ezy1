import { describe, expect, it } from 'vitest';
import registry from '../../../skills_registry.json';
import { filterTalentCandidates, resolveTalentBookingRole, type TalentFilters } from './presentation';
const empty: TalentFilters = {
  search:'', roles:[],states:[],workTypes:[],skills:[],willingToTravel:false,
  placementSeeker:false,availabilityStart:null,availabilityEnd:null,
};
const candidate = (id: number, role: string) => ({
  role,state:'QLD',pitch:'Available for shifts',city:'Brisbane',refId:'REF-'+id,
  workTypes:['CASUAL'],clinicalServices:['DAA'],dispenseSoftware:['FRED'],
  willingToTravel:true,isInternshipSeeker:role==='Intern',
  availableDates:['2026-11-10'],
});
describe('M4-06 public talent shared-core filters', () => {
  it('C: a later-page match is discoverable once all authorized pages have been collected', () => {
    const first=[candidate(1,'Pharmacist')], second=[candidate(2,'Intern')];
    const filtered=filterTalentCandidates(registry as any,[...first,...second],{
      ...empty,roles:['Intern'],skills:['WEBSTER_PACKING_DAA'],
      availabilityStart:'2026-11-09',availabilityEnd:'2026-11-11',
    });
    expect(filtered.filtered.map(row=>row.refId)).toEqual(['REF-2']);
    expect(filterTalentCandidates(registry as any,[...first,...second],empty).filtered).toHaveLength(2);
  });
  it('C: role mapping does not infer a generic OTHER_STAFF subtype from the account role', () => {
    for(const subtype of ['TECHNICIAN','ASSISTANT','INTERN','STUDENT'])
      expect(resolveTalentBookingRole('OTHER_STAFF',subtype)).toBe(subtype);
    expect(resolveTalentBookingRole('OTHER_STAFF')).toBe('');
  });
});
