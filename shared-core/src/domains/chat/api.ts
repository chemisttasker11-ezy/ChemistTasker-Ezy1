import type { ChatRoomApi, ChatMessageApi, ChatUserApi } from '../../types';
import type { Collection } from '../../contracts/common';
/** Domain-owned operations extracted from the established shared API. */
import { fetchApi } from '../../transport/application';
import { mapChatMessage, mapChatParticipantRecord, mapChatRoom } from './mappers';
export function getRooms() {
    return fetchApi<Collection<ChatRoomApi>>('/rooms/');
}
export function getRoomDetail(id: number | string) {
    return fetchApi<ChatRoomApi>(`/rooms/${id}/`);
}
export function getRoomMessages(id: number | string) {
    return fetchApi<Collection<ChatMessageApi>>(`/rooms/${id}/messages/`);
}
export function sendRoomMessage(id: number | string, data: unknown) {
    return fetchApi<ChatMessageApi>(`/rooms/${id}/messages/`, {
        method: 'POST',
        body: data instanceof FormData ? data : JSON.stringify(data),
    });
}
export function markRoomAsRead(id: number | string) {
    return fetchApi<{
        last_read_at: string | null;
    }>(`/rooms/${id}/read/`, { method: 'POST' });
}
export function getChatParticipants() {
    return fetchApi<Collection<Parameters<typeof mapChatParticipantRecord>[0]>>('/chat-participants/');
}
export function startDm(data: unknown) {
    // Debug: verify DM endpoint and payload at runtime
    // This should be hitting get-or-create-dm; if you see start-dm in the network tab, the build is stale.
    console.debug('shared-core startDm -> POST /rooms/get-or-create-dm/', data);
    return fetchApi<ChatRoomApi>('/rooms/get-or-create-dm/', { method: 'POST', body: JSON.stringify(data) });
}
export function getOrCreateGroup(data: unknown) {
    return fetchApi<ChatRoomApi>('/rooms/get-or-create-group/', { method: 'POST', body: JSON.stringify(data) });
}
export function getOrCreateDmByUser(data: unknown) {
    return fetchApi<ChatRoomApi>('/rooms/get-or-create-dm-by-user/', { method: 'POST', body: JSON.stringify(data) });
}
export interface ShiftContactApi {
    pharmacy_id: number | null;
    pharmacy_name: string;
    pharmacies?: Array<{
        id: number | string;
        name: string;
    }>;
    shift_id?: number | null;
    shift_date?: string | null;
    role: string;
    user: ChatUserApi;
}
export function fetchShiftContacts() {
    return fetchApi('/rooms/shift-contacts/');
}
export function updateMessage(messageId: number | string, data: unknown) {
    return fetchApi<ChatMessageApi>(`/messages/${messageId}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteMessage(messageId: number | string) {
    return fetchApi(`/messages/${messageId}/`, { method: 'DELETE' });
}
export function reactToMessage(messageId: number | string, data: unknown) {
    return fetchApi<void>(`/messages/${messageId}/react/`, { method: 'POST', body: JSON.stringify(data) });
}
export function toggleRoomPin(roomId: number | string, data: unknown) {
    return fetchApi<ChatRoomApi>(`/rooms/${roomId}/toggle-pin/`, { method: 'POST', body: JSON.stringify(data) });
}
export function deleteRoomRequest(roomId: number | string) {
    return fetchApi(`/rooms/${roomId}/`, { method: 'DELETE' });
}
export async function fetchRooms() {
    const data = await getRooms();
    const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];
    return list.map(mapChatRoom);
}
export async function fetchRoom(roomId: number | string) {
    const data = await getRoomDetail(roomId);
    return mapChatRoom(data);
}
export async function fetchRoomMessagesService(roomId: number | string) {
    const data = await getRoomMessages(roomId);
    const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];
    return {
        messages: list.map(mapChatMessage),
        next: data?.next ?? null,
    };
}
export async function fetchRoomMessagesByUrl(url: string) {
    const data = await fetchApi<Collection<ChatMessageApi>>(url);
    const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];
    return {
        messages: list.map(mapChatMessage),
        next: data?.next ?? null,
    };
}
export async function sendRoomMessageService(roomId: number | string, payload: unknown) {
    const data = await sendRoomMessage(roomId, payload);
    return mapChatMessage(data);
}
export async function markRoomAsReadService(roomId: number | string) {
    const data = await markRoomAsRead(roomId);
    return data?.last_read_at ?? null;
}
export async function startDirectMessageByMembership(participantMembershipId: number | string, pharmacyId: number | string | null) {
    const data = await startDm({
        partner_membership_id: participantMembershipId,
    });
    return mapChatRoom(data);
}
export async function createOrUpdateGroupRoom(payload: {
    roomId?: number | string;
    title?: string;
    participants?: number[];
}) {
    const body = {
        room_id: payload.roomId,
        title: payload.title,
        participant_ids: payload.participants,
    };
    const data = await getOrCreateGroup(body);
    return mapChatRoom(data);
}
export async function getOrCreatePharmacyGroup(pharmacyId: number | string) {
    const data = await getOrCreateGroup({ pharmacy_id: pharmacyId });
    return mapChatRoom(data);
}
export async function startDirectMessageByUser(partnerUserId: number | string) {
    const data = await getOrCreateDmByUser({ partner_user_id: partnerUserId });
    return mapChatRoom(data);
}
export async function fetchChatParticipants() {
    const data = await getChatParticipants();
    const list = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];
    return list.map(mapChatParticipantRecord);
}
export async function fetchRoomMessages(nextUrl: string) {
    return fetchRoomMessagesByUrl(nextUrl);
}
export async function updateMessageService(messageId: number | string, body: unknown) {
    const data = await updateMessage(messageId, { body });
    return mapChatMessage(data);
}
export async function deleteMessageService(messageId: number | string) {
    await deleteMessage(messageId);
}
export async function reactToMessageService(messageId: number | string, reaction: string) {
    // The API returns an empty success response; WebSocket events update reactions.
    await reactToMessage(messageId, { reaction });
}
export async function deleteRoomService(roomId: number | string) {
    await deleteRoomRequest(roomId);
}
export async function toggleRoomPinService(roomId: number | string, payload: {
    target?: string;
    message_id?: number | null;
    messageId?: number | null;
}) {
    // Normalize camelCase to the API's expected snake_case
    const body: {
        target?: string;
        message_id?: number | null;
    } = { target: payload?.target };
    if (payload?.message_id !== undefined) {
        body['message_id'] = payload.message_id;
    }
    if (payload?.messageId !== undefined) {
        body['message_id'] = payload.messageId;
    }
    const data = await toggleRoomPin(roomId, body);
    return mapChatRoom(data);
}
