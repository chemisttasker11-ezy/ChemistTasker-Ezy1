import type { NotificationApi } from '../../types';
import type { Collection } from '../../contracts/common';
/** Domain-owned operations extracted from the established shared API. */
import { fetchApi } from '../../transport/application';
import { mapNotification } from './mappers';
export function getNotifications(page = 1) {
    return fetchApi<Collection<NotificationApi> & {
        unread?: number;
        count_unread?: number;
    }>(`/notifications/?page=${page}`);
}
export function markNotificationsAsRead(ids: number[] | undefined) {
    return fetchApi<{
        marked?: number;
        unread?: number;
    }>('/notifications/mark-read/', { method: 'POST', body: JSON.stringify(ids ? { ids } : {}) });
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

/** A best-effort Expo push-device registration; notification failure is not a login failure. */
export function registerPushDeviceToken(token: string, platform: 'ios' | 'android' | 'web') {
    return fetchApi('/device-tokens/', {
        method: 'POST',
        body: JSON.stringify({ token, platform }),
    });
}


/** Server-authoritative, user-scoped Expo push notification preferences. */
export interface NotificationPushPreferences {
  push_messages: boolean;
  push_tasks: boolean;
  push_work_notes: boolean;
  push_alerts: boolean;
  quiet_hours_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  time_zone: string;
}
export function getNotificationPushPreferences() {
  return fetchApi<NotificationPushPreferences>('/notification-push-preferences/');
}
export function updateNotificationPushPreferences(data: Partial<NotificationPushPreferences>) {
  return fetchApi<NotificationPushPreferences>('/notification-push-preferences/', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
