import { fetchApi } from '../../transport/application';
import { buildQuery } from '../../utils/serialization';

export interface ShiftDescriptionTemplateApi { id: number; pharmacy: number; role_needed: string; description: string }
export async function listShiftDescriptionTemplates(pharmacy: number, role: string): Promise<ShiftDescriptionTemplateApi[]> {
  const result = await fetchApi<ShiftDescriptionTemplateApi[] | {results: ShiftDescriptionTemplateApi[]}>(`/shift-description-templates/${buildQuery({pharmacy,role_needed:role})}`);
  return Array.isArray(result) ? result : result.results;
}
export function saveShiftDescriptionTemplate(pharmacy: number, role: string, description: string): Promise<ShiftDescriptionTemplateApi> {
  return fetchApi('/shift-description-templates/', {method:'POST',body:JSON.stringify({pharmacy,role_needed:role,description})});
}
