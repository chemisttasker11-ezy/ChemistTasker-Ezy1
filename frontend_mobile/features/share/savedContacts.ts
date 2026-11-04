import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ShareCode } from './shareCode';
import { parseChemistTaskerShareCode } from './shareCode';

export type SavedContact = ShareCode & { savedAt: string };
const key = (accountId: number | string) => 'ct.mobile.qr.saved.v1.' + encodeURIComponent(String(accountId));

export async function listSavedContacts(accountId: number | string): Promise<SavedContact[]> {
  const data = await AsyncStorage.getItem(key(accountId));
  if (!data) return [];
  try {
    const values = JSON.parse(data);
    if (!Array.isArray(values)) return [];
    return values.flatMap((row: any) => {
      const parsed = typeof row?.url === 'string' ? parseChemistTaskerShareCode(row.url) : null;
      return parsed ? [{ ...parsed, savedAt: typeof row.savedAt === 'string' ? row.savedAt : '' }] : [];
    }).slice(0, 100);
  } catch { return []; }
}

export async function saveContact(accountId: number | string, contact: ShareCode): Promise<SavedContact[]> {
  const saved = await listSavedContacts(accountId);
  const next = [{ ...contact, savedAt: new Date().toISOString() }, ...saved.filter(c => c.url !== contact.url)].slice(0, 100);
  await AsyncStorage.setItem(key(accountId), JSON.stringify(next));
  return next;
}

export async function removeContact(accountId: number | string, url: string): Promise<SavedContact[]> {
  const next = (await listSavedContacts(accountId)).filter(contact => contact.url !== url);
  await AsyncStorage.setItem(key(accountId), JSON.stringify(next));
  return next;
}
