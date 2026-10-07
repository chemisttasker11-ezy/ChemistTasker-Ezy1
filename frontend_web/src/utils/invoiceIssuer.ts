// Invoices are issued from a worker's own ABN/bank profile (pharmacist or other staff).
// The backend has no issuer identity for owners or organisation staff: they receive invoices.
const ISSUER_ROLES = new Set(['PHARMACIST', 'OTHER_STAFF']);

export const canIssueInvoices = (role?: string | null): boolean =>
  ISSUER_ROLES.has((role ?? '').toUpperCase());
