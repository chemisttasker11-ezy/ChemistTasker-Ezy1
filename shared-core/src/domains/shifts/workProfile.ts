import type { ShiftWorkProfile } from '../../types';
import { camelCaseKeysDeep } from '../../utils/serialization';

/** Reveal responses and already-mapped member/interest projections share this domain seam. */
export function normalizeShiftWorkProfile(value: unknown): ShiftWorkProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return camelCaseKeysDeep(value) as ShiftWorkProfile;
}

