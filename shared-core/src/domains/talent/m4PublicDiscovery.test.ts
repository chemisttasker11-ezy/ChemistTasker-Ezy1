import { describe, expect, it } from 'vitest';
import registry from '../../../skills_registry.json';
import { filterTalentCandidates, resolveTalentBookingRole, projectPublicTalentCandidate, type TalentFilters } from './presentation';
import { loadAllTalentPages } from '../../talent';
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

describe('M4-06 common public talent projector across Expo, Vite and Next', () => {
  it('R #7 matches web role/work labels and hides past availability before filter/render', () => {
    const item = projectPublicTalentCandidate({
      id: 72, reference_code: 'VISIBLE72', role_title: 'PHARMACY_TECHNICIAN',
      work_types: ['CASUAL', 'PART_TIME'],
      location_state: 'QLD', location_suburb: 'Toowoomba',
      availability_days: ['2020-01-01', {date: '2999-02-01'}],
      skills: ['WEBSTER_PACKING_DAA'], software: [],
      open_to_travel: true, rating_average: 4.75, rating_count: 8,
      contact_email: 'must-not-project@example.test',
    }, registry as any);
    expect(item.role).toBe('Pharmacy Technician');
    expect(item.workTypes).toEqual(['Casual', 'Part Time']);
    expect(item.availableDates).toEqual(['2999-02-01']);
    expect(item.refId).toBe('REF-VISIBLE72');
    expect(item.ratingAverage).toBe(4.75);
    expect(item.ratingCount).toBe(8);
    expect(JSON.stringify(item)).not.toContain('must-not-project');
  });
  it('C #7 recognizes snake/camel aliases and retains anonymous/ref/ratings for web cards', () => {
    const source = {
      id: 90, roleTitle: 'Intern', workTypes: ['PLACEMENT'],
      locationState: 'NSW', locationSuburb: 'Dubbo', referenceCode: 'REF-90',
      availabilityDays: ['2999-02-01'], ratingAverage: 5, ratingCount: 3,
      is_anonymous: true, author_user_id: null, explorer_user_id: null,
    };
    const candidate = projectPublicTalentCandidate(source, registry as any);
    expect(candidate.id).toBe(90);
    expect(candidate.role).toBe('Intern');
    expect(candidate.state).toBe('NSW');
    expect(candidate.city).toBe('Dubbo');
    expect(candidate.refId).toBe('REF-90');
    expect(candidate.ratingAverage).toBe(5);
    expect(candidate.ratingCount).toBe(3);
    expect(JSON.stringify(candidate)).not.toMatch(/email|phone_number|date_of_birth/);
  });
  it('C #3 loadAllTalentPages reads every authorized page but never follows a foreign next URL', async () => {
    const calls: number[] = [];
    const pages = await loadAllTalentPages(async (page: number) => {
      calls.push(page);
      return page === 1 ? {count: 2,
        next: 'https://untrusted.example/steal?page=2',
        results: [{id: 1}]} : {count: 2, results: [{id: 2}]};
    }, 1);
    expect(calls).toEqual([1,2]);
    expect(pages.map(row => row.id)).toEqual([1,2]);
  });
  it('C #3 first-page progress is delivered before a failing later page', async () => {
    const progress: number[][] = [];
    await expect(loadAllTalentPages(async (page: number) => {
      if(page === 2) throw new Error('page two offline');
      return {count: 2, results: [{id: 1}]};
    },1, rows=>progress.push(rows.map(row=>row.id)))).rejects.toThrow('page two offline');
    expect(progress).toEqual([[1]]);
  });
});
