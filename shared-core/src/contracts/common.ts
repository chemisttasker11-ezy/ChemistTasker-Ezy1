/** Wire-level primitives. Unknown JSON stays unknown until a domain contract is selected. */
export type ResourceId = number | string;
export type QueryParams = Record<string, unknown>;
export interface PageMetadata {
    count?: number;
    next?: string | null;
    previous?: string | null;
}
// Several deployed endpoints return an array for an unpaginated request. Optional metadata
// on the array arm permits inspection without asserting that every endpoint paginates.
export type Collection<T> = ({
    results: T[];
} & PageMetadata) | (T[] & PageMetadata & {
    results?: never;
});
export interface ActionResponse {
    status?: string;
    detail?: string;
    message?: string;
}
