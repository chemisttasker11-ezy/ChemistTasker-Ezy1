import { beforeEach, describe, expect, it } from 'vitest';
import registry from '../../../skills_registry.json';
import { configureStorage } from '../../storage';
import { canAutoApplySkillPreset, loadShiftSkillPreset, saveShiftSkillPreset, validateSkillPreset } from './skillPresets';

const reg = registry as any;
let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  configureStorage({ getItem: key => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); }, removeItem: key => { store.delete(key); } });
});

describe('personal shift skill presets', () => {
  it('saves canonical Required and Preferred choices, including software', async () => {
    await saveShiftSkillPreset(reg, 1, 'PHARMACIST', { required: ['DAA', 'WEBSTER_PACKING_DAA'], preferred: ['WinIFRED'] });
    expect(await loadShiftSkillPreset(reg, 1, 'PHARMACIST')).toEqual({ required: ['WEBSTER_PACKING_DAA'], preferred: ['FRED'] });
  });

  it('isolates accounts and roles', async () => {
    await saveShiftSkillPreset(reg, 1, 'PHARMACIST', { required: ['VACCINATION'], preferred: [] });
    expect(await loadShiftSkillPreset(reg, 2, 'PHARMACIST')).toBeNull();
    expect(await loadShiftSkillPreset(reg, 1, 'TECHNICIAN')).toBeNull();
  });

  it('rejects unknown, role-ineligible and conflicting selections', () => {
    expect(() => validateSkillPreset(reg, 'EXPLORER', { required: [], preferred: [] })).toThrow();
    expect(() => validateSkillPreset(reg, 'PHARMACIST', { required: ['UNKNOWN'], preferred: [] })).toThrow();
    expect(() => validateSkillPreset(reg, 'TECHNICIAN', { required: ['DAA_FINAL_CHECK'], preferred: [] })).toThrow();
    expect(() => validateSkillPreset(reg, 'PHARMACIST', { required: ['FRED'], preferred: ['WinIFRED'] })).toThrow();
  });

  it('does not weaken stale or malformed saved requirements', async () => {
    await saveShiftSkillPreset(reg, 1, 'PHARMACIST', { required: ['FRED'], preferred: [] });
    const key = [...store.keys()][0];
    store.set(key, JSON.stringify({ version: 1, required: ['REMOVED_SKILL'], preferred: ['FRED'] }));
    expect(await loadShiftSkillPreset(reg, 1, 'PHARMACIST')).toBeNull();
    store.set(key, 'broken JSON');
    expect(await loadShiftSkillPreset(reg, 1, 'PHARMACIST')).toBeNull();
  });

  it('allows replacing a preset with an intentionally empty selection', async () => {
    await saveShiftSkillPreset(reg, 1, 'PHARMACIST', { required: ['FRED'], preferred: [] });
    await saveShiftSkillPreset(reg, 1, 'PHARMACIST', { required: [], preferred: [] });
    expect(await loadShiftSkillPreset(reg, 1, 'PHARMACIST')).toEqual({ required: [], preferred: [] });
  });

  it('does not automatically replace an existing shift or manual choices', () => {
    expect(canAutoApplySkillPreset(true, { required: [], preferred: [] }, [])).toBe(false);
    expect(canAutoApplySkillPreset(false, { required: ['FRED'], preferred: [] }, [])).toBe(false);
    expect(canAutoApplySkillPreset(false, { required: [], preferred: ['VACCINATION'] }, ['FRED'])).toBe(false);
    expect(canAutoApplySkillPreset(false, { required: [], preferred: ['FRED'] }, ['FRED'])).toBe(true);
  });

  it('propagates a storage failure without claiming the save succeeded', async () => {
    configureStorage({ getItem: () => null, setItem: () => { throw new Error('Storage blocked'); }, removeItem: () => {} });
    await expect(saveShiftSkillPreset(reg, 1, 'PHARMACIST', { required: [], preferred: [] })).rejects.toThrow('Storage blocked');
  });
});
