/**
 * Canonical Content Workspace endpoint owner. The Next browser BFF provides
 * the request-scoped cookie/CSRF transport, but cannot construct its own
 * arbitrary content routes. Content permissions remain Django authoritative.
 */
interface ContentGateway {
  contentManagement: {
    request<T>(path: string, options?: { method?: string; body?: object }): Promise<T>;
  };
}
export type ContentDocumentAction = 'submit' | 'publish' | 'return' | 'archive';

export function createContentOperations(gateway: ContentGateway) {
  const request = <T>(path: string, method = 'GET', body?: unknown) =>
    gateway.contentManagement.request<T>(`/content/${path}`, {
      method, body: body as object | undefined,
    });

  return {
    currentUser: <T>() => request<T>('me/'),
    documents: <T>(area: string, page: number) =>
      request<T>(`documents/?area=${encodeURIComponent(area)}&page=${page}`),
    saveDocument: <T>(documentId: number | null, body: unknown) =>
      request<T>(documentId == null ? 'documents/' : `documents/${documentId}/`,
        documentId == null ? 'POST' : 'PATCH', body),
    documentAction: <T>(documentId: number, action: ContentDocumentAction, body: unknown) =>
      request<T>(`documents/${documentId}/${action}/`, 'POST', body),
    uploadMedia: <T>(data: FormData) => request<T>('media/', 'POST', data),
    invitations: <T>(page: number) => request<T>(`invitations/?page=${page}`),
    teamMembers: <T>(page: number) => request<T>(`team/?page=${page}`),
    inviteContributor: <T>(body: unknown) => request<T>('invitations/', 'POST', body),
    resendInvitation: <T>(id: number) => request<T>(`invitations/${id}/resend/`, 'POST', {}),
    revokeInvitation: <T>(id: number) => request<T>(`invitations/${id}/revoke/`, 'POST', {}),
    updateTeamMember: <T>(id: number, body: unknown) => request<T>(`team/${id}/`, 'PUT', body),
    reports: <T>() => request<T>('moderation/'),
    moderateReport: <T>(type: string, id: number, action: string) =>
      request<T>(`moderation/${encodeURIComponent(type)}/${id}/`, 'POST', { action }),
    acceptInvitation: <T>(token: string) =>
      request<T>('invitations/accept/', 'POST', { token }),
  };
}
