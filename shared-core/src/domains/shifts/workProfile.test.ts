import { describe, expect, it } from 'vitest';
import registry from '../../../skills_registry.json';
import { mapShiftMemberStatus, mapShiftInterest } from './mappers';
import { normalizeShiftWorkProfile, groupWorkProfileSkills } from './workProfile';
import { normalizeVerification, skillEvidenceState, verificationRows, evidenceExplainer } from '../onboarding/verification';

describe('candidate profile contracts', () => {
  it('describes evidence from the backend summary; claims without certificates have no badge', () => {
    const profile = normalizeShiftWorkProfile({ id: 1, verification: { verified: true, overseas: false,
      badges: [{ code: 'QUALIFICATION', state: 'not_supplied' }, { code: 'ID', state: 'verified' }],
      skill_evidence: { VACCINATION: 'pending', FIRST_AID: 'not_supplied' } } });
    const summary = normalizeVerification(profile?.verification);
    expect(skillEvidenceState(summary, 'VACCINATION')).toBe('pending');
    expect(skillEvidenceState(summary, 'FRED')).toBeNull();
    const [qualification, id] = verificationRows(summary, 'employer');
    expect([qualification.stateLabel, id.stateLabel]).toEqual(['Not verified', 'Verified']);
    expect(qualification.explainer).toContain('no qualification certificate was supplied');
    expect(evidenceExplainer('not_supplied', 'worker')).toContain('You can still apply');
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
