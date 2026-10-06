import type { HubScopeSelection, HubPostPayload, PollCommentApi, HubGroupMemberOption, HubGroupMember } from '../../types';
import type { AttachmentApi, CommentApi, GroupMemberApi, HubContextApi, HubGroupApi, HubPollApi, HubPostApi, MembershipApi, OrganizationContextApi, PharmacyContextApi, PollOptionApi, TaggedMemberApi, UserSummaryApi } from '../../types';
/** Domain-owned operations extracted from the established shared API. */
const mapUserSummary = (api: UserSummaryApi | null | undefined) => {
    if (!api)
        return null;
    return {
        id: api.id,
        username: api.username ?? null,
        firstName: api.first_name,
        lastName: api.last_name,
        email: api.email,
        profilePhotoUrl: api.profile_photo_url ?? null,
    };
};
const mapAttachment = (api: AttachmentApi) => ({
    id: api.id,
    kind: api.kind,
    url: api.url,
    filename: api.filename,
    uploadedAt: api.uploaded_at,
});
const mapTaggedMember = (api: TaggedMemberApi) => ({
    membershipId: api.membership_id,
    fullName: api.full_name,
    email: api.email,
    role: api.role,
    jobTitle: api.job_title ?? null,
});
const mapMembership = (api: MembershipApi) => ({
    id: api.id,
    role: api.role,
    employmentType: api.employment_type,
    jobTitle: api.job_title ?? null,
    userDetails: {
        id: api.user_details.id,
        username: api.user_details.username ?? null,
        firstName: api.user_details.first_name,
        lastName: api.user_details.last_name,
        email: api.user_details.email,
        profilePhotoUrl: api.user_details.profile_photo_url ?? null,
    },
    user: mapUserSummary(api.user_details) ?? {
        id: api.user_details.id,
        username: api.user_details.username ?? null,
        firstName: api.user_details.first_name,
        lastName: api.user_details.last_name,
        email: api.user_details.email,
        profilePhotoUrl: api.user_details.profile_photo_url ?? null,
    },
});
export const mapComment = (api: CommentApi | PollCommentApi) => ({
    id: api.id,
    postId: api.post ?? api.poll,
    body: api.body,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    deletedAt: api.deleted_at,
    canEdit: api.can_edit,
    parentCommentId: api.parent_comment,
    author: mapMembership(api.author),
    isEdited: api.is_edited,
    originalBody: api.original_body,
    editedAt: api.edited_at,
    editedBy: mapUserSummary(api.edited_by),
    isDeleted: api.is_deleted,
    reactionSummary: api.reaction_summary ?? undefined,
    viewerReaction: api.viewer_reaction ?? null,
});
export const mapPost = (api: HubPostApi) => ({
    id: api.id,
    pharmacyId: api.pharmacy,
    pharmacyName: api.pharmacy_name,
    communityGroupId: api.community_group,
    communityGroupName: api.community_group_name,
    organizationId: api.organization,
    organizationName: api.organization_name,
    platformHub: api.platform_hub ?? null,
    scopeType: (api.scope_type ?? 'pharmacy'),
    scopeTargetId: api.scope_target_id,
    body: api.body,
    visibility: api.visibility,
    allowComments: api.allow_comments,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    deletedAt: api.deleted_at,
    commentCount: api.comment_count,
    reactionSummary: api.reaction_summary,
    viewerReaction: api.viewer_reaction ?? null,
    author: mapMembership(api.author),
    recentComments: (api.recent_comments ?? []).map(mapComment),
    attachments: (api.attachments ?? []).map(mapAttachment),
    isEdited: api.is_edited,
    isPinned: api.is_pinned,
    pinnedAt: api.pinned_at,
    pinnedBy: mapUserSummary(api.pinned_by),
    originalBody: api.original_body,
    editedAt: api.edited_at,
    editedBy: mapUserSummary(api.edited_by),
    viewerIsAdmin: api.viewer_is_admin,
    isDeleted: api.is_deleted,
    taggedMembers: (api.tagged_members ?? []).map(mapTaggedMember),
    canManage: api.can_manage ?? false,
});
const mapPollOption = (api: PollOptionApi) => ({
    id: api.id,
    label: api.label,
    voteCount: api.vote_count,
    percentage: api.percentage,
    position: api.position,
});
export const mapPoll = (api: HubPollApi) => ({
    id: api.id,
    question: api.question,
    pharmacyId: api.pharmacy,
    organizationId: api.organization,
    communityGroupId: api.community_group,
    platformHub: api.platform_hub ?? null,
    scopeType: (api.scope_type ?? 'pharmacy'),
    options: (api.options ?? []).map(mapPollOption),
    totalVotes: api.total_votes,
    hasVoted: api.has_voted,
    selectedOptionId: api.selected_option_id,
    canVote: api.can_vote,
    canManage: api.can_manage ?? false,
    author: mapMembership(api.author ?? api.created_by),
    commentCount: api.comment_count ?? 0,
    reactionSummary: api.reaction_summary ?? {},
    viewerReaction: api.viewer_reaction ?? null,
    recentComments: (api.recent_comments ?? []).map(mapComment),
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    closesAt: api.closes_at,
    isClosed: api.is_closed,
});
export const mapPharmacy = (api: PharmacyContextApi) => ({
    id: api.id,
    name: api.name,
    about: api.about,
    coverImageUrl: api.cover_image_url,
    organizationId: api.organization_id,
    organizationName: api.organization_name,
    canManageProfile: api.can_manage_profile,
    canCreateGroup: api.can_create_group,
    canCreatePost: api.can_create_post,
});
export const mapOrganization = (api: OrganizationContextApi) => ({
    id: api.id,
    name: api.name,
    about: api.about,
    coverImageUrl: api.cover_image_url,
    canManageProfile: api.can_manage_profile,
    isOrgAdmin: api.is_org_admin,
    memberCount: api.member_count ?? 0,
});
const mapGroupMember = (api: GroupMemberApi) => ({
    membershipId: api.membership_id,
    member: mapMembership(api.member),
    isAdmin: api.is_admin,
    joinedAt: api.joined_at,
    pharmacyId: api.pharmacy_id ?? null,
    pharmacyName: api.pharmacy_name ?? null,
    jobTitle: api.job_title ?? null,
});
export const mapGroup = (api: HubGroupApi) => ({
    id: api.id,
    pharmacyId: api.pharmacy,
    pharmacyName: api.pharmacy_name,
    organizationId: api.organization_id,
    name: api.name,
    description: api.description,
    memberCount: api.member_count,
    isAdmin: api.is_admin,
    isMember: api.is_member,
    isCreator: api.is_creator,
    members: api.members ? api.members.map(mapGroupMember) : undefined,
});
export const mapContext = (api: HubContextApi) => ({
    pharmacies: (api.pharmacies ?? []).map(mapPharmacy),
    organizations: (api.organizations ?? []).map(mapOrganization),
    communityGroups: (api.community_groups ?? []).map(mapGroup),
    organizationGroups: (api.organization_groups ?? []).map(mapGroup),
    chemisttaskerHubs: (api.chemisttasker_hubs ?? []).map((hub) => ({
        key: hub.key,
        label: hub.label,
        audienceType: hub.audience_type,
    })),
    defaultPharmacyId: api.default_pharmacy_id,
    defaultOrganizationId: api.default_organization_id,
});
export const buildScopeParams = (scope: HubScopeSelection) => {
    const params: Record<string, string | number> = { scope: scope.type };
    if (scope.type === 'pharmacy') {
        params.pharmacy_id = scope.id;
    }
    else if (scope.type === 'organization') {
        params.organization_id = scope.id;
    }
    else if (scope.type === 'group') {
        params.group_id = scope.id;
    }
    else if (scope.type === 'platform') {
        params.platform_hub = scope.id;
    }
    return params;
};
export const buildPostFormData = (payload: Partial<HubPostPayload>, scope?: HubScopeSelection) => {
    const hasFiles = payload.attachments && payload.attachments.length > 0;
    if (!hasFiles) {
        const plain: Record<string, unknown> = {};
        if (payload.body !== undefined)
            plain.body = payload.body;
        if (payload.visibility)
            plain.visibility = payload.visibility;
        if (payload.allowComments !== undefined) {
            plain.allow_comments = payload.allowComments;
        }
        if (payload.removeAttachmentIds?.length) {
            plain.remove_attachment_ids = payload.removeAttachmentIds;
        }
        if (payload.taggedMemberIds) {
            plain.tagged_member_ids = payload.taggedMemberIds;
        }
        if (scope) {
            Object.assign(plain, buildScopeParams(scope));
        }
        return { data: plain, isMultipart: false };
    }
    const formData = new FormData();
    if (payload.body !== undefined)
        formData.append('body', payload.body);
    if (payload.visibility)
        formData.append('visibility', payload.visibility);
    if (payload.allowComments !== undefined) {
        formData.append('allow_comments', String(payload.allowComments));
    }
    payload.attachments?.forEach(file => formData.append('attachments', file));
    payload.removeAttachmentIds?.forEach(id => formData.append('remove_attachment_ids', String(id)));
    payload.taggedMemberIds?.forEach(id => formData.append('tagged_member_ids', String(id)));
    if (scope) {
        const scopeParams = buildScopeParams(scope);
        Object.entries(scopeParams).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                formData.append(key, String(value));
            }
        });
    }
    return { data: formData, isMultipart: true };
};
export const mapOptionFromSource = (source: Omit<HubGroupMemberOption, "employmentType" | "role" | "profilePhotoUrl" | "userId"> & Pick<HubGroupMemberOption, "membershipId" | "fullName"> & {
    employmentType?: string | null;
    role?: string | null;
    profilePhotoUrl?: string | null;
    userId?: number | null;
}) => ({
    membershipId: source.membershipId,
    userId: source.userId ?? null,
    fullName: source.fullName,
    email: source.email,
    role: source.role ?? 'MEMBER',
    employmentType: source.employmentType ?? null,
    pharmacyId: source.pharmacyId,
    pharmacyName: source.pharmacyName,
    jobTitle: source.jobTitle ?? null,
    profilePhotoUrl: source.profilePhotoUrl ?? null,
});
const isEmailLike = (value: unknown) => typeof value === 'string' && value.includes('@');
export const groupMemberDisplayName = (member: GroupDisplayMember) => {
    const details = member.member?.userDetails ?? member.member?.user_details ?? {};
    const composed = `${details.firstName ?? details.first_name ?? ''} ${details.lastName ?? details.last_name ?? ''}`.trim();
    const candidates = [
        details.fullName,
        details.full_name,
        composed,
        member.member?.invitedName,
        member.member?.invited_name,
        details.username,
    ];
    for (const candidate of candidates) {
        const value = typeof candidate === 'string' ? candidate.trim() : '';
        if (value && !isEmailLike(value)) {
            return value;
        }
    }
    return `Member ${member.membership_id ?? member.membershipId ?? ''}`.trim();
};
interface DisplayIdentity {
    first_name?: string | null;
    last_name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    full_name?: string | null;
    fullName?: string | null;
    username?: string | null;
}
interface GroupDisplayMember {
    membership_id?: number;
    membershipId?: number;
    member?: {
        userDetails?: DisplayIdentity;
        user_details?: DisplayIdentity;
        invited_name?: string | null;
        invitedName?: string | null;
    };
}
