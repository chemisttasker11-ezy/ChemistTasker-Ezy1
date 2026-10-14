import { fetchApi } from '../../transport/application';
import { PLATFORM_ENDPOINTS } from '../../constants/platformEndpoints';

/** Report a public talent hub post or job board shift; the board's moderators review it. Needs a signed-in member. */
export function reportBoardItem(kind: 'talent' | 'jobs', id: number, reason: string) {
  return fetchApi<{ detail: string }>(PLATFORM_ENDPOINTS.publicHub.boardReport(kind, id), { method: 'POST', body: JSON.stringify({ reason }) });
}

/** The reasons offered in the report dialog, in the words moderators will read. */
export const BOARD_REPORT_REASONS = ['Spam or a scam', 'Fake or misleading', 'Offensive or inappropriate', 'Something else'] as const;
