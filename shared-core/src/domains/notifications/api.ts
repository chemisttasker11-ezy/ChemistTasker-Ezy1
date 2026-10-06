import type { NotificationApi } from '../../types';
import type { Collection } from '../../contracts/common';
/** Domain-owned operations extracted from the established shared API. */
import { fetchApi } from '../../transport/application';
import { mapNotification } from './mappers';
export function getNotifications(page = 1) {
    return fetchApi<Collection<NotificationApi> & {
        unread?: number;
        count_unread?: number;
    }>(`/client-profile/notifications/?page=${page}`);
}
export function markNotificationsAsRead(ids: number[] | undefined) {
    return fetchApi<{
        marked?: number;
        unread?: number;
    }>('/client-profile/notifications/mark-read/', { method: 'POST', body: JSON.stringify(ids ? { ids } : {}) });
}
export async function fetchNotificationsPage(page = 1) {
    const data = await getNotifications(page);
    const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];
    const notifications = list.map(mapNotification);
    return {
        count: typeof data?.count === 'number' ? data.count : notifications.length,
        next: data?.next ?? null,
        previous: data?.previous ?? null,
        results: notifications,
        unread: typeof data?.unread === 'number' ? data.unread : undefined,
        countUnread: typeof data?.count_unread === 'number' ? data.count_unread : undefined,
    };
}
export async function markNotificationsReadService(ids: number[] | undefined) {
    const response = await markNotificationsAsRead(ids);
    return {
        marked: typeof response?.marked === 'number' ? response.marked : undefined,
        unread: typeof response?.unread === 'number' ? response.unread : undefined,
    };
}
