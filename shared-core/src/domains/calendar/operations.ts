/** Canonical pharmacy operations adapter shared by Vite and Expo clients.
 * Calendar / WorkNote is the single authority for published task completion.
 */
import type { Collection } from '../../contracts/common';
import { fetchApi } from '../../transport/application';
import { asList, buildQuery } from '../../utils/serialization';

export type OperationAudience = 'NAMED' | 'ON_DUTY' | 'ROLE_ON_DUTY' | 'TEAM_POOL' | 'EVERY_ON_DUTY';
export type OperationPeriod = 'daily' | 'weekly' | 'monthly' | 'training' | 'campaign' | 'other';
export type OperationStepDefinition = { id: string; label: string; required: boolean };
export type OperationProgress = {
  status: 'DRAFT' | 'NOT_STARTED' | 'PROGRESSING' | 'AWAITING_VERIFICATION' | 'FINISHED';
  assigned: number;
  completed: number;
  kpi_actual: number;
  verified: boolean;
};
export type OperationTemplate = {
  id: number;
  pharmacy: number | null;
  organization: number | null;
  name: string;
  category: string;
  area: string;
  description: string;
  recurrence: { freq: string; byweekday?: number[]; interval?: number };
  audience: OperationAudience;
  role_codes: string[];
  checklist: OperationStepDefinition[];
  requires_verification: boolean;
  target_value: number | null;
  target_unit: string;
  target_kind: 'operational' | 'clinical' | 'safety';
  training_url: string;
  active: boolean;
};
export type OperationCatalogEntry = Omit<OperationTemplate, 'id' | 'pharmacy' | 'organization' | 'active'> & { catalog_id: string };
export type OperationTask = {
  id: number;
  plan: number;
  template: number | null;
  calendar_note_id: number | null;
  date: string;
  title: string;
  description: string;
  area: string;
  start_time: string | null;
  end_time: string | null;
  audience: OperationAudience;
  membership_ids: number[];
  role_codes: string[];
  checklist: OperationStepDefinition[];
  requires_verification: boolean;
  target_value: number | null;
  target_unit: string;
  target_kind: 'operational' | 'clinical' | 'safety';
  training_url: string;
  progress: OperationProgress;
  can_manage: boolean;
};
export type OperationPlan = {
  id: number;
  pharmacy: number;
  name: string;
  period: OperationPeriod;
  starts_on: string;
  ends_on: string;
  notes: string;
  status: 'DRAFT' | 'PUBLISHED';
  revision: number;
  items: OperationTask[];
  published_at: string | null;
};
export type OperationsContext = {
  pharmacies: Array<{ id: number; name: string; organization_id: number | null }>;
  categories: Array<{ id: string; label: string }>;
};
export type OperationPreflight = {
  ready: boolean;
  blockers: Array<{ task_id: number; date: string; message: string }>;
  assignments: Array<{ task_id: number; membership_ids: number[] }>;
};
type DraftPlan = Pick<OperationPlan, 'pharmacy' | 'name' | 'period' | 'starts_on' | 'ends_on'> & { notes?: string };
type DraftTask = Pick<OperationTask, 'plan' | 'date' | 'title' | 'description' | 'area' | 'audience' | 'membership_ids' | 'role_codes' | 'checklist' | 'requires_verification' | 'target_kind'> & {
  start_time?: string | null; end_time?: string | null; target_value?: number | null; target_unit?: string;
  training_url?: string;
};

export function getOperationsContext() {
  return fetchApi<OperationsContext>('/operation-context/');
}
export async function listOperationsCatalog() {
  const response = await fetchApi<{ templates: OperationCatalogEntry[] }>('/operation-catalog/');
  return response.templates;
}
export async function listOperationTemplates(pharmacyId: number) {
  const response = await fetchApi<Collection<OperationTemplate>>(
    '/operation-templates/' + buildQuery({ pharmacy_id: pharmacyId }),
  );
  return asList(response);
}
export function createOperationTemplate(payload: Partial<OperationTemplate>) {
  return fetchApi<OperationTemplate>('/operation-templates/', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateOperationTemplate(id: number, payload: Partial<OperationTemplate>) {
  return fetchApi<OperationTemplate>('/operation-templates/' + id + '/', { method: 'PATCH', body: JSON.stringify(payload) });
}
export function deleteOperationTemplate(id: number) {
  return fetchApi('/operation-templates/' + id + '/', { method: 'DELETE' });
}
export async function listOperationPlans(pharmacyId: number) {
  const response = await fetchApi<Collection<OperationPlan>>(
    '/operation-plans/' + buildQuery({ pharmacy_id: pharmacyId }),
  );
  return asList(response);
}
export function createOperationPlan(payload: DraftPlan) {
  return fetchApi<OperationPlan>('/operation-plans/', { method: 'POST', body: JSON.stringify(payload) });
}
export function getOperationPlan(id: number) {
  return fetchApi<OperationPlan>('/operation-plans/' + id + '/');
}
export function editOperationPlan(id: number, payload: Partial<DraftPlan>) {
  return fetchApi<OperationPlan>('/operation-plans/' + id + '/', { method: 'PATCH', body: JSON.stringify(payload) });
}
export function deleteOperationPlan(id: number) {
  return fetchApi('/operation-plans/' + id + '/', { method: 'DELETE' });
}
export function applyOperationTemplate(planId: number, templateId: number) {
  return fetchApi<{ created: number; plan: OperationPlan }>('/operation-plans/' + planId + '/apply_template/', {
    method: 'POST', body: JSON.stringify({ template_id: templateId }),
  });
}
export function previewOperationPlan(id: number) {
  return fetchApi<OperationPreflight>('/operation-plans/' + id + '/preview/');
}
export function publishOperationPlan(id: number, revision: number) {
  return fetchApi<{ plan: OperationPlan; preflight: OperationPreflight }>(
    '/operation-plans/' + id + '/publish/',
    { method: 'POST', body: JSON.stringify({ revision }) },
  );
}
export function copyOperationDay(planId: number, sourceDate: string, destinationDate: string, revision: number, requestKey: string) {
  return fetchApi<{created: number; already_copied: boolean; revision: number}>('/operation-plans/' + planId + '/copy_day/', {
    method: 'POST', body: JSON.stringify({source_date: sourceDate, destination_date: destinationDate, revision, request_key: requestKey}),
  });
}
export function managerReopenOperationTask(id: number, reason: string) {
  return fetchApi<{reopened: boolean; reset_submissions: number}>('/operation-items/' + id + '/manager_reopen/', {
    method: 'POST', body: JSON.stringify({reason}),
  });
}
export function createOperationTask(payload: DraftTask) {
  return fetchApi<OperationTask>('/operation-items/', { method: 'POST', body: JSON.stringify(payload) });
}
export function editOperationTask(id: number, payload: Partial<DraftTask>) {
  return fetchApi<OperationTask>('/operation-items/' + id + '/', { method: 'PATCH', body: JSON.stringify(payload) });
}
export function deleteOperationTask(id: number) {
  return fetchApi('/operation-items/' + id + '/', { method: 'DELETE' });
}
export function getOperationTask(id: number) {
  return fetchApi<OperationTask>('/operation-items/' + id + '/');
}
export function getOperationMySteps(id: number) {
  return fetchApi<{ completed_step_ids: string[] }>('/operation-items/' + id + '/my_steps/');
}
export function toggleOperationStep(id: number, stepId: string, done: boolean, evidenceNote = '') {
  return fetchApi<{ completed_step_ids: string[] }>('/operation-items/' + id + '/step/', {
    method: 'POST', body: JSON.stringify({ step_id: stepId, done, evidence_note: evidenceNote }),
  });
}
export function recordOperationKpi(id: number, value: number, key: string, note = '') {
  return fetchApi<{ created: boolean; progress: OperationProgress }>('/operation-items/' + id + '/record_kpi/', {
    method: 'POST', body: JSON.stringify({ value, key, note }),
  });
}
export function verifyOperationTask(id: number, note = '') {
  return fetchApi<{ verified: boolean; by: number }>('/operation-items/' + id + '/verify/', {
    method: 'POST', body: JSON.stringify({ note }),
  });
}
export function submitOperationWork(noteId: number, date: string) {
  return fetchApi('/work-notes/' + noteId + '/mark_done/', {
    method: 'POST', body: JSON.stringify({ occurrence_date: date }),
  });
}
export function reopenOperationWork(noteId: number, date: string) {
  return fetchApi('/work-notes/' + noteId + '/mark_open/', {
    method: 'POST', body: JSON.stringify({ occurrence_date: date }),
  });
}
