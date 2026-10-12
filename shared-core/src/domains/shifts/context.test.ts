import { describe, expect, it } from 'vitest';
import registry from '../../../skills_registry.json';
import { normalizeWorkloadTags, normalizeShiftRequirements, shiftRequirementGroups, supportSummary, workloadTags, pharmacySoftwareDefaults, mergeSoftwareDefaults, setSupportCount, popularShiftChoices, setRequirementLevel, autoEscalationDates } from './context';
import { scriptVolumeBand } from '../organizations/pharmacyProfile';
import { mapShift } from './mappers';

const reg = registry as any;

describe('pharmacy and shift context', () => {
  it('uses one requirement grouping rule and required software takes precedence', () => {
    expect(shiftRequirementGroups(reg, ['VACCINATION', 'FRED'], ['FRED', 'MYPAK'])).toEqual({
      requiredSkills: ['VACCINATION'], preferredSkills: [], software: [{ code: 'FRED', required: true }, { code: 'MYPAK', required: false }],
    });
  });

  it('does not silently discard unknown requirements when opening an edit form', () => {
    expect(normalizeShiftRequirements(reg, ['S8_RECORDS', 'DAA', 'S8_RECORDS'])).toEqual(['S8_RECORDS', 'WEBSTER_PACKING_DAA']);
  });
  it('shares software defaults across clients and excludes non-software and required choices', () => {
    expect(pharmacySoftwareDefaults(reg, 'PHARMACIST', ['FRED', 'VACCINATION'])).toEqual(['FRED']);
    expect(mergeSoftwareDefaults(['FRED', 'VACCINATION'], ['MYPAK'], ['FRED'], ['MYPAK'])).toEqual(['VACCINATION']);
  });
  it('shares count input behavior across web and native, including clearing a field', () => {
    const entries = [{ role: 'TECHNICIAN', count: 2 }];
    expect(setSupportCount(reg, entries, 'TECHNICIAN', '')).toEqual([]);
    expect(setSupportCount(reg, entries, 'ASSISTANT', '3')).toEqual([...entries, { role: 'ASSISTANT', count: 3 }]);
    for (const invalid of ['1.9', '0', '21', 'bad']) expect(setSupportCount(reg, entries, 'TECHNICIAN', invalid)).toBe(entries);
  });

  it('preserves legacy workload information and round-trips canonical selections', () => {
    const codes = normalizeWorkloadTags(reg, ['Sole Pharmacist', 'High Script Load', 'Webster Packs']);
    expect(codes).toEqual(['SOLE_PHARMACIST', 'HIGH_SCRIPT_LOAD', 'HIGH_DAA']);
    expect(normalizeWorkloadTags(reg, codes)).toEqual(codes);
    expect(workloadTags(reg, codes).map(tag => tag.label)).not.toContain('HIGH_DAA');
  });

  it('maps pharmacy context and staffing from API responses to card properties', () => {
    const shift = mapShift({ id: 1, pharmacy_detail: { id: 2, name: 'Test', services: ['VACCINATION'],
      script_volume_weekday: 'BUSY', script_volume_weekend: 'QUIET' },
      support_on_shift: [{ role: 'TECHNICIAN', count: 2 }], workload_tags: ['HIGH_DAA'] } as any);
    expect(shift.pharmacyDetail?.scriptVolumeWeekday).toBe('BUSY');
    expect(shift.pharmacyDetail?.services).toEqual(['VACCINATION']);
    expect(shift.supportOnShift).toEqual([{ role: 'TECHNICIAN', count: 2 }]);
    expect(scriptVolumeBand(reg, shift.pharmacyDetail?.scriptVolumeWeekend)?.code).toBe('QUIET');
    expect(supportSummary(reg, shift.supportOnShift)).toBe('2 dispensary technicians');
  });

  it('keeps posting short lists role-eligible, pharmacy software first', () => {
    const { skills, software } = popularShiftChoices(registry as any, 'ASSISTANT', ['MINOS_TYPO', 'MYPAK', 'FRED']);
    expect(skills).toContain('POS_CUSTOMER');
    expect(skills.length).toBeLessThanOrEqual(8);
    expect(software.slice(0, 2)).toEqual(['MYPAK', 'FRED']);
    expect(popularShiftChoices(registry as any, null).skills).toEqual([]);
    expect(popularShiftChoices(registry as any, 'ASSISTANT').skills).not.toContain('DAA_FINAL_CHECK');
  });

  it('moves a skill between required and preferred without duplicates', () => {
    expect(setRequirementLevel(['A'], ['B'], 'B', 'required')).toEqual({ required: ['A', 'B'], preferred: [] });
    expect(setRequirementLevel(['A'], [], 'A', null)).toEqual({ required: [], preferred: [] });
  });
});

describe('autoEscalationDates', () => {
  it('spaces each wider audience by the chosen interval', () => {
    const from = new Date(2026, 9, 12, 9, 30);
    expect(autoEscalationDates(['OWNER_CHAIN', 'PLATFORM'], 24, from)).toEqual({
      OWNER_CHAIN: '2026-10-13T09:30',
      PLATFORM: '2026-10-14T09:30',
    });
    expect(autoEscalationDates([], 12, from)).toEqual({});
  });
});
