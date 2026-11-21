/** Facts from the same authenticated Explorer dashboard read model as the web. */
export type ExplorerDashboardShift = {
  id: number;
  pharmacy_name?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
  reason?: string | null;
  suburb?: string | null;
};

export type ExplorerDashboardFacts = {
  recommended: ExplorerDashboardShift[];
  commitments: ExplorerDashboardShift[];
  recommendedCount: number;
  committedCount: number;
  activeCount: number;
  publicCount: number;
  upcomingWeek: number;
};

export function explorerDashboardFacts(value: unknown): ExplorerDashboardFacts | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, any>;
  const valid = (rows: unknown): ExplorerDashboardShift[] => Array.isArray(rows)
    ? rows.filter((row: any) => row && Number.isSafeInteger(row.id) && row.id > 0)
        .map((row: any) => ({
          id: row.id, pharmacy_name: row.pharmacy_name ?? '',
          date: row.date ?? null, start_time: row.start_time ?? null, end_time: row.end_time ?? null,
          status: row.status ?? null, reason: row.reason ?? null, suburb: row.suburb ?? null,
        }))
    : [];
  const number = (val: unknown): number => Number.isFinite(Number(val)) && Number(val) >= 0 ? Number(val) : 0;
  return {
    recommended: valid(raw.recommended_shifts),
    commitments: valid(raw.shifts),
    recommendedCount: number(raw.shift_summary?.open_count),
    committedCount: number(raw.shift_summary?.confirmed_count ?? raw.confirmed_shifts_count),
    activeCount: number(raw.shift_summary?.all_count ?? raw.upcoming_shifts_count),
    publicCount: number(raw.community_shifts_count ?? raw.shift_summary?.community_count),
    upcomingWeek: number(raw.upcoming_stats?.week ?? raw.upcoming_shifts_count),
  };
}

/** Preserve the actual day/rate supplied by backend rather than inventing a shift slot. */
export function explorerShiftDisplay(row: ExplorerDashboardShift): { label: string; detail: string } {
  const label = row.pharmacy_name?.trim() || 'Pharmacy opportunity';
  const when = row.date ?? '';
  const from = row.start_time?.slice(0, 5) || '';
  const to = row.end_time?.slice(0, 5) || '';
  const times = from && to ? `${from}–${to}` : from;
  return {
    label,
    detail: [when, times, row.status || row.reason || row.suburb].filter(Boolean).join(' · '),
  };
}
