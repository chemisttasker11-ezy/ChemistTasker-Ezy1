import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { ShareCode } from './shareCode';
import { parseChemistTaskerShareCode } from './shareCode';

export type SavedContact = ShareCode & { savedAt: string };
const key = (accountId: number | string) => 'ct.mobile.qr.saved.v1.' + encodeURIComponent(String(accountId));
const secureKey = (accountId: number | string) => 'ct.mobile.qr.invites.v1.' + String(accountId).replace(/[^A-Za-z0-9._-]/g,'_');

function parseRows(raw: string | null): SavedContact[] {
  if (!raw) return [];
  try {
    const values = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    return values.flatMap((row: any) => {
      const parsed = typeof row?.url === 'string' ? parseChemistTaskerShareCode(row.url) : null;
      return parsed ? [{ ...parsed, savedAt: typeof row.savedAt === 'string' ? row.savedAt : '' }] : [];
    }).slice(0, 100);
  } catch { return []; }
}

export async function listSavedContacts(accountId: number | string): Promise<SavedContact[]> {
  const [publicData, protectedData] = await Promise.all([
    AsyncStorage.getItem(key(accountId)), SecureStore.getItemAsync(secureKey(accountId)),
  ]);
  // Migration protection: older versions might have saved an invitation unencrypted.
  // Return it only once in memory, and rewrite the public list without invite tokens.
  const storedPublic = parseRows(publicData);
  const accidentallyPublic = storedPublic.filter(item => item.kind === 'pharmacy-invitation');
  const publicContacts = storedPublic.filter(item => item.kind !== 'pharmacy-invitation');
  if (accidentallyPublic.length) {
    await AsyncStorage.setItem(key(accountId), JSON.stringify(publicContacts));
  }
  const protectedContacts = parseRows(protectedData).filter(item => item.kind === 'pharmacy-invitation');
  return [...protectedContacts, ...publicContacts].slice(0, 100);
}

export async function saveContact(accountId: number | string, contact: ShareCode): Promise<SavedContact[]> {
  const saved = await listSavedContacts(accountId);
  const next = { ...contact, savedAt: new Date().toISOString() };
  if (contact.kind === 'pharmacy-invitation') {
    // Membership invitation codes are bearer links: keep these in OS-backed
    // encrypted SecureStore, not the plaintext AsyncStorage public list.
    const protectedContacts = [next, ...saved.filter(item => item.kind === 'pharmacy-invitation' && item.url !== contact.url)].slice(0, 5);
    await SecureStore.setItemAsync(secureKey(accountId), JSON.stringify(protectedContacts));
  } else {
    const publicContacts = [next, ...saved.filter(item => item.kind !== 'pharmacy-invitation' && item.url !== contact.url)].slice(0, 100);
    await AsyncStorage.setItem(key(accountId), JSON.stringify(publicContacts));
  }
  return listSavedContacts(accountId);
}

export async function removeContact(accountId: number | string, url: string): Promise<SavedContact[]> {
  const current = (await listSavedContacts(accountId)).filter(item => item.url !== url);
  await Promise.all([
    AsyncStorage.setItem(key(accountId), JSON.stringify(current.filter(item => item.kind !== 'pharmacy-invitation'))),
    SecureStore.setItemAsync(secureKey(accountId), JSON.stringify(current.filter(item => item.kind === 'pharmacy-invitation').slice(0, 5))),
  ]);
  return current;
}
