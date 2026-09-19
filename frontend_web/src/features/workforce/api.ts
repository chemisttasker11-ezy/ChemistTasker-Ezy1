import type { WorkforceEmploymentEngagementWrite } from '@chemisttasker/shared-core';
import { chemistTaskerApi } from '../../config/api';

const workforce = chemistTaskerApi.workforce;

export const fetchRosterWorkspace = (pharmacyId: number, weekStart: string) => workforce.getRosterWorkspace(pharmacyId, weekStart);
export const validateRosterRevision = (periodId: number, expectedRevision: number) => workforce.validateRoster(periodId, expectedRevision);
export const publishRosterRevision = (args: { periodId: number; expectedRevision: number; acknowledgedWarningKeys: string[]; operationId: string }) => workforce.publishRoster({ period_id: args.periodId, expected_revision: args.expectedRevision, acknowledged_warning_keys: args.acknowledgedWarningKeys, operation_id: args.operationId });
export const listTimesheetPeriods = (pharmacyId: number) => workforce.listTimesheetPeriods(pharmacyId);
export const openTimesheetPeriod = (pharmacyId: number, startDate: string, endDate: string) => workforce.openTimesheetPeriod(pharmacyId, startDate, endDate);
export const fetchTimesheetSummary = (periodId: number) => workforce.getTimesheetPeriodSummary(periodId);
export const recalculateTimesheetPeriod = (periodId: number, sync = false) => workforce.recalculateTimesheetPeriod(periodId, sync);
export const lockTimesheetPeriod = (periodId: number) => workforce.lockTimesheetPeriod(periodId);
export const listTimesheets = (periodId: number, filters?: { status?: string; search?: string }) => workforce.listTimesheets(periodId, filters);
export const fetchTimesheetDetail = (timesheetId: number) => workforce.getTimesheet(timesheetId);
export const recalculateTimesheet = (timesheetId: number) => workforce.recalculateTimesheet(timesheetId);
export const approveTimesheet = (timesheetId: number, revisionNumber: number, reason = '') => workforce.approveTimesheet(timesheetId, revisionNumber, reason);
export const reopenTimesheet = (timesheetId: number, reason: string) => workforce.reopenTimesheet(timesheetId, reason);
export const submitMyTimesheet = (timesheetId: number, revisionNumber: number) => workforce.submitTimesheet(timesheetId, revisionNumber);
export const decideTimesheetCheck = (checkId: number, decision: 'RESOLVED' | 'WAIVED' | 'REOPENED', reason: string) => workforce.decideTimesheetCheck(checkId, decision, reason);
export const addTimesheetComment = (timesheetId: number, body: string, workerVisible = true) => workforce.addTimesheetComment(timesheetId, body, workerVisible);
export const fetchMyHours = (params?: { pharmacy_id?: number; period_id?: number }) => workforce.getMyHours(params);
export const addMissingPunch = (timesheetId: number, args: { sessionId: number; eventType: 'CLOCK_IN' | 'CLOCK_OUT'; occurredAt?: string; occurredAtLocal?: string; reason: string }) => workforce.addMissingPunch(timesheetId, { session_id: args.sessionId, event_type: args.eventType, ...(args.occurredAt ? { occurred_at: args.occurredAt } : {}), ...(args.occurredAtLocal ? { occurred_at_local: args.occurredAtLocal } : {}), reason: args.reason });
export const listCoverageRequirements = (pharmacyId: number) => workforce.listCoverageRequirements(pharmacyId);
export const createCoverageRequirement = (payload: { pharmacy_id: number; weekday: number; start_time: string; end_time: string; role: string; minimum_staff: number; active?: boolean }) => workforce.createCoverageRequirement(payload);
export const deleteCoverageRequirement = (id: number) => workforce.deleteCoverageRequirement(id);
export const listWorkSettings = (pharmacyId: number) => workforce.listWorkSettings(pharmacyId);
export const saveWorkSettings = (payload: { membership_id: number; contracted_weekly_minutes: number | null; effective_from?: string | null; work_pattern?: Record<string, unknown> }) => workforce.saveWorkSettings(payload);
export const listWorkforceLeave = (params?: { pharmacy_id?: number; status?: string }) => workforce.listLeave(params);
export const createWorkforceLeave = (payload: { membership_id: number; leave_type: string; start_at: string; end_at: string; note?: string }) => workforce.createLeave(payload);
export const decideWorkforceLeave = (id: number, decision: 'APPROVED' | 'REJECTED' | 'CANCELLED', managerNote = '') => workforce.decideLeave(id, decision, managerNote);

export const listEmploymentEngagements = (pharmacyId: number, membershipId?: number) => workforce.listEmploymentEngagements(pharmacyId, membershipId);
export const previewEmploymentEngagementAward = (payload: { membership_id: number; employment_type?: string; award_classification?: string }) => workforce.previewEmploymentEngagementAward(payload);
export const createEmploymentEngagement = (payload: WorkforceEmploymentEngagementWrite) => workforce.createEmploymentEngagement(payload);
export const updateEmploymentEngagement = (publicId: string, payload: Partial<WorkforceEmploymentEngagementWrite>) => workforce.updateEmploymentEngagement(publicId, payload);
