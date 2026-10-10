// One-time hand-off from older invoice links (/invoice/:id, /invoice/new?shiftId=) into Invoices.
// Stored in sessionStorage because the dashboard shell can rewrite the query string while it settles
// the workspace scope on first load; query parameters (?invoice=, ?shift=, ?new=1) still work too.
export type FinanceHandoff = { invoice?: string; shift?: string; new?: boolean };
const KEY = 'ct:finance-open';

export function setFinanceHandoff(value: FinanceHandoff) {
  try { sessionStorage.setItem(KEY, JSON.stringify(value)); } catch { /* storage unavailable: query parameters still apply */ }
}

export function takeFinanceHandoff(): FinanceHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as FinanceHandoff;
  } catch {
    return null;
  }
}
