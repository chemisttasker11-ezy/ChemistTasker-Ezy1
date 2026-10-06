import type { UserAvailabilityApi, ExplorerPostApi } from '../../types';
import type { Collection } from '../../contracts/common';
/** Domain-owned operations extracted from the established shared API. */
import { fetchApi } from '../../transport/application';
import { asList, buildQuery } from '../../utils/serialization';
import { mapUserAvailability } from './mappers';
export function getUserAvailability() {
    return fetchApi<Collection<UserAvailabilityApi>>('/user-availability/');
}
export function getUserAvailabilityDetail(id: number | string) {
    return fetchApi<UserAvailabilityApi>(`/user-availability/${id}/`);
}
export function createUserAvailability(data: unknown) {
    return fetchApi<UserAvailabilityApi>('/user-availability/', { method: 'POST', body: JSON.stringify(data) });
}
export function updateUserAvailability(id: number | string, data: unknown) {
    return fetchApi<UserAvailabilityApi>(`/user-availability/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteUserAvailability(id: number | string) {
    return fetchApi(`/user-availability/${id}/`, { method: 'DELETE' });
}
export async function fetchUserAvailabilityService() {
    const data = await getUserAvailability();
    return asList(data).map(mapUserAvailability);
}
export async function createUserAvailabilityService(payload: unknown) {
    const data = await createUserAvailability(payload);
    return mapUserAvailability(data);
}
export async function updateUserAvailabilityService(id: number | string, payload: unknown) {
    const data = await updateUserAvailability(id, payload);
    return mapUserAvailability(data);
}
export async function deleteUserAvailabilityService(id: number | string) {
    await deleteUserAvailability(id);
}
export function getExplorerPosts() {
    return fetchApi<Collection<ExplorerPostApi>>('/explorer-posts/');
}
export function getExplorerPostDetail(id: number | string) {
    return fetchApi<ExplorerPostApi>(`/explorer-posts/${id}/`);
}
export function getExplorerPostFeed(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<ExplorerPostApi>>(`/explorer-posts/feed/${query}`);
}
export function getPublicTalentFeed(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<ExplorerPostApi>>(`/explorer-posts/public-feed/${query}`, { skipAuth: true });
}
export function getExplorerPostsByProfile(profileId: number | string) {
    return fetchApi<Collection<ExplorerPostApi>>(`/explorer-posts/by-profile/${profileId}/`);
}
export function addExplorerPostView(id: number | string) {
    return fetchApi(`/explorer-posts/${id}/view/`, { method: 'POST' });
}
export function likeExplorerPost(id: number | string) {
    return fetchApi(`/explorer-posts/${id}/like/`, { method: 'POST' });
}
export function unlikeExplorerPost(id: number | string) {
    return fetchApi(`/explorer-posts/${id}/unlike/`, { method: 'POST' });
}
export function createExplorerPost(data: unknown) {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return fetchApi<ExplorerPostApi>('/explorer-posts/', { method: 'POST', body });
}
export function updateExplorerPost(id: number | string, data: unknown) {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return fetchApi<ExplorerPostApi>(`/explorer-posts/${id}/`, { method: 'PATCH', body });
}
export function deleteExplorerPost(id: number | string) {
    return fetchApi(`/explorer-posts/${id}/`, { method: 'DELETE' });
}
