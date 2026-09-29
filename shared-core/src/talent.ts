export type TalentPage<T> = T[] | { count?: number; results?: T[] };

export type TalentPublishingUser = {
  role?: string | null;
  is_active?: boolean | null;
  isActive?: boolean | null;
  is_mobile_verified?: boolean | null;
  isMobileVerified?: boolean | null;
};

export type TalentPublishingProfile = {
  verified?: boolean | null;
  ahpra_verified?: boolean | null;
  ahpraVerified?: boolean | null;
  ahpra_expiry_date?: string | null;
  ahpraExpiryDate?: string | null;
};

function normalizeTalentRole(value: unknown): string {
  return String(value ?? '').trim().replace(/-/g, '_').toUpperCase();
}

function localDateIso(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Mirrors the backend publishing gate used by Talent Hub.
 * The backend remains authoritative; this helper keeps web and mobile UX aligned.
 */
export function canPublishTalent(
  user: TalentPublishingUser | null | undefined,
  profile: TalentPublishingProfile | null | undefined,
  today = localDateIso(),
): boolean {
  const role = normalizeTalentRole(user?.role);
  if (role === 'EXPLORER') return true;
  if (role !== 'PHARMACIST' && role !== 'OTHER_STAFF') return false;
  if (user?.is_active === false || user?.isActive === false) return false;

  const mobileVerified = user?.is_mobile_verified ?? user?.isMobileVerified ?? false;
  if (!mobileVerified || profile?.verified !== true) return false;

  if (role === 'PHARMACIST') {
    const ahpraVerified = profile?.ahpra_verified ?? profile?.ahpraVerified ?? false;
    if (!ahpraVerified) return false;
    const expiry = profile?.ahpra_expiry_date ?? profile?.ahpraExpiryDate ?? null;
    if (expiry && expiry < today) return false;
  }

  return true;
}

/**
 * Talent filters are currently client-side, so callers need the complete feed.
 * Fetch pages in small parallel batches while respecting the API's pagination cap.
 */
export async function loadAllTalentPages<T>(
  fetchPage: (page: number) => Promise<TalentPage<T>>,
  concurrency = 4,
): Promise<T[]> {
  const first = await fetchPage(1);
  if (Array.isArray(first)) return first;

  const rows = Array.isArray(first?.results) ? [...first.results] : [];
  if (!rows.length) return rows;

  const count = Number(first.count ?? rows.length);
  if (!Number.isFinite(count) || count <= rows.length) return rows;

  const pageCount = Math.ceil(count / rows.length);
  const batchSize = Math.max(1, Math.floor(concurrency));

  for (let start = 2; start <= pageCount; start += batchSize) {
    const pages = await Promise.all(
      Array.from(
        { length: Math.min(batchSize, pageCount - start + 1) },
        (_, index) => fetchPage(start + index),
      ),
    );
    for (const page of pages) {
      rows.push(...(Array.isArray(page) ? page : page.results ?? []));
    }
  }

  return rows;
}
