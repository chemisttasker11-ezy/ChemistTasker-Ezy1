/** Optional saved defaults and explicit planner actions shared by web and native. */
import type { Collection } from '../../contracts/common';
import type {
  SavedTaskApi, SavedTaskInput, OperationsContext, PlannerCopyInput, PlannerCopyResult, PlannerRosterInput,
} from '../../contracts/calendar';
import { fetchApi } from '../../transport/application';
import { asList, buildQuery } from '../../utils/serialization';

export type {
  SavedTaskApi, SavedTaskInput, OperationsContext, PlannerCopyInput, PlannerCopyResult, PlannerRosterInput,
} from '../../contracts/calendar';

export function getOperationsContext() {
  return fetchApi<OperationsContext>('/operation-context/');
}
export async function listSavedTasks(pharmacyId: number) {
  return asList(await fetchApi<Collection<SavedTaskApi>>(
    '/saved-tasks/' + buildQuery({ pharmacy_id: pharmacyId }),
  ));
}
export function createSavedTask(payload: SavedTaskInput) {
  return fetchApi<SavedTaskApi>('/saved-tasks/', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateSavedTask(id: number, payload: Partial<SavedTaskInput>) {
  return fetchApi<SavedTaskApi>(`/saved-tasks/${id}/`, { method: 'PATCH', body: JSON.stringify(payload) });
}
export async function deleteSavedTask(id: number): Promise<void> {
  await fetchApi<void>(`/saved-tasks/${id}/`, { method: 'DELETE' });
}
export function copyPlannerTasks(payload: PlannerCopyInput) {
  return fetchApi<PlannerCopyResult>('/planner-copy/', { method: 'POST', body: JSON.stringify(payload) });
}
export function fillPlannerFromRoster(payload: PlannerRosterInput) {
  return fetchApi<{ assignee_membership_ids: number[] }>(
    '/planner-roster-fill/', { method: 'POST', body: JSON.stringify(payload) },
  );
}
