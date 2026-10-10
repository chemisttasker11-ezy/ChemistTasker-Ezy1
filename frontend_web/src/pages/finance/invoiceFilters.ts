import { financeStatus, type FinanceInvoice } from '@chemisttasker/shared-core';

// Worker list filters. "Sent" covers everything sent and still owed that is not overdue or sent back.
export type StatusKey = 'all' | 'saved' | 'sent' | 'revision' | 'overdue' | 'paid';
export const statusTabs: [StatusKey, string][] = [['all', 'All'], ['saved', 'Drafts'], ['sent', 'Sent'], ['revision', 'Changes requested'], ['overdue', 'Overdue'], ['paid', 'Paid']];
export function statusKey(invoice: FinanceInvoice): StatusKey | null {
  const status = financeStatus(invoice);
  if (status === 'Saved') return 'saved';
  if (status === 'Overdue') return 'overdue';
  if (status === 'Paid') return 'paid';
  if (status === 'Revision requested') return 'revision';
  if (['Sent', 'Part paid', 'Approved for payment'].includes(status)) return 'sent';
  return null;
}

// Pharmacy side: what still needs the reader's attention comes first.
export type ReceivedKey = 'all' | 'review' | 'waiting' | 'approved' | 'paid';
export const receivedTabs: [ReceivedKey, string, string][] = [
  ['all', 'All', ''],
  ['review', 'To review', 'Check these and approve them or ask for changes'],
  ['waiting', 'With contractor', 'Waiting for the contractor to send a corrected or newer version'],
  ['approved', 'Approved', 'Approved for payment, not marked paid yet'],
  ['paid', 'Paid', 'Payment recorded'],
];
export function receivedKey(invoice: FinanceInvoice): Exclude<ReceivedKey, 'all'> {
  if (invoice.status === 'paid') return 'paid';
  // A newer version is saved but unsent: nothing to act on until the contractor sends it.
  if (invoice.review_status === 'REVISION_REQUESTED' || invoice.is_current === false) return 'waiting';
  if (invoice.review_status === 'APPROVED_FOR_PAYMENT') return 'approved';
  return 'review';
}
export const receivedOrder: Record<Exclude<ReceivedKey, 'all'>, number> = { review: 0, approved: 1, waiting: 2, paid: 3 };
