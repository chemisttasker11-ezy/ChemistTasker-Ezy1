import { describe, expect, it } from 'vitest';
import registry from '../../../skills_registry.json';
import { mapShiftMemberStatus, mapShiftInterest } from './mappers';
import { normalizeShiftWorkProfile, groupWorkProfileSkills, workProfileSkillVerification } from './workProfile';

describe('candidate profile contracts', () => {
  it('separates claims from certificate and qualification verification signals', () => {
    expect(workProfileSkillVerification(registry as any,{skillRole:'PHARMACIST',verifiedSkills:[]},'VACCINATION')).toBe('Not verified');
    expect(workProfileSkillVerification(registry as any,{skillRole:'ASSISTANT',dispensaryQualificationVerified:false},'PRESCRIPTION_DISPENSING')).toBe('Not verified');
    expect(workProfileSkillVerification(registry as any,{skillRole:'ASSISTANT',dispensaryQualificationVerified:true},'PRESCRIPTION_DISPENSING')).toBe('Verified');
  });
  it('preserves work profiles through both member and interest projections', () => {
    const detail = {id:4,skills:['FRED','DAA'],role_label:'Technician',verified_skills:[],dispensary_qualification:'LEVEL_3',dispensary_qualification_verified:false};
    const member = mapShiftMemberStatus({user_id:4,name:'Worker',user_detail:detail} as any);
    const interest = mapShiftInterest({id:1,user:'Worker',user_detail:detail} as any);
    expect(member.userDetail).toEqual(interest.userDetail);
    expect(member.userDetail?.dispensaryQualificationVerified).toBe(false);
    expect(normalizeShiftWorkProfile(detail)?.roleLabel).toBe('Technician');
  });
  it('keeps anonymous profiles empty and canonicalizes skills once', () => {
    expect(normalizeShiftWorkProfile(null)).toBeNull();
    expect(normalizeShiftWorkProfile('Anonymous')).toBeNull();
    expect(groupWorkProfileSkills(registry as any, ['DAA','WEBSTER_PACKING_DAA','FRED'])['Dispensing & Medicines']).toEqual(['WEBSTER_PACKING_DAA']);
  });
});
