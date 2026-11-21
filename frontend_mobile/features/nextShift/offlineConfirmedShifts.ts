import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Shift } from '@chemisttasker/shared-core';
import { sanitizeConfirmedShifts, type OfflineShift } from './nextShiftModel';

type Snapshot = { savedAt: string; rows: OfflineShift[] };
const key = (userId: number | string) => 'ct.offline.confirmed-shifts.v2.' + String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');

/** Read-only, minimally scoped display snapshot. Never proof of a live booking. */
export async function readConfirmedShiftSnapshot(userId: number | string): Promise<Snapshot | null> {
 try {
  const raw = await AsyncStorage.getItem(key(userId));
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.rows) || Number.isNaN(Date.parse(parsed.savedAt))) return null;
  const rows: OfflineShift[] = parsed.rows.filter((r: OfflineShift) =>
   Number.isSafeInteger(r?.shiftId) && Number.isSafeInteger(r?.slotId) &&
   typeof r.start==='string' && typeof r.end==='string' && typeof r.pharmacy==='string' &&
   typeof r.address==='string' && typeof r.role==='string' &&
   typeof r.wallStart==='string' && typeof r.wallEnd==='string' && typeof r.timeZone==='string'
  ).slice(0,100);
  return {savedAt:parsed.savedAt,rows};
 } catch {return null;}
}

export async function saveConfirmedShiftSnapshot(userId: number | string, shifts: Shift[]): Promise<Snapshot> {
 const snapshot: Snapshot = {savedAt:new Date().toISOString(),rows:sanitizeConfirmedShifts(shifts,userId)};
 await AsyncStorage.setItem(key(userId),JSON.stringify(snapshot));
 return snapshot;
}

export async function clearConfirmedShiftSnapshot(userId: number | string): Promise<void> {
 await AsyncStorage.removeItem(key(userId));
}
