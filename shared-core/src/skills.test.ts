import { describe, expect, it } from 'vitest';
import registry from '../skills_registry.json';
import { findSkill, skillId, skillLabel, matchSkillRequirements, roleSkillGroups, skillMatches, normalizeSkillIds, normalizeSavedSkillCodes, validRoleSkillCodes, searchRoleSkillGroups, splitSkillsAndSoftware, roleSoftware } from './skills';

describe('canonical skills across talent and shift modules', () => {
  it('has one immutable code and definition for each published skill', () => {
    expect(registry.skills).toHaveLength(67);
    expect(new Set(registry.skills.map(skill => skill.code)).size).toBe(registry.skills.length);
    for (const entry of registry.skills) {
      expect(entry.definition.length).toBeGreaterThan(24);
      expect(entry.label).toBeTruthy();
      expect(entry.icon_web).toBeTruthy();
      expect(entry.icon_mobile).toBeTruthy();
    }
  });

  it('resolves display names and previous codes to one identity', () => {
    expect(skillId(registry as any, 'Dose administration aid (DAA/Webster) packing')).toBe('WEBSTER_PACKING_DAA');
    expect(skillId(registry as any, 'DAA')).toBe('WEBSTER_PACKING_DAA');
    expect(skillId(registry as any, 'vacciNATOR')).toBe('VACCINATION');
    expect(skillId(registry as any, 'CRED_PHARM')).toBe('HMR_ACCREDITED_MRN');
    expect(skillLabel(registry as any, 'VACCINATION')).toBe('Vaccinations');
    expect(skillId(registry as any, 'Vaccination')).toBe('VACCINATION');
    expect(findSkill(registry as any, 'Webster packing')?.code).toBe('WEBSTER_PACKING_DAA');
    expect(skillId(registry as any, 'pack something unrelated')).toBeNull();
  });

  it('does not award matching for an unknown mandatory claim', () => {
    const match = matchSkillRequirements(
      registry as any,
      ['WEBSTER_PACKING_DAA', 'not a verified skill'],
      ['FRED'],
      ['DAA', 'FRED']
    );
    expect(match.matchesRequired).toBe(false);
    expect(match.unknownRequired).toEqual(['not a verified skill']);
    expect(match.matchedRequired).toEqual(['WEBSTER_PACKING_DAA']);
    expect(match.matchedPreferred).toEqual(['FRED']);
  });

  it('has the same skill code across Pharmacist, Intern and Technician', () => {
    const roles = ['PHARMACIST', 'INTERN', 'TECHNICIAN'] as const;
    for (const role of roles) {
      const codes = roleSkillGroups(registry as any, role).flatMap(group => group.items.map(skill => skill.code));
      expect(codes).toContain('WEBSTER_PACKING_DAA');
    }
    expect(roleSkillGroups(registry as any, 'TECHNICIAN').flatMap(group => group.items.map(skill => skill.code))).not.toContain('DAA_FINAL_CHECK');
    expect(roleSkillGroups(registry as any, null)).toEqual([]);
  });

  it('does not equate different dispensing and final-check tasks', () => {
    expect(skillMatches(registry as any, 'DAA_FINAL_CHECK', ['WEBSTER_PACKING_DAA'])).toBe(false);
    expect(skillMatches(registry as any, 'DAA', ['WEBSTER_PACKING_DAA'])).toBe(true);
    expect(normalizeSkillIds(registry as any, ['DAA','WEBSTER_PACKING_DAA','FRED'])).toEqual(['WEBSTER_PACKING_DAA','FRED']);
  });

  it('removes unused overlapping and vague choices', () => {
    const active = roleSkillGroups(registry as any, 'PHARMACIST').flatMap(group => group.items);
    expect(active).toHaveLength(67);
    for (const code of ['CASH_HANDLING', 'PHONE_ENQUIRIES', 'WORD', 'OTHER']) {
      expect(findSkill(registry as any, code)).toBeNull();
      expect(active.some(skill => skill.code === code)).toBe(false);
      expect(skillMatches(registry as any, code, [code])).toBe(false);
      expect(matchSkillRequirements(registry as any, [code], [], [code]).matchesRequired).toBe(false);
    }
    expect(normalizeSavedSkillCodes(registry as any, ['DAA', 'WEBSTER_PACKING_DAA', 'OTHER', 'unknown'])).toEqual(['WEBSTER_PACKING_DAA']);
  });

  it('normalises legacy labels consistently in role validation', () => {
    expect(validRoleSkillCodes(registry as any, 'TECHNICIAN', ['daa', 'Webster packing', 'DAA_FINAL_CHECK', 'OTHER'])).toEqual(['WEBSTER_PACKING_DAA']);
    expect(roleSkillGroups(registry as any, 'EXPLORER' as any)).toEqual([]);
    expect(roleSkillGroups(registry as any, 'UNKNOWN' as any)).toEqual([]);
  });

  it('searches aliases across groups without exposing prohibited skills', () => {
    expect(searchRoleSkillGroups(registry as any, 'TECHNICIAN', 'Webster').flatMap(group => group.items.map(skill => skill.code))).toContain('WEBSTER_PACKING_DAA');
    expect(searchRoleSkillGroups(registry as any, 'TECHNICIAN', 'final clinical check')).toEqual([]);
    expect(searchRoleSkillGroups(registry as any, 'PHARMACIST', 'unrelated xyz')).toEqual([]);
  });

  it('never assigns an alias or a label to two different identities', () => {
    const identities = new Map<string, string>();
    for (const skill of registry.skills) {
      for (const name of [skill.code, skill.label, ...skill.aliases]) {
        const key = name.trim().toLowerCase();
        expect(identities.get(key) || skill.code).toBe(skill.code);
        identities.set(key, skill.code);
      }
    }
    for (const [alias, code] of Object.entries(registry.legacy_aliases)) {
      expect(identities.get(alias.toLowerCase()) || code).toBe(code);
      expect(findSkill(registry as any, code)).not.toBeNull();
    }
  });

  it('never upgrades narrow historical claims into broader requirements', () => {
    const partial: Record<string, string> = {
      S8_RECORDS: 'S8_PROCEDURES', ANAPHYLAXIS_MANAGEMENT: 'FIRST_AID', VACCINE_ADMIN_SUPPORT: 'APPOINTMENT_BOOKINGS',
      NDSS_ADMIN: 'NDSS', CUSTOMER_SERVICE: 'POS_CUSTOMER', CLICK_COLLECT: 'POS_CUSTOMER', OTC_PRODUCTS: 'OTC_S2_ADVICE',
      S3_CONSULT_SUPPORT: 'OTC_S2_ADVICE', STOCK_RECEIVING: 'INVENTORY_CONTROL', STOCK_EXPIRY: 'INVENTORY_CONTROL',
      RETURNS: 'INVENTORY_CONTROL', DISPENSARY_WORKFLOW: 'PRESCRIPTION_DISPENSING', DIABETES_SCREENING: 'HEALTH_CHECKS',
      BLOOD_PRESSURE_CHECK: 'HEALTH_CHECKS',
    };
    for (const [old, broader] of Object.entries(partial)) {
      expect(skillId(registry as any, old)).toBeNull();
      expect(skillMatches(registry as any, broader, [old])).toBe(false);
    }
    expect(skillMatches(registry as any, 'FIRST_AID', ['Anaphylaxis response training'])).toBe(false);
    expect(skillMatches(registry as any, 'HEALTH_CHECKS', ['Blood-pressure measurement'])).toBe(false);
    for (const dropped of ['MEDICATION_ADHERENCE', 'WORKPLACE_SAFETY', 'EXCEL']) expect(findSkill(registry as any, dropped)).toBeNull();
    expect(skillId(registry as any, 'WinIFRED')).toBe('FRED');
  });

  it('rejects unsupported runtime roles in software selection', () => {
    for (const role of [null, 'EXPLORER', 'UNKNOWN']) expect(roleSoftware(registry as any, role as any)).toEqual([]);
    expect(roleSoftware(registry as any, 'ASSISTANT').length).toBeGreaterThan(0);
  });

  it('keeps named software in known sub-groups, apart from skills', () => {
    const subgroups = (registry as any).subgroups['Software & Digital'] as string[];
    const software = registry.skills.filter(skill => skill.group === 'Software & Digital');
    expect(software.length).toBeGreaterThanOrEqual(20);
    for (const item of software as any[]) {
      expect(subgroups).toContain(item.subgroup);
      expect(item.certificate).toBe('');
    }
    expect(registry.skills.filter((skill: any) => skill.group !== 'Software & Digital' && skill.subgroup)).toEqual([]);
    for (const item of registry.skills.filter((skill: any) => skill.logo) as any[]) {
      expect(Object.keys((registry as any).software_logos.sources)).toContain(item.logo);
    }
  });

  it('asks for certificates only where a credential or accreditation applies', () => {
    const withCertificate = registry.skills.filter(skill => skill.certificate).map(skill => skill.code).sort();
    expect(withCertificate).toEqual(['ACOP', 'ADVANCED_COMPOUNDING', 'FIRST_AID', 'HMR_ACCREDITED_MRN', 'MINOR_SKIN',
      'ORAL_CONTRACEPTIVE_RESUPPLY', 'TRAVEL_HEALTH_YELLOW_FEVER', 'UTI_PRESCRIBER', 'VACCINATION']);
    const certificates = new Set(registry.certificates.map(item => item.code));
    for (const skill of registry.skills.filter(item => item.certificate)) expect(certificates.has(skill.certificate)).toBe(true);
  });

  it('splits stored IDs into skills and software for every surface', () => {
    expect(splitSkillsAndSoftware(registry as any, ['FRED', 'VACCINATION', 'S8_RECORDS', 'MYPAK', 'WinIFRED'])).toEqual({
      skills: ['VACCINATION', 'S8_RECORDS'], software: ['FRED', 'MYPAK'],
    });
  });
});
