import type { ChatMessageApi, ChatRoomApi, ChatUserApi } from '../../types';
/** Domain-owned operations extracted from the established shared API. */
import { camelCaseKeysDeep } from '../../utils/serialization';
const mapChatUser = <T extends Partial<ChatUserApi>>(api: T) => {
    const base = camelCaseKeysDeep(api);
    return {
        ...base,
        email: base.email ?? undefined,
    };
};
export const mapChatMessage = (api: ChatMessageApi) => ({
    id: api.id,
    conversation: api.conversation,
    sender: api.sender ? {
        id: api.sender.id,
        user_details: mapChatUser(api.sender.user_details),
        pharmacy: api.sender.pharmacy ?? null,
    } : null,
    body: api.is_deleted ? '' : api.body,
    attachment_url: api.is_deleted ? null : api.attachment_url,
    created_at: api.created_at,
    is_deleted: api.is_deleted,
    is_edited: api.is_edited,
    original_body: api.is_deleted ? null : api.original_body ?? null,
    reactions: api.reactions?.map(reaction => ({
        reaction: reaction.reaction,
        user_id: reaction.user_id,
    })),
    attachment_filename: api.is_deleted ? null : api.attachment_filename ?? null,
    is_pinned: api.is_pinned,
});
export const mapChatRoom = (api: ChatRoomApi) => ({
    id: api.id,
    type: api.type,
    title: api.title,
    pharmacy: api.pharmacy ?? null,
    unread_count: api.unread_count ?? 0,
    updated_at: api.updated_at,
    last_message: api.last_message
        ? {
            id: api.last_message.id,
            body: api.last_message.is_deleted ? '' : api.last_message.body,
            is_deleted: api.last_message.is_deleted,
            created_at: api.last_message.created_at,
            sender: api.last_message.sender,
        }
        : null,
    my_last_read_at: api.my_last_read_at ?? null,
    participant_ids: api.participant_ids,
    my_membership_id: api.my_membership_id ?? null,
    is_pinned: api.is_pinned,
    pinned_message: api.pinned_message ? mapChatMessage(api.pinned_message) : null,
});
export const mapChatParticipantRecord = (api: {
    id: number;
    user_details?: Partial<ChatUserApi>;
    role?: string | null;
    employment_type?: string | null;
    invited_name?: string | null;
    is_admin?: boolean;
}) => ({
    ...mapChatUser(api.user_details ?? {}),
    id: api.id,
    membership_id: api.id,
    userDetails: mapChatUser(api.user_details ?? {}),
    role: api.role ?? undefined,
    employmentType: api.employment_type ?? undefined,
    invitedName: api.invited_name ?? undefined,
    isAdmin: api.is_admin ?? false,
});
