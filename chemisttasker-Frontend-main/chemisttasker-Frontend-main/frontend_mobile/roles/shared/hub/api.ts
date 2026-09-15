// Thin re-export layer so mobile hub screens can import from a single local module.
// Mirrors frontend_web/src/api/hub.ts but keeps paths stable in mobile.
import apiClient from '../../../utils/apiClient';
import {
  fetchHubContext,
  fetchHubPosts,
  fetchHubPost,
  fetchHubPolls,
  fetchHubComments,
  fetchHubGroup,
  fetchPharmacyGroupMembers,
  fetchOrganizationGroupMembers,
  fetchOrganizationMembers,
  fetchHubGroupMembers,
  removeHubReaction,
  createHubPollService as createHubPoll,
  voteHubPollService as voteHubPoll,
  createHubPostService as createHubPost,
  updateHubPostService as updateHubPost,
  deleteHubPostService as deleteHubPost,
  updateHubPollService as updateHubPoll,
  deleteHubPollService as deleteHubPoll,
  pinHubPostService as pinHubPost,
  unpinHubPostService as unpinHubPost,
  createHubCommentService as createHubComment,
  updateHubCommentService as updateHubComment,
  deleteHubCommentService as deleteHubComment,
  reactToHubCommentService as reactToHubComment,
  removeHubCommentReactionService as removeHubCommentReaction,
  reactToHubPostService as reactToHubPost,
  createHubGroupService as createHubGroup,
  updateHubGroupService as updateHubGroup,
  deleteHubGroupService as deleteHubGroup,
  updatePharmacyHubProfileService as updatePharmacyHubProfile,
  updateOrganizationHubProfileService as updateOrganizationHubProfile,
} from '@chemisttasker/shared-core';

const mapUserSummary = (api: any) => ({
  id: api?.id,
  username: api?.username ?? null,
  firstName: api?.first_name ?? api?.firstName ?? null,
  lastName: api?.last_name ?? api?.lastName ?? null,
  email: api?.email ?? null,
  profilePhotoUrl: api?.profile_photo_url ?? api?.profilePhotoUrl ?? null,
});

const mapMembership = (api: any) => ({
  id: api?.id ?? 0,
  role: api?.role ?? '',
  employmentType: api?.employment_type ?? api?.employmentType ?? '',
  jobTitle: api?.job_title ?? api?.jobTitle ?? null,
  userDetails: mapUserSummary(api?.user_details ?? api?.userDetails ?? api?.user ?? {}),
  user: mapUserSummary(api?.user_details ?? api?.userDetails ?? api?.user ?? {}),
});

const mapComment = (api: any) => ({
  id: api.id,
  postId: api.post ?? api.poll,
  body: api.body,
  createdAt: api.created_at ?? api.createdAt,
  updatedAt: api.updated_at ?? api.updatedAt,
  deletedAt: api.deleted_at ?? api.deletedAt ?? null,
  canEdit: api.can_edit ?? api.canEdit ?? false,
  parentCommentId: api.parent_comment ?? api.parentComment ?? null,
  author: mapMembership(api.author),
  isEdited: api.is_edited ?? api.isEdited ?? false,
  originalBody: api.original_body ?? api.originalBody ?? '',
  editedAt: api.edited_at ?? api.editedAt ?? null,
  editedBy: api.edited_by ? mapUserSummary(api.edited_by) : null,
  isDeleted: api.is_deleted ?? api.isDeleted ?? false,
  reactionSummary: api.reaction_summary ?? api.reactionSummary ?? undefined,
  viewerReaction: api.viewer_reaction ?? api.viewerReaction ?? null,
});

const mapPoll = (api: any) => ({
  id: api.id,
  question: api.question,
  pharmacyId: api.pharmacy,
  organizationId: api.organization,
  communityGroupId: api.community_group,
  platformHub: api.platform_hub ?? null,
  scopeType: api.scope_type ?? 'pharmacy',
  options: (api.options ?? []).map((opt: any) => ({
    id: opt.id,
    label: opt.label,
    voteCount: opt.vote_count ?? opt.voteCount ?? 0,
    percentage: opt.percentage ?? 0,
    position: opt.position ?? 0,
  })),
  totalVotes: api.total_votes ?? api.totalVotes ?? 0,
  hasVoted: api.has_voted ?? api.hasVoted ?? false,
  selectedOptionId: api.selected_option_id ?? api.selectedOptionId ?? null,
  canVote: api.can_vote ?? api.canVote ?? false,
  canManage: api.can_manage ?? api.canManage ?? false,
  author: mapMembership(api.author ?? api.created_by),
  commentCount: api.comment_count ?? api.commentCount ?? 0,
  reactionSummary: api.reaction_summary ?? api.reactionSummary ?? {},
  viewerReaction: api.viewer_reaction ?? api.viewerReaction ?? null,
  recentComments: (api.recent_comments ?? api.recentComments ?? []).map(mapComment),
  createdAt: api.created_at ?? api.createdAt,
  updatedAt: api.updated_at ?? api.updatedAt,
  closesAt: api.closes_at ?? api.closesAt ?? null,
  isClosed: api.is_closed ?? api.isClosed ?? false,
});

export {
  fetchHubContext,
  fetchHubPosts,
  fetchHubPost,
  fetchHubPolls,
  fetchHubComments,
  fetchHubGroup,
  fetchPharmacyGroupMembers,
  fetchOrganizationGroupMembers,
  fetchOrganizationMembers,
  fetchHubGroupMembers,
  removeHubReaction,
  createHubPoll,
  voteHubPoll,
  createHubPost,
  updateHubPost,
  deleteHubPost,
  updateHubPoll,
  deleteHubPoll,
  pinHubPost,
  unpinHubPost,
  createHubComment,
  updateHubComment,
  deleteHubComment,
  reactToHubComment,
  removeHubCommentReaction,
  reactToHubPost,
  createHubGroup,
  updateHubGroup,
  deleteHubGroup,
  updatePharmacyHubProfile,
  updateOrganizationHubProfile,
};

export async function fetchHubPollComments(pollId: number) {
  const { data } = await apiClient.get(`/client-profile/hub/polls/${pollId}/comments/`);
  const list = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
  return list.map(mapComment);
}

export async function createHubPollComment(pollId: number, payload: { body: string }) {
  const { data } = await apiClient.post(`/client-profile/hub/polls/${pollId}/comments/`, payload);
  return mapComment(data);
}

export async function updateHubPollComment(pollId: number, commentId: number, payload: { body: string }) {
  const { data } = await apiClient.patch(`/client-profile/hub/polls/${pollId}/comments/${commentId}/`, payload);
  return mapComment(data);
}

export async function deleteHubPollComment(pollId: number, commentId: number) {
  await apiClient.delete(`/client-profile/hub/polls/${pollId}/comments/${commentId}/`);
}

export async function reactToHubPoll(pollId: number, reactionType: string) {
  const { data } = await apiClient.post(`/client-profile/hub/polls/${pollId}/reactions/`, {
    reaction_type: reactionType,
  });
  return mapPoll(data);
}

export async function removeHubPollReaction(pollId: number) {
  const { data } = await apiClient.delete(`/client-profile/hub/polls/${pollId}/reactions/`);
  return mapPoll(data);
}
