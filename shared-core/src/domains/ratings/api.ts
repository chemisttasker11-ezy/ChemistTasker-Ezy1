interface RatingTarget {
    targetType: string;
    targetId: number;
    page?: number;
}
import type { ShiftRatingCommentApi, ShiftRatingSummaryApi } from '../../types';
import type { Collection } from '../../contracts/common';
/** Domain-owned operations extracted from the established shared API. */
import { fetchApi } from '../../transport/application';
import { asList, buildQuery, toPaginatedList } from '../../utils/serialization';
import { mapShiftRatingComment, mapShiftRatingSummary } from '../shifts/mappers';
export function getRatings(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<ShiftRatingCommentApi>>(`/ratings/${query}`);
}
export function createRating(data: unknown) {
    return fetchApi<ShiftRatingCommentApi>('/ratings/', { method: 'POST', body: JSON.stringify(data) });
}
export function getRatingsSummary(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<ShiftRatingSummaryApi>(`/ratings/summary/${query}`);
}
export function getMyRatings(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<ShiftRatingCommentApi>>(`/ratings/mine/${query}`);
}
export function getPendingRatings() {
    return fetchApi('/ratings/pending/');
}
export async function fetchRatingsSummaryService(params: RatingTarget) {
    const data = await getRatingsSummary({
        target_type: params.targetType,
        target_id: params.targetId,
    });
    return mapShiftRatingSummary(data);
}
export async function fetchRatingsPageService(params: RatingTarget) {
    const data = await getRatings({
        target_type: params.targetType,
        target_id: params.targetId,
        page: params.page,
    });
    return toPaginatedList(data, mapShiftRatingComment);
}
export async function fetchMyRatingForTargetService(params: RatingTarget) {
    const data = await getMyRatings({
        target_type: params.targetType,
        target_id: params.targetId,
    });
    const list = asList(data);
    if (list.length > 0) {
        return mapShiftRatingComment(list[0]);
    }
    if (data && typeof data === 'object' && 'id' in data) {
        return mapShiftRatingComment(data as unknown as ShiftRatingCommentApi);
    }
    return null;
}
export async function createRatingService(payload: unknown) {
    const data = await createRating(payload);
    return mapShiftRatingComment(data);
}
export async function reportRatingService(ratingId: number | string, reason: string) {
    return fetchApi(`/ratings/${ratingId}/report/`, { method: 'POST', body: JSON.stringify({ reason }) });
}
