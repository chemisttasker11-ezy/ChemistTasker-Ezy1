import { describe, it, expect } from 'vitest';
import registry from '../../../skills_registry.json';
import { filterTalentCandidates, projectTalentSkills, resolveTalentBookingRole, type TalentFilters } from './presentation';

describe('shared talent policy', () => {
  it('resolves concrete booking roles without changing application eligibility', () => {
    for (const role of ['TECHNICIAN', 'INTERN', 'STUDENT', 'ASSISTANT']) expect(resolveTalentBookingRole('OTHER_STAFF', role)).toBe(role);
    expect(resolveTalentBookingRole('OTHER_STAFF', null, 'Intern Pharmacist')).toBe('INTERN');
    expect(resolveTalentBookingRole('OTHER_STAFF')).toBe('');
    expect(resolveTalentBookingRole('EXPLORER', 'STUDENT')).toBe('EXPLORER');
  });
  it('deduplicates aliases and separates software from professional skills', () => {
    const value = projectTalentSkills(registry as any, ['DAA', 'WEBSTER_PACKING_DAA', 'Fred', 'UNKNOWN']);
    expect(value.skills).toEqual(['WEBSTER_PACKING_DAA']);
    expect(value.dispenseSoftware).toEqual(['FRED']);
  });
  it('requires every claimed filter skill, supports aliases, and reverses date bounds', () => {
    const candidate = {role:'Technician',state:'QLD',pitch:'Dispensary',city:'Brisbane',refId:'CT1',workTypes:['CASUAL'],skills:['DAA'],dispenseSoftware:['FRED'],willingToTravel:true,isInternshipSeeker:false,availableDates:['2026-10-20']};
    const filters: TalentFilters = {search:'',roles:[],states:[],workTypes:[],skills:['WEBSTER_PACKING_DAA','Fred'],willingToTravel:false,placementSeeker:false,availabilityStart:'2026-10-25',availabilityEnd:'2026-10-15'};
    expect(filterTalentCandidates(registry as any, [candidate], filters).filtered).toEqual([candidate]);
    expect(filterTalentCandidates(registry as any, [candidate], {...filters,skills:['UNKNOWN']}).filtered).toEqual([]);
    expect(filterTalentCandidates(registry as any, [candidate], {...filters,placementSeeker:true}).filtered).toEqual([]);
  });
});
