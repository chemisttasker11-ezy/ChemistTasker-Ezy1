import { describe, expect, it } from 'vitest';
import registry from '../skills_registry.json';
import { findSkill, skillId, skillLabel, matchSkillRequirements, roleSkillGroups, skillMatches, normalizeSkillIds } from './skills';

describe('canonical skills across talent and shift modules', () => {
  it('has one immutable code and definition for each published skill', () => {
    expect(registry.skills).toHaveLength(70);
    expect(new Set(registry.skills.map(skill => skill.code)).size).toBe(registry.skills.length);
    for (const entry of registry.skills) {
      expect(entry.definition.length).toBeGreaterThan(24);
      expect(entry.label).toBeTruthy();
      expect(entry.icon_web).toBeTruthy();
      expect(entry.icon_mobile).toBeTruthy();
    }
  });

  it('resolves display names and previous codes to one identity', () => {
    expect(skillId(registry, 'Dose administration aid (DAA/Webster) packing')).toBe('WEBSTER_PACKING_DAA');
    expect(skillId(registry, 'DAA')).toBe('WEBSTER_PACKING_DAA');
    expect(skillId(registry, 'vacciNATOR')).toBe('VACCINATION');
    expect(skillId(registry, 'CRED_PHARM')).toBe('HMR_ACCREDITED_MRN');
    expect(skillLabel(registry, 'VACCINATION')).toBe('Vaccination');
    expect(findSkill(registry, 'Webster packing')?.code).toBe('WEBSTER_PACKING_DAA');
    expect(skillId(registry, 'pack something unrelated')).toBeNull();
  });

  it('does not award matching for an unknown mandatory claim', () => {
    const match = matchSkillRequirements(
      registry,
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
      const codes = roleSkillGroups(registry, role).flatMap(group => group.items.map(skill => skill.code));
      expect(codes).toContain('WEBSTER_PACKING_DAA');
    }
    expect(roleSkillGroups(registry, 'TECHNICIAN').flatMap(group => group.items.map(skill => skill.code))).not.toContain('DAA_FINAL_CHECK');
    expect(roleSkillGroups(registry, null)).toEqual([]);
  });

  it('does not equate different dispensing and final-check tasks', () => {
    expect(skillMatches(registry, 'DAA_FINAL_CHECK', ['WEBSTER_PACKING_DAA'])).toBe(false);
    expect(skillMatches(registry, 'DAA', ['WEBSTER_PACKING_DAA'])).toBe(true);
    expect(normalizeSkillIds(registry, ['DAA','WEBSTER_PACKING_DAA','FRED'])).toEqual(['WEBSTER_PACKING_DAA','FRED']);
  });
});
