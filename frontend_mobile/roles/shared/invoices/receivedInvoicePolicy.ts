import type { FinanceInvoice } from '@chemisttasker/shared-core';

/** Mirror the web's receivedKey / InvoiceReviewDrawer action restrictions.
 * Server version and permission checks remain authoritative for every write.
 */
export function receivedInvoiceActions(invoice: Pick<FinanceInvoice, 'is_current' | 'status' | 'review_status'>) {
  const historical = invoice.is_current === false;
  const paid = invoice.status === 'paid';
  const approved = invoice.review_status === 'APPROVED_FOR_PAYMENT';
  return {
    approve: !historical && !paid && !approved,
    revise: !historical,
    paid: !historical && !paid,
  };
}
