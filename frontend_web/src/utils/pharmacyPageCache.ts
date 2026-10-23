// The pharmacy page no longer caches; this only removes snapshots written by older releases.
export function clearPharmacyPageCache() {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('pharmacyPage.cache.')) sessionStorage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable; the page still isolates its in-memory state.
  }
}
