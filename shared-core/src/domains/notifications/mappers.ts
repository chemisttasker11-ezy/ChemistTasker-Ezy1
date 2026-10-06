import type { NotificationApi } from '../../types';
/** Domain-owned operations extracted from the established shared API. */
export const mapNotification = (api: NotificationApi) => ({
    id: api.id,
    type: api.type,
    title: api.title,
    body: api.body,
    actionUrl: api.action_url,
    payload: api.payload,
    createdAt: api.created_at,
    readAt: api.read_at,
});
