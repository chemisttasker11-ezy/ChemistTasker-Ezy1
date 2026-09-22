import { describe, expect, it } from 'vitest';
import { API_ENDPOINTS } from './endpoints';
import { PLATFORM_ENDPOINTS } from './platformEndpoints';

describe('PLATFORM_ENDPOINTS', () => {
  it('matches Django public Hub and content routes', () => {
    expect(PLATFORM_ENDPOINTS.publicHub.article('hello')).toBe('/public-hub/articles/hello/');
    expect(PLATFORM_ENDPOINTS.publicHub.articleComments('hello')).toBe('/public-hub/articles/hello/comments/');
    expect(PLATFORM_ENDPOINTS.publicHub.communityPosts('owners')).toBe('/public-hub/community/owners/posts/');
    expect(PLATFORM_ENDPOINTS.publicHub.commentReport(12)).toBe('/public-hub/comments/12/report/');
    expect(PLATFORM_ENDPOINTS.content.documentAction(4, 'publish')).toBe('/content/documents/4/publish/');
    expect(PLATFORM_ENDPOINTS.content.invitationAction(5, 'revoke')).toBe('/content/invitations/5/revoke/');
    expect(PLATFORM_ENDPOINTS.content.moderationItem('comment', 6)).toBe('/content/moderation/comment/6/');
  });

  it('matches Django Marketplace routes', () => {
    expect(PLATFORM_ENDPOINTS.marketplace.listing('listing-id')).toBe('/marketplace/listings/listing-id/');
    expect(PLATFORM_ENDPOINTS.marketplace.eligibility('listing-id')).toBe('/marketplace/listings/listing-id/eligibility/');
    expect(PLATFORM_ENDPOINTS.marketplace.listingAction('listing-id', 'submit')).toBe('/marketplace/listings/listing-id/submit/');
    expect(PLATFORM_ENDPOINTS.marketplace.exchangeMessages('exchange-id')).toBe('/marketplace/exchanges/exchange-id/messages/');
    expect(PLATFORM_ENDPOINTS.marketplace.internalTransferAction(7, 'accept')).toBe('/marketplace/internal-transfers/7/accept/');
  });

  it('matches Django Ethical Marketplace routes', () => {
    expect(PLATFORM_ENDPOINTS.ethicalMarketplace.pharmacyApproval(2)).toBe('/ethical/pharmacies/2/approval/');
    expect(PLATFORM_ENDPOINTS.ethicalMarketplace.revokeGrant(2, 3)).toBe('/ethical/pharmacies/2/grants/3/revoke/');
    expect(PLATFORM_ENDPOINTS.ethicalMarketplace.importCommit(8)).toBe('/ethical/inventory/imports/8/commit/');
    expect(PLATFORM_ENDPOINTS.ethicalMarketplace.lotReconcile(9)).toBe('/ethical/inventory/lots/9/reconcile/');
    expect(PLATFORM_ENDPOINTS.ethicalMarketplace.transferDocument('transfer-id', 10)).toBe('/ethical/transfers/transfer-id/documents/10/');
  });

  it('keeps only kiosk device routes in the platform catalogue', () => {
    expect(PLATFORM_ENDPOINTS.kiosk.syncBatch).toBe('/client-profile/attendance/kiosk/sync/batch/');
    expect(PLATFORM_ENDPOINTS.kiosk.workerEnrol).toBe('/client-profile/attendance/kiosk/workers/enrol/');
    expect('attendance' in PLATFORM_ENDPOINTS).toBe(false);
    expect('rosterV2' in PLATFORM_ENDPOINTS).toBe(false);
    expect('workforce' in PLATFORM_ENDPOINTS).toBe(false);
  });
});

describe('legacy API_ENDPOINTS reconciliation', () => {
  it('owns authenticated Worker Finance routes in API_ENDPOINTS', () => {
    expect(API_ENDPOINTS.finance.root).toBe('/client-profile/finance/');
    expect(API_ENDPOINTS.finance.customer(3)).toBe('/client-profile/finance/customers/3/');
    expect(API_ENDPOINTS.finance.invoiceRevisionPdf(4, 2)).toBe('/client-profile/finance/invoices/4/revisions/2/pdf/');
    expect(API_ENDPOINTS.finance.receivedApprovePayment(5)).toBe('/client-profile/finance/received-invoices/5/approve-payment/');
    expect(API_ENDPOINTS.finance.expenseReceipts(6)).toBe('/client-profile/finance/expenses/6/receipts/');
    expect(API_ENDPOINTS.finance.basWorksheet).toBe('/client-profile/finance/bas-worksheet/');
  });

  it('owns authenticated attendance, roster and workforce routes', () => {
    expect(API_ENDPOINTS.attendance.managerTimeline(11)).toBe('/client-profile/attendance/manager/timeline/11/');
    expect(API_ENDPOINTS.rosterV2.acknowledgements(12)).toBe('/client-profile/attendance/roster/acknowledgements/12/');
    expect(API_ENDPOINTS.rosterV2.managerApproveReplacement).toBe('/client-profile/attendance/roster/manager/approve-replacement/');
    expect(API_ENDPOINTS.workforce.rosterWorkspace).toBe('/client-profile/workforce/roster/workspace/');
    expect(API_ENDPOINTS.workforce.leaveDecision(3)).toBe('/client-profile/workforce/leave/3/decision/');
    expect(API_ENDPOINTS.workforce.timesheetPeriodSummary(4)).toBe('/client-profile/workforce/timesheet-periods/4/summary/');
    expect(API_ENDPOINTS.workforce.timesheetSubmit(5)).toBe('/client-profile/workforce/timesheets/5/submit/');
    expect(API_ENDPOINTS.workforce.timesheetCheckDecision(6)).toBe('/client-profile/workforce/timesheet-checks/6/decision/');
  });

  it('uses canonical Django detail routes', () => {
    expect(API_ENDPOINTS.getCommunityShiftDetail(1)).toBe('/client-profile/community-shifts/1/');
    expect(API_ENDPOINTS.getPublicShiftDetail(2)).toBe('/client-profile/public-shifts/2/');
    expect(API_ENDPOINTS.getActiveShiftDetail(3)).toBe('/client-profile/shifts/active/3/');
    expect(API_ENDPOINTS.hubCommentDetail(4, 5)).toBe('/client-profile/hub/posts/4/comments/5/');
  });

  it('exposes the current token-based referee rejection route', () => {
    expect(API_ENDPOINTS.refereeRejectByToken('signed-token')).toBe('/client-profile/onboarding/referee-reject/signed-token/');
  });
});
