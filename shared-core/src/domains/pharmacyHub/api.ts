import type { HubPollPayload, HubPostPayload, HubCommentPayload, HubGroupPayload, HubProfilePayload } from '../../types';
interface HubDirectoryMemberApi {
    membership_id: number;
    user_id: number | null;
    full_name: string;
    role: string | null;
    employment_type: string | null;
    pharmacy_id: number | null;
    pharmacy_name: string | null;
    job_title?: string | null;
    is_own_pharmacy: boolean;
}
import type { Collection } from '../../contracts/common';
import type { HubContextApi, HubGroupApi, HubPostApi, CommentApi, HubPollApi, PollCommentApi, PharmacyContextApi, OrganizationContextApi, HubScopeSelection } from '../../types';
/** Domain-owned operations extracted from the established shared API. */
import { fetchApi, fetchWithAuth } from '../../transport/application';
import { asList, buildQuery, extractNext } from '../../utils/serialization';
import { buildPostFormData, buildScopeParams, groupMemberDisplayName, mapComment, mapContext, mapGroup, mapOptionFromSource, mapOrganization, mapPharmacy, mapPoll, mapPost } from './mappers';
export function getHubContext() {
    return fetchApi<HubContextApi>('/client-profile/hub/context/');
}
export function getHubGroups(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<HubGroupApi>>(`/client-profile/hub/groups/${query}`);
}
export function getHubGroupDetail(id: number | string, includeMembers: boolean | undefined) {
    const params = includeMembers ? '?include_members=true' : '';
    return fetchApi<HubGroupApi>(`/client-profile/hub/groups/${id}/${params}`);
}
export function createHubGroup(data: unknown) {
    return fetchApi<HubGroupApi>('/client-profile/hub/groups/', { method: 'POST', body: JSON.stringify(data) });
}
export function updateHubGroup(id: number | string, data: unknown) {
    return fetchApi<HubGroupApi>(`/client-profile/hub/groups/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteHubGroup(id: number | string) {
    return fetchApi(`/client-profile/hub/groups/${id}/`, { method: 'DELETE' });
}
export function getHubPosts(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<HubPostApi>>(`/client-profile/hub/posts/${query}`);
}
export function getHubPostDetail(id: number | string) {
    return fetchApi<HubPostApi>(`/client-profile/hub/posts/${id}/`);
}
export function createHubPost(data: unknown) {
    return fetchApi<HubPostApi>('/client-profile/hub/posts/', { method: 'POST', body: data instanceof FormData ? data : JSON.stringify(data) });
}
export function updateHubPost(id: number | string, data: unknown) {
    return fetchApi<HubPostApi>(`/client-profile/hub/posts/${id}/`, { method: 'PATCH', body: data instanceof FormData ? data : JSON.stringify(data) });
}
export function deleteHubPost(id: number | string) {
    return fetchApi(`/client-profile/hub/posts/${id}/`, { method: 'DELETE' });
}
export function pinHubPost(id: number | string) {
    return fetchApi<HubPostApi>(`/client-profile/hub/posts/${id}/pin/`, { method: 'POST' });
}
export function unpinHubPost(id: number | string) {
    return fetchApi<HubPostApi>(`/client-profile/hub/posts/${id}/unpin/`, { method: 'POST' });
}
export function getHubPostComments(postId: number | string) {
    return fetchApi<Collection<CommentApi>>(`/client-profile/hub/posts/${postId}/comments/`);
}
export function createHubComment(postId: number | string, data: unknown) {
    return fetchApi<CommentApi>(`/client-profile/hub/posts/${postId}/comments/`, { method: 'POST', body: JSON.stringify(data) });
}
export function updateHubComment(postId: number | string, commentId: number | string, data: unknown) {
    return fetchApi<CommentApi>(`/client-profile/hub/posts/${postId}/comments/${commentId}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteHubComment(postId: number | string, commentId: number | string) {
    return fetchApi(`/client-profile/hub/posts/${postId}/comments/${commentId}/`, { method: 'DELETE' });
}
export function reactToHubPost(postId: number | string, reaction: string) {
    return fetchApi<HubPostApi>(`/client-profile/hub/posts/${postId}/reactions/`, {
        method: 'POST',
        body: JSON.stringify({ reaction_type: reaction }),
    });
}
export function removeHubPostReaction(postId: number | string) {
    return fetchApi(`/client-profile/hub/posts/${postId}/reactions/`, { method: 'DELETE' });
}
export function reactToHubComment(postId: number | string, commentId: number | string, reaction: string) {
    return fetchApi<CommentApi>(`/client-profile/hub/posts/${postId}/comments/${commentId}/reactions/`, {
        method: 'POST',
        body: JSON.stringify({ reaction_type: reaction }),
    });
}
export function removeHubCommentReaction(postId: number | string, commentId: number | string) {
    return fetchApi<CommentApi>(`/client-profile/hub/posts/${postId}/comments/${commentId}/reactions/`, { method: 'DELETE' });
}
export function getHubPolls(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<HubPollApi>>(`/client-profile/hub/polls/${query}`);
}
export function getHubPollDetail(id: number | string) {
    return fetchApi<HubPollApi>(`/client-profile/hub/polls/${id}/`);
}
export function createHubPoll(data: unknown) {
    return fetchApi<HubPollApi>('/client-profile/hub/polls/', { method: 'POST', body: JSON.stringify(data) });
}
export function voteOnHubPoll(id: number | string, optionId: number | string) {
    return fetchApi<HubPollApi>(`/client-profile/hub/polls/${id}/vote/`, {
        method: 'POST',
        body: JSON.stringify({ option_id: optionId }),
    });
}
export function getHubPollComments(pollId: number | string) {
    return fetchApi<Collection<PollCommentApi>>(`/client-profile/hub/polls/${pollId}/comments/`);
}
export function createHubPollComment(pollId: number | string, data: unknown) {
    return fetchApi<PollCommentApi>(`/client-profile/hub/polls/${pollId}/comments/`, { method: 'POST', body: JSON.stringify(data) });
}
export function updateHubPollComment(pollId: number | string, commentId: number | string, data: unknown) {
    return fetchApi<PollCommentApi>(`/client-profile/hub/polls/${pollId}/comments/${commentId}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteHubPollComment(pollId: number | string, commentId: number | string) {
    return fetchApi(`/client-profile/hub/polls/${pollId}/comments/${commentId}/`, { method: 'DELETE' });
}
export function reactToHubPoll(pollId: number | string, reaction: string) {
    return fetchApi<HubPollApi>(`/client-profile/hub/polls/${pollId}/reactions/`, {
        method: 'POST',
        body: JSON.stringify({ reaction_type: reaction }),
    });
}
export function removeHubPollReaction(pollId: number | string) {
    return fetchApi<HubPollApi>(`/client-profile/hub/polls/${pollId}/reactions/`, { method: 'DELETE' });
}
export function updateHubPoll(id: number | string, data: unknown) {
    return fetchApi<HubPollApi>(`/client-profile/hub/polls/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteHubPoll(id: number | string) {
    return fetchApi(`/client-profile/hub/polls/${id}/`, { method: 'DELETE' });
}
export function updatePharmacyHubProfile(id: number | string, data: FormData) {
    return fetchApi<PharmacyContextApi>(`/client-profile/hub/pharmacies/${id}/profile/`, { method: 'PATCH', body: data });
}
export function updateOrganizationHubProfile(id: number | string, data: FormData) {
    return fetchApi<OrganizationContextApi>(`/client-profile/hub/organizations/${id}/profile/`, { method: 'PATCH', body: data });
}
export async function fetchHubContext() {
    const response = await getHubContext();
    return mapContext(response);
}
export async function fetchHubPosts(scope: HubScopeSelection, options: {
    cursor?: string | null;
} = {}) {
    let data;
    if (options.cursor) {
        data = await fetchWithAuth<Collection<HubPostApi>>(options.cursor);
    }
    else {
        const params = { ...buildScopeParams(scope) };
        data = (await getHubPosts(params));
    }
    const posts = asList(data).map(mapPost);
    return { posts, next: extractNext(data) };
}
export async function fetchHubPost(postId: number | string) {
    const data = await getHubPostDetail(postId);
    return mapPost(data);
}
export async function fetchHubPolls(scope: HubScopeSelection) {
    const params = buildScopeParams(scope);
    const data = await getHubPolls(params);
    return asList(data).map(mapPoll);
}
export async function createHubPollService(scope: HubScopeSelection, payload: HubPollPayload) {
    const body = {
        question: payload.question,
        options: payload.options,
        ...buildScopeParams(scope),
    };
    const data = await createHubPoll(body);
    return mapPoll(data);
}
export async function fetchHubPollComments(pollId: number | string) {
    const data = await getHubPollComments(pollId);
    return asList(data).map(mapComment);
}
export async function createHubPollCommentService(pollId: number | string, payload: {
    body: string;
}) {
    const data = await createHubPollComment(pollId, {
        body: payload.body,
    });
    return mapComment(data);
}
export async function updateHubPollCommentService(pollId: number | string, commentId: number | string, payload: {
    body: string;
}) {
    const data = await updateHubPollComment(pollId, commentId, { body: payload.body });
    return mapComment(data);
}
export async function deleteHubPollCommentService(pollId: number | string, commentId: number | string) {
    await deleteHubPollComment(pollId, commentId);
}
export async function voteHubPollService(pollId: number | string, optionId: number | string) {
    const data = await voteOnHubPoll(pollId, optionId);
    return mapPoll(data);
}
export async function reactToHubPollService(pollId: number | string, reaction: string) {
    const data = await reactToHubPoll(pollId, reaction);
    return mapPoll(data);
}
export async function removeHubPollReactionService(pollId: number | string) {
    const data = await removeHubPollReaction(pollId);
    return mapPoll(data);
}
export async function updateHubPollService(pollId: number | string, payload: Partial<HubPollPayload>) {
    const body: Record<string, unknown> = {};
    if (payload.question !== undefined)
        body.question = payload.question;
    if (payload.options)
        body.options = payload.options;
    const data = await updateHubPoll(pollId, body);
    return mapPoll(data);
}
export async function deleteHubPollService(pollId: number | string) {
    await deleteHubPoll(pollId);
}
export async function createHubPostService(scope: HubScopeSelection, payload: HubPostPayload) {
    const { data, isMultipart } = buildPostFormData(payload, scope);
    // Avoid double stringification: createHubPost will JSON.stringify non-FormData bodies.
    const response = await createHubPost(isMultipart ? data : data);
    return mapPost(response);
}
export async function updateHubPostService(postId: number | string, payload: Partial<HubPostPayload>) {
    const { data, isMultipart } = buildPostFormData(payload);
    // Avoid double stringification: updateHubPost will JSON.stringify non-FormData bodies.
    const response = await updateHubPost(postId, isMultipart ? data : data);
    return mapPost(response);
}
export async function deleteHubPostService(postId: number | string) {
    await deleteHubPost(postId);
}
export async function pinHubPostService(postId: number | string) {
    const data = await pinHubPost(postId);
    return mapPost(data);
}
export async function unpinHubPostService(postId: number | string) {
    const data = await unpinHubPost(postId);
    return mapPost(data);
}
export async function fetchHubComments(postId: number | string) {
    const data = await getHubPostComments(postId);
    return asList(data).map(mapComment);
}
export async function createHubCommentService(postId: number | string, payload: HubCommentPayload) {
    const data = await createHubComment(postId, {
        body: payload.body,
        parent_comment: payload.parentComment ?? null,
    });
    return mapComment(data);
}
export async function updateHubCommentService(postId: number | string, commentId: number | string, payload: Partial<HubCommentPayload>) {
    const body: Record<string, unknown> = {};
    if (payload.body !== undefined)
        body.body = payload.body;
    if (payload.parentComment !== undefined)
        body.parent_comment = payload.parentComment;
    const data = await updateHubComment(postId, commentId, body);
    return mapComment(data);
}
export async function deleteHubCommentService(postId: number | string, commentId: number | string) {
    await deleteHubComment(postId, commentId);
}
export async function reactToHubCommentService(postId: number | string, commentId: number | string, reaction: string) {
    const data = await reactToHubComment(postId, commentId, reaction);
    return mapComment(data);
}
export async function removeHubCommentReactionService(postId: number | string, commentId: number | string) {
    const data = await removeHubCommentReaction(postId, commentId);
    return mapComment(data);
}
export async function reactToHubPostService(postId: number | string, reaction: string) {
    const data = await reactToHubPost(postId, reaction);
    return mapPost(data);
}
export async function removeHubReaction(postId: number | string) {
    await removeHubPostReaction(postId);
}
export async function createHubGroupService(payload: HubGroupPayload) {
    const body: Record<string, unknown> = {
        pharmacy_id: payload.pharmacyId,
        name: payload.name,
    };
    if (payload.organizationId !== undefined)
        body.organization_id = payload.organizationId;
    if (payload.description !== undefined)
        body.description = payload.description;
    if (payload.memberIds?.length)
        body.member_ids = payload.memberIds;
    const data = await createHubGroup(body);
    return mapGroup(data);
}
export async function fetchHubGroup(groupId: number | string, options: {
    includeMembers?: boolean;
} | undefined) {
    const data = await getHubGroupDetail(groupId, options?.includeMembers);
    return mapGroup(data);
}
export async function updateHubGroupService(groupId: number | string, payload: Partial<HubGroupPayload>, options: {
    includeMembers?: boolean;
} | undefined) {
    const body: Record<string, unknown> = {};
    if (payload.pharmacyId !== undefined)
        body.pharmacy_id = payload.pharmacyId;
    if (payload.organizationId !== undefined)
        body.organization_id = payload.organizationId;
    if (payload.name !== undefined)
        body.name = payload.name;
    if (payload.description !== undefined)
        body.description = payload.description;
    if (payload.memberIds !== undefined)
        body.member_ids = payload.memberIds;
    const data = await updateHubGroup(groupId, body);
    if (options?.includeMembers) {
        return fetchHubGroup(groupId, { includeMembers: true });
    }
    return mapGroup(data);
}
export async function deleteHubGroupService(groupId: number | string) {
    await deleteHubGroup(groupId);
}
export async function updatePharmacyHubProfileService(pharmacyId: number | string, payload: HubProfilePayload) {
    const formData = new FormData();
    if (payload.about !== undefined)
        formData.append('about', payload.about ?? '');
    if (payload.coverImage)
        formData.append('cover_image', payload.coverImage);
    const data = await updatePharmacyHubProfile(pharmacyId, formData);
    return mapPharmacy(data);
}
export async function updateOrganizationHubProfileService(organizationId: number | string, payload: HubProfilePayload) {
    const formData = new FormData();
    if (payload.about !== undefined)
        formData.append('about', payload.about ?? '');
    if (payload.coverImage)
        formData.append('cover_image', payload.coverImage);
    const data = await updateOrganizationHubProfile(organizationId, formData);
    return mapOrganization(data);
}
export async function fetchHubMemberDirectory(params: {
    scope: string;
    pharmacyId?: number | string;
    organizationId?: number | string;
    groupId?: number | string;
    search?: string;
    limit?: number;
}) {
    const query = new URLSearchParams({ scope: params.scope });
    if (params.pharmacyId != null)
        query.set('pharmacy_id', String(params.pharmacyId));
    if (params.organizationId != null)
        query.set('organization_id', String(params.organizationId));
    if (params.groupId != null)
        query.set('group_id', String(params.groupId));
    if (params.search)
        query.set('search', params.search);
    if (params.limit)
        query.set('limit', String(params.limit));
    const data = await fetchApi<Collection<HubDirectoryMemberApi>>(`/client-profile/hub/members/?${query.toString()}`);
    return asList(data).map(member => ({
        ...mapOptionFromSource({
            membershipId: member.membership_id,
            userId: member.user_id ?? null,
            fullName: member.full_name,
            email: null,
            role: member.role ?? null,
            employmentType: member.employment_type ?? null,
            pharmacyId: member.pharmacy_id ?? null,
            pharmacyName: member.pharmacy_name ?? null,
            jobTitle: member.job_title || null,
        }),
        isOwnPharmacy: Boolean(member.is_own_pharmacy),
    }));
}
export async function fetchPharmacyGroupMembers(pharmacyId: number | string, search = '') {
    return fetchHubMemberDirectory({ scope: 'pharmacy', pharmacyId, search });
}
export async function fetchOrganizationGroupMembers(organizationId: number | string) {
    const data = await getHubGroups({ organization_id: organizationId, include_pharmacy_members: true });
    return asList(data)
        .flatMap(group => group.members ?? [])
        .map(member => mapOptionFromSource({
        membershipId: member.membership_id,
        userId: member.member?.user_details.id ?? null,
        fullName: groupMemberDisplayName(member),
        email: member.member?.user_details.email ?? null,
        role: member.member?.role ?? null,
        employmentType: member.member?.employment_type ?? null,
        pharmacyId: member.pharmacy_id ?? null,
        pharmacyName: member.pharmacy_name ?? null,
        jobTitle: member.job_title ?? null,
    }));
}
export async function fetchOrganizationMembers(organizationId: number | string, search = '') {
    return fetchHubMemberDirectory({ scope: 'organization', organizationId, search });
}
export async function fetchHubGroupMembers(groupId: number | string) {
    const group = await fetchHubGroup(groupId, { includeMembers: true });
    return (group.members ?? []).map(member => mapOptionFromSource({
        membershipId: member.membershipId,
        userId: member.member.userDetails.id,
        fullName: groupMemberDisplayName(member),
        email: null,
        role: member.member.role,
        employmentType: member.member.employmentType,
        pharmacyId: member.pharmacyId ?? group.pharmacyId ?? null,
        pharmacyName: member.pharmacyName ?? group.pharmacyName ?? null,
        jobTitle: member.jobTitle ?? null,
    }));
}
