// Invoices are issued from a worker's own ABN/bank profile (pharmacist or other staff).
// The backend has no issuer identity for owners or organisation staff: they receive invoices.
const ISSUER_ROLES = new Set(['PHARMACIST', 'OTHER_STAFF']);

// Worker personas. One account can hold several personas (e.g. a pharmacist who is also an
// Organisation Admin keeps role=PHARMACIST), so the active dashboard decides, not the role alone.
const ISSUER_DASHBOARDS = ['/dashboard/pharmacist/', '/dashboard/otherstaff/'];

export const canIssueInvoices = (role?: string | null): boolean =>
  ISSUER_ROLES.has((role ?? '').toUpperCase());

/** Issuing workspace only in a worker dashboard of an issuer account; every other persona receives. */
export const isIssuerWorkspace = (pathname: string, role?: string | null): boolean =>
  canIssueInvoices(role) && ISSUER_DASHBOARDS.some((prefix) => pathname.startsWith(prefix));
