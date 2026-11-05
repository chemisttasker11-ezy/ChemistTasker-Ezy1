import type { FinanceDraft, FinanceInvoiceDefaults } from '@chemisttasker/shared-core';

/**
 * Applies account settings only to untouched, empty draft fields.
 * A user choosing GST-off, clearing a field, or typing a super rate while
 * requests are in flight must always win. A prefilled prior invoice or
 * internal assignment is an explicit source rather than a blank draft.
 */
export function mergeFinanceInvoiceDefaults(
  current: FinanceDraft,
  defaults: FinanceInvoiceDefaults,
  touched: ReadonlySet<keyof FinanceDraft>,
  preserveSource: boolean,
): FinanceDraft {
  if (preserveSource || current.source_assignment_ids?.length) return current;
  const text = <K extends keyof FinanceInvoiceDefaults & keyof FinanceDraft>(key: K): string => {
    const existing = String(current[key] ?? '');
    if (touched.has(key) || existing.trim()) return existing;
    return String(defaults[key] ?? '');
  };
  return {
    ...current,
    issuer_name: text('issuer_name'),
    issuer_abn: text('issuer_abn'),
    issuer_address: text('issuer_address'),
    gst_registered: touched.has('gst_registered') ? current.gst_registered : defaults.gst_registered,
    bank_account_name: text('bank_account_name'),
    bsb: text('bsb'),
    account_number: text('account_number'),
    super_fund_name: text('super_fund_name'),
    super_usi: text('super_usi'),
    super_member_number: text('super_member_number'),
    super_rate: text('super_rate'),
  };
}
