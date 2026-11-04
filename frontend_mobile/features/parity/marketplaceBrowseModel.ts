/** Search state is separate from seller workflow and does not relax marketplace policy. */
export type BrowseMode = '' | 'SELL' | 'SWAP' | 'FREE';
export type MarketplaceBrowseFilter = { search: string; category: string; mode: BrowseMode };

export const browseModes: ReadonlyArray<{value: BrowseMode; label: string}> = [
  { value: '', label: 'All' }, { value: 'SELL', label: 'Sell' }, { value: 'SWAP', label: 'Swap' }, { value: 'FREE', label: 'Free' },
];

export function normalizeBrowseMode(value: unknown): BrowseMode {
  return value === 'SELL' || value === 'SWAP' || value === 'FREE' ? value : '';
}

export function browseQuery(filter: MarketplaceBrowseFilter): Record<string, string> {
  const result: Record<string, string> = {};
  if (filter.search.trim()) result.search = filter.search.trim();
  if (filter.category.trim()) result.category = filter.category.trim();
  if (filter.mode) result.mode = filter.mode;
  return result;
}

export function enquiryValidation(message: string): string | null {
  const length = message.trim().length;
  if (length < 5) return 'Add a message of at least five characters for the seller.';
  if (length > 4000) return 'Keep your message within 4,000 characters.';
  return null;
}

export function categorySlug(value: {slug?: string | null; name?: string | null} | null | undefined): string {
  return String(value?.slug || '').trim();
}

/** Preserve list position while replacing overlapping records with newer server data. */
export function appendBrowsePage<T extends {id: string | number}>(existing: T[], incoming: T[]): T[] {
  const rows = new Map<string, T>();
  for (const row of existing) rows.set(String(row.id), row);
  for (const row of incoming) rows.set(String(row.id), row);
  return [...rows.values()];
}

/** Public marketplace uses the backend's PageNumberPagination (24 rows/page). */
export function nextBrowsePage(page: {next?: string | null} | null, requestedPage: number): number | null {
  return page?.next && Number.isSafeInteger(requestedPage) && requestedPage >= 1 ? requestedPage + 1 : null;
}
