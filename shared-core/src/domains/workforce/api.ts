import type { WorkforceRosterWorkspace, WorkforcePayrollConfiguration, WorkforceWorkSettings, WorkforceEmploymentEngagement, WorkforceAwardPreview, WorkforceCoverageRequirement, WorkforceLeave, WorkforceTimesheetPeriod, WorkforceTimesheetSummary, WorkforceTimesheetRow, WorkforceTimesheetDetail, WorkforceMyHoursRow } from '../../contracts/workforce';
import type { RosterValidationResult } from '../rosterPublication';
/** Domain-owned operations extracted from the established shared API. */
import { API_ENDPOINTS } from '../../constants/endpoints';
import { operationalRequest } from '../../transport/operational';
import type { RosterPublicationResult, RosterPublishCommand } from '../rosterPublication';
export const workforce = {
    getRosterWorkspace: (pharmacyId: number | string, weekStart: string) => operationalRequest<WorkforceRosterWorkspace>(API_ENDPOINTS.workforce.rosterWorkspace, { query: { pharmacy_id: pharmacyId, week_start: weekStart } }),
    validateRoster: (periodId: number | string, expectedRevision: number) => operationalRequest<RosterValidationResult>(API_ENDPOINTS.workforce.rosterValidate, { method: 'POST', body: { period_id: periodId, expected_revision: expectedRevision } }),
    publishRoster: (body: RosterPublishCommand): Promise<RosterPublicationResult> => operationalRequest(API_ENDPOINTS.workforce.rosterPublish, { method: 'POST', body }),
    getPayrollConfiguration: (pharmacyId: number | string) => operationalRequest<WorkforcePayrollConfiguration>(API_ENDPOINTS.workforce.payrollConfiguration, { query: { pharmacy_id: pharmacyId } }),
    updatePayrollConfiguration: (body: unknown) => operationalRequest<WorkforcePayrollConfiguration>(API_ENDPOINTS.workforce.payrollConfiguration, { method: 'PATCH', body }),
    listWorkSettings: (pharmacyId: number | string) => operationalRequest<WorkforceWorkSettings[]>(API_ENDPOINTS.workforce.workSettings, { query: { pharmacy_id: pharmacyId } }),
    saveWorkSettings: (body: unknown) => operationalRequest<WorkforceWorkSettings>(API_ENDPOINTS.workforce.workSettings, { method: 'POST', body }),
    listEmploymentEngagements: (pharmacyId: number | string, membershipId?: number | string) => operationalRequest<WorkforceEmploymentEngagement[]>(API_ENDPOINTS.workforce.employmentEngagements, { query: { pharmacy_id: pharmacyId, ...(membershipId ? { membership_id: membershipId } : {}) } }),
    previewEmploymentEngagementAward: (body: unknown) => operationalRequest<WorkforceAwardPreview>(API_ENDPOINTS.workforce.employmentEngagementAwardPreview, { method: 'POST', body }),
    createEmploymentEngagement: (body: unknown) => operationalRequest<WorkforceEmploymentEngagement>(API_ENDPOINTS.workforce.employmentEngagements, { method: 'POST', body }),
    updateEmploymentEngagement: (publicId: string, body: unknown) => operationalRequest<WorkforceEmploymentEngagement>(API_ENDPOINTS.workforce.employmentEngagement(publicId), { method: 'PATCH', body }),
    listCoverageRequirements: (pharmacyId: number | string) => operationalRequest<WorkforceCoverageRequirement[]>(API_ENDPOINTS.workforce.coverageRequirements, { query: { pharmacy_id: pharmacyId } }),
    createCoverageRequirement: (body: unknown) => operationalRequest<WorkforceCoverageRequirement>(API_ENDPOINTS.workforce.coverageRequirements, { method: 'POST', body }),
    deleteCoverageRequirement: (id: number | string) => operationalRequest(API_ENDPOINTS.workforce.coverageRequirement(id), { method: 'DELETE' }),
    listLeave: (query?: Record<string, unknown>) => operationalRequest<WorkforceLeave[]>(API_ENDPOINTS.workforce.leave, { query }),
    createLeave: (body: unknown) => operationalRequest<WorkforceLeave>(API_ENDPOINTS.workforce.leave, { method: 'POST', body }),
    decideLeave: (id: number | string, decision: string, managerNote = '') => operationalRequest<WorkforceLeave>(API_ENDPOINTS.workforce.leaveDecision(id), { method: 'POST', body: { decision, manager_note: managerNote } }),
    listTimesheetPeriods: (pharmacyId: number | string) => operationalRequest<WorkforceTimesheetPeriod[]>(API_ENDPOINTS.workforce.timesheetPeriods, { query: { pharmacy_id: pharmacyId } }),
    openTimesheetPeriod: (pharmacyId: number | string, startDate: string, endDate: string) => operationalRequest<WorkforceTimesheetPeriod>(API_ENDPOINTS.workforce.timesheetPeriods, { method: 'POST', body: { pharmacy_id: pharmacyId, start_date: startDate, end_date: endDate } }),
    getTimesheetPeriodSummary: (id: number | string) => operationalRequest<WorkforceTimesheetSummary>(API_ENDPOINTS.workforce.timesheetPeriodSummary(id)),
    recalculateTimesheetPeriod: (id: number | string, sync = false) => operationalRequest(API_ENDPOINTS.workforce.timesheetPeriodRecalculate(id), { method: 'POST', body: { sync } }),
    lockTimesheetPeriod: (id: number | string) => operationalRequest(API_ENDPOINTS.workforce.timesheetPeriodLock(id), { method: 'POST', body: {} }),
    // Reopen a locked period on purpose to fix a mistake; the superseded manifest is kept and re-locking adjusts it.
    correctTimesheetPeriod: (id: number | string, reason: string) => operationalRequest(API_ENDPOINTS.workforce.timesheetPeriodCorrect(id), { method: 'POST', body: { reason } }),
    listTimesheets: (periodId: number | string, query: Record<string, unknown> = {}) => operationalRequest<WorkforceTimesheetRow[]>(API_ENDPOINTS.workforce.timesheets, { query: { period_id: periodId, ...query } }),
    getTimesheet: (id: number | string) => operationalRequest<WorkforceTimesheetDetail>(API_ENDPOINTS.workforce.timesheet(id)),
    recalculateTimesheet: (id: number | string) => operationalRequest(API_ENDPOINTS.workforce.timesheetRecalculate(id), { method: 'POST', body: {} }),
    addMissingPunch: (id: number | string, body: unknown) => operationalRequest<{
        timesheet: WorkforceTimesheetDetail;
        event_id: number;
    }>(API_ENDPOINTS.workforce.timesheetMissingPunch(id), { method: 'POST', body }),
    submitTimesheet: (id: number | string, revisionNumber: number) => operationalRequest(API_ENDPOINTS.workforce.timesheetSubmit(id), { method: 'POST', body: { revision_number: revisionNumber } }),
    approveTimesheet: (id: number | string, revisionNumber: number, reason = '') => operationalRequest(API_ENDPOINTS.workforce.timesheetApprove(id), { method: 'POST', body: { revision_number: revisionNumber, reason } }),
    reopenTimesheet: (id: number | string, reason: string) => operationalRequest(API_ENDPOINTS.workforce.timesheetReopen(id), { method: 'POST', body: { reason } }),
    addTimesheetComment: (id: number | string, body: unknown, workerVisible = true) => operationalRequest(API_ENDPOINTS.workforce.timesheetComments(id), { method: 'POST', body: { body, worker_visible: workerVisible } }),
    decideTimesheetCheck: (id: number | string, decision: string, reason: string) => operationalRequest(API_ENDPOINTS.workforce.timesheetCheckDecision(id), { method: 'POST', body: { decision, reason } }),
    getMyHours: (query?: Record<string, unknown>) => operationalRequest<WorkforceMyHoursRow[]>(API_ENDPOINTS.workforce.myHours, { query }),
};
