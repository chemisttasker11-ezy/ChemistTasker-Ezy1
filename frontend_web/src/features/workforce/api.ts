import apiClient from '../../utils/apiClient';
import type {
  RosterWorkspaceResponse,
  TimesheetDetail,
  TimesheetPeriod,
  TimesheetRow,
  TimesheetSummary,
} from './types';

const ROOT = '/client-profile/workforce';

export async function fetchRosterWorkspace(pharmacyId: number, weekStart: string) {
  const { data } = await apiClient.get<RosterWorkspaceResponse>(`${ROOT}/roster/workspace/`, {
    params: { pharmacy_id: pharmacyId, week_start: weekStart },
  });
  return data;
}

export async function validateRosterRevision(periodId: number, expectedRevision: number) {
  const { data } = await apiClient.post(`${ROOT}/roster/validate/`, {
    period_id: periodId,
    expected_revision: expectedRevision,
  });
  return data;
}

export async function publishRosterRevision(args: {
  periodId: number;
  expectedRevision: number;
  acknowledgedWarningKeys: string[];
  operationId: string;
}) {
  const { data } = await apiClient.post(`${ROOT}/roster/publish/`, {
    period_id: args.periodId,
    expected_revision: args.expectedRevision,
    acknowledged_warning_keys: args.acknowledgedWarningKeys,
    operation_id: args.operationId,
  });
  return data;
}

export async function listTimesheetPeriods(pharmacyId: number) {
  const { data } = await apiClient.get<TimesheetPeriod[]>(`${ROOT}/timesheet-periods/`, {
    params: { pharmacy_id: pharmacyId },
  });
  return data;
}

export async function openTimesheetPeriod(pharmacyId: number, startDate: string, endDate: string) {
  const { data } = await apiClient.post(`${ROOT}/timesheet-periods/`, {
    pharmacy_id: pharmacyId,
    start_date: startDate,
    end_date: endDate,
  });
  return data as { id: number; created: boolean; status: string };
}

export async function fetchTimesheetSummary(periodId: number) {
  const { data } = await apiClient.get<TimesheetSummary>(`${ROOT}/timesheet-periods/${periodId}/summary/`);
  return data;
}

export async function recalculateTimesheetPeriod(periodId: number, sync = false) {
  const { data } = await apiClient.post(`${ROOT}/timesheet-periods/${periodId}/recalculate/`, { sync });
  return data;
}

export async function lockTimesheetPeriod(periodId: number) {
  const { data } = await apiClient.post(`${ROOT}/timesheet-periods/${periodId}/lock/`, {});
  return data;
}

export async function listTimesheets(periodId: number, filters?: { status?: string; search?: string }) {
  const { data } = await apiClient.get<TimesheetRow[]>(`${ROOT}/timesheets/`, {
    params: { period_id: periodId, ...filters },
  });
  return data;
}

export async function fetchTimesheetDetail(timesheetId: number) {
  const { data } = await apiClient.get<TimesheetDetail>(`${ROOT}/timesheets/${timesheetId}/`);
  return data;
}

export async function recalculateTimesheet(timesheetId: number) {
  const { data } = await apiClient.post<TimesheetDetail>(`${ROOT}/timesheets/${timesheetId}/recalculate/`, {});
  return data;
}

export async function approveTimesheet(timesheetId: number, revisionNumber: number, reason = '') {
  const { data } = await apiClient.post<TimesheetDetail>(`${ROOT}/timesheets/${timesheetId}/approve-time/`, {
    revision_number: revisionNumber,
    reason,
  });
  return data;
}

export async function reopenTimesheet(timesheetId: number, reason: string) {
  const { data } = await apiClient.post<TimesheetDetail>(`${ROOT}/timesheets/${timesheetId}/reopen/`, { reason });
  return data;
}

export async function submitMyTimesheet(timesheetId: number, revisionNumber: number) {
  const { data } = await apiClient.post<TimesheetDetail>(`${ROOT}/timesheets/${timesheetId}/submit/`, {
    revision_number: revisionNumber,
  });
  return data;
}

export async function decideTimesheetCheck(checkId: number, decision: 'RESOLVED' | 'WAIVED' | 'REOPENED', reason: string) {
  const { data } = await apiClient.post(`${ROOT}/timesheet-checks/${checkId}/decision/`, { decision, reason });
  return data;
}

export async function addTimesheetComment(timesheetId: number, body: string, workerVisible = true) {
  const { data } = await apiClient.post(`${ROOT}/timesheets/${timesheetId}/comments/`, {
    body,
    worker_visible: workerVisible,
  });
  return data;
}

export async function fetchMyHours(params?: { pharmacy_id?: number; period_id?: number }) {
  const { data } = await apiClient.get(`${ROOT}/my-hours/`, { params });
  return data as Array<TimesheetRow & { pharmacy: { id: number; name: string }; start_date: string; end_date: string }>;
}

export async function addMissingPunch(timesheetId: number, args: {
  sessionId: number;
  eventType: 'CLOCK_IN' | 'CLOCK_OUT';
  occurredAt?: string;
  occurredAtLocal?: string;
  reason: string;
}) {
  const { data } = await apiClient.post(`${ROOT}/timesheets/${timesheetId}/missing-punch/`, {
    session_id: args.sessionId,
    event_type: args.eventType,
    ...(args.occurredAt ? { occurred_at: args.occurredAt } : {}),
    ...(args.occurredAtLocal ? { occurred_at_local: args.occurredAtLocal } : {}),
    reason: args.reason,
  });
  return data as { created_event_id: number; timesheet: TimesheetDetail };
}

export async function listCoverageRequirements(pharmacyId: number) {
  const { data } = await apiClient.get(`${ROOT}/coverage-requirements/`, { params: { pharmacy_id: pharmacyId } });
  return data as Array<{ id: number; weekday: number; start_time: string; end_time: string; role: string; minimum_staff: number; active: boolean }>;
}

export async function createCoverageRequirement(payload: { pharmacy_id: number; weekday: number; start_time: string; end_time: string; role: string; minimum_staff: number; active?: boolean }) {
  const { data } = await apiClient.post(`${ROOT}/coverage-requirements/`, payload);
  return data;
}

export async function deleteCoverageRequirement(id: number) {
  await apiClient.delete(`${ROOT}/coverage-requirements/${id}/`);
}

export async function listWorkSettings(pharmacyId: number) {
  const { data } = await apiClient.get(`${ROOT}/work-settings/`, { params: { pharmacy_id: pharmacyId } });
  return data as Array<{ membership_id: number; worker_id: number; worker_name: string; role: string; employment_type: string; contracted_weekly_minutes: number | null; effective_from: string | null; work_pattern: Record<string, unknown> }>;
}

export async function saveWorkSettings(payload: { membership_id: number; contracted_weekly_minutes: number | null; effective_from?: string | null; work_pattern?: Record<string, unknown> }) {
  const { data } = await apiClient.post(`${ROOT}/work-settings/`, payload);
  return data;
}

export async function listWorkforceLeave(params?: { pharmacy_id?: number; status?: string }) {
  const { data } = await apiClient.get(`${ROOT}/leave/`, { params });
  return data as Array<any>;
}

export async function createWorkforceLeave(payload: { membership_id: number; leave_type: string; start_at: string; end_at: string; note?: string }) {
  const { data } = await apiClient.post(`${ROOT}/leave/`, payload);
  return data;
}

export async function decideWorkforceLeave(id: number, decision: 'APPROVED' | 'REJECTED' | 'CANCELLED', managerNote = '') {
  const { data } = await apiClient.post(`${ROOT}/leave/${id}/decision/`, { decision, manager_note: managerNote });
  return data;
}
