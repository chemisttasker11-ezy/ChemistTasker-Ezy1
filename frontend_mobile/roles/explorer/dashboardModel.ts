/** Native Explorer dashboard presentation from the same server facts as the web dashboard. */
export type ExplorerActivity = {
  title?: string | null;
  description?: string | null;
  time?: string | null;
  target_type?: string | null;
  target_id?: number | null;
};
export type ExplorerDashboardShift = {
  id: number;
  pharmacy_name?: string | null;
  suburb?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
  reason?: string | null;
};
export type ExplorerDashboardSummary = {
  shift_summary?: {
    upcoming_count?: number | null;
    confirmed_count?: number | null;
    community_count?: number | null;
    open_count?: number | null;
    all_count?: number | null;
  } | null;
  recommended_shifts?: ExplorerDashboardShift[] | null;
  shifts?: ExplorerDashboardShift[] | null;
  activity?: ExplorerActivity[] | null;
};

export function safeCount(value: unknown): number | null {
  const count = Number(value);
  return value == null || !Number.isSafeInteger(count) || count < 0 ? null : count;
}

export function explorerStats(data: ExplorerDashboardSummary | null) {
  const summary = data?.shift_summary;
  return {
    recommended: safeCount(summary?.open_count),
    confirmed: safeCount(summary?.confirmed_count),
    active: safeCount(summary?.all_count),
    public: safeCount(summary?.community_count),
  };
}

export function explorerShiftRoute(shiftId: unknown): string | null {
  const id = Number(shiftId);
  return Number.isSafeInteger(id) && id > 0 ? `/explorer/shifts/${id}` : null;
}

export function explorerActivityRoute(activity: ExplorerActivity): string | null {
  if (activity.target_type !== 'shift') return null;
  return explorerShiftRoute(activity.target_id);
}

/** Never turn arbitrary backend action_url into an unaudited external navigation. */
export function explorerActivityLabel(activity: ExplorerActivity): string {
  return [activity.description, activity.time].filter(Boolean).join(' · ');
}

export function normalizeExplorerDashboard(value: unknown): ExplorerDashboardSummary | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  return {
    shift_summary: raw.shift_summary && typeof raw.shift_summary === 'object'
      ? raw.shift_summary as ExplorerDashboardSummary['shift_summary'] : null,
    recommended_shifts: Array.isArray(raw.recommended_shifts) ? raw.recommended_shifts : null,
    shifts: Array.isArray(raw.shifts) ? raw.shifts : null,
    activity: Array.isArray(raw.activity) ? raw.activity : null,
  };
}
