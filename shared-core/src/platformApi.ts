import type { ApiClient, ApiClientConfig, ApiQuery, ApiRequestOptions } from './transport/client';
import { createApiClient } from './transport/client';
import { PLATFORM_ENDPOINTS } from './constants/platformEndpoints';
import type {
  ApiPage,
  ContentAssignments,
  ContentAuditItem,
  ContentDocument,
  ContentInvitation,
  ContentMe,
  ContentModerationItem,
  ContentPayload,
  ContentTeamMember,
  DetailResponse,
  PublicArticle,
  PublicArticleComment,
  PublicArticleDetail,
  PublicHubComment,
  PublicHubPoll,
  PublicHubPost,
  PublicHubSummary,
} from './contracts/publicContent';
import type {
  MarketplaceAccess,
  MarketplaceCategory,
  MarketplaceDashboardListing,
  MarketplaceExchange,
  MarketplaceListingOptions,
  MarketplaceListingPage,
  MarketplaceListingWrite,
  MarketplaceMessage,
  MarketplaceOwnedListing,
  MarketplacePublicListing,
  MarketplaceStateResult,
} from './contracts/marketplace';
import type {
  EthicalAccess,
  EthicalApproval,
  EthicalGrant,
  EthicalImportResult,
  EthicalListing,
  EthicalListingWrite,
  EthicalMessage,
  EthicalProduct,
  EthicalStockLot,
  EthicalStockLotWrite,
  EthicalTransfer,
} from './contracts/ethicalMarketplace';

export interface DomainApi {
  request<T = unknown>(path: string, options?: ApiRequestOptions): Promise<T>;
}

const domain = (client: ApiClient): DomainApi => ({ request: client.request });

export function createChemistTaskerApi(config: ApiClientConfig) {
  const client = createApiClient(config);

  return {
    client,

    account: {
      ...domain(client),
      getCurrentUser: <T = unknown>() => client.get<T>(PLATFORM_ENDPOINTS.account.currentUser),
    },

    publicContent: {
      ...domain(client),
      listHubs: () => client.get<PublicHubSummary[]>(PLATFORM_ENDPOINTS.publicHub.community, undefined, { auth: false }),
      listCommunityPosts: (hub: string, query?: ApiQuery) => client.get<ApiPage<PublicHubPost>>(PLATFORM_ENDPOINTS.publicHub.communityPosts(hub), query, { auth: false }),
      listCommunityPolls: (hub: string, query?: ApiQuery) => client.get<ApiPage<PublicHubPoll>>(PLATFORM_ENDPOINTS.publicHub.communityPolls(hub), query, { auth: false }),
      getPost: (id: number) => client.get<PublicHubPost>(PLATFORM_ENDPOINTS.publicHub.post(id), undefined, { auth: false }),
      listPostComments: (id: number, query?: ApiQuery) => client.get<ApiPage<PublicHubComment>>(PLATFORM_ENDPOINTS.publicHub.postComments(id), query, { auth: false }),
      reportPost: (id: number, body: { reason: string; comment_id?: number }) => client.post<DetailResponse>(PLATFORM_ENDPOINTS.publicHub.postReport(id), body),
      listArticles: (query?: ApiQuery) => client.get<ApiPage<PublicArticle>>(PLATFORM_ENDPOINTS.publicHub.articles, query, { auth: false }),
      getArticle: (slug: string) => client.get<PublicArticleDetail>(PLATFORM_ENDPOINTS.publicHub.article(slug), undefined, { auth: false }),
      listArticleComments: (slug: string, query?: ApiQuery) => client.get<ApiPage<PublicArticleComment>>(PLATFORM_ENDPOINTS.publicHub.articleComments(slug), query, { auth: false }),
      createArticleComment: (slug: string, body: { body: string; parent?: number | null }) => client.post<PublicArticleComment>(PLATFORM_ENDPOINTS.publicHub.articleComments(slug), body),
      deleteArticleComment: (id: number) => client.delete<void>(PLATFORM_ENDPOINTS.publicHub.comment(id)),
      reactToArticle: (slug: string, body: { kind: string }) => client.post<PublicArticle>(PLATFORM_ENDPOINTS.publicHub.articleReaction(slug), body),
      reactToArticleComment: (id: number, body: { kind: string }) => client.post<PublicArticleComment>(PLATFORM_ENDPOINTS.publicHub.commentReaction(id), body),
      reportArticleComment: (id: number, body: { reason: string }) => client.post<DetailResponse>(PLATFORM_ENDPOINTS.publicHub.commentReport(id), body),
      getMemberContext: <T = unknown>() => client.get<T>(PLATFORM_ENDPOINTS.publicHub.me),
    },

    marketplace: {
      ...domain(client),
      listCategories: (query?: ApiQuery) => client.get<MarketplaceCategory[]>(PLATFORM_ENDPOINTS.marketplace.categories, query, { auth: false }),
      listListings: (query?: ApiQuery) => client.get<MarketplaceListingPage>(PLATFORM_ENDPOINTS.marketplace.listings, query, { auth: false }),
      getListing: (id: string) => client.get<MarketplacePublicListing>(PLATFORM_ENDPOINTS.marketplace.listing(id), undefined, { auth: false }),
      getAccess: () => client.get<MarketplaceAccess>(PLATFORM_ENDPOINTS.marketplace.access),
      getListingOptions: () => client.get<MarketplaceListingOptions>(PLATFORM_ENDPOINTS.marketplace.listingOptions),
      getMyListings: (query?: ApiQuery) => client.get<MarketplaceOwnedListing[]>(PLATFORM_ENDPOINTS.marketplace.myListings, query),
      getDashboard: () => client.get<MarketplaceDashboardListing[]>(PLATFORM_ENDPOINTS.marketplace.dashboard),
      getEligibility: (id: string, query?: ApiQuery) => client.get<{ can_enquire: boolean; can_manage: boolean; blocker: unknown }>(PLATFORM_ENDPOINTS.marketplace.eligibility(id), query),
      createListing: (body: MarketplaceListingWrite) => client.post<MarketplaceOwnedListing>(PLATFORM_ENDPOINTS.marketplace.listings, body),
      updateListing: (id: string, body: Partial<MarketplaceListingWrite> & { expected_version: number }) => client.patch<MarketplaceOwnedListing>(PLATFORM_ENDPOINTS.marketplace.listing(id), body),
      actOnListing: (id: string, action: 'submit' | 'withdraw', expectedVersion: number) => client.post<{ publication_status: string; availability_status: string; version: number }>(PLATFORM_ENDPOINTS.marketplace.listingAction(id, action), { expected_version: expectedVersion }),
      updateAudience: (id: string, body: { expected_version: number; current_circle: string; maximum_circle?: string; schedule?: Array<{ target_circle: string; due_at: string }> }) => client.post<{ current_circle: string; maximum_circle: string; version: number }>(PLATFORM_ENDPOINTS.marketplace.audience(id), body),
      uploadImage: (id: string, body: FormData) => client.post<{ id: number; moderation_status: string }>(PLATFORM_ENDPOINTS.marketplace.images(id), body),
      deleteImage: (id: number) => client.delete<void>(PLATFORM_ENDPOINTS.marketplace.image(id)),
      createEnquiry: (id: string, body: { buying_pharmacy?: number | null; client_request_id: string; terms?: Record<string, unknown>; message?: string }) => client.post<{ id: string; state: string; version: number }>(PLATFORM_ENDPOINTS.marketplace.enquiries(id), body),
      createInternalTransfer: (id: string, body: { destination_pharmacy: number; transport_terms?: Record<string, unknown> }) => client.post<{ id: number; state: string; version: number }>(PLATFORM_ENDPOINTS.marketplace.internalTransfers(id), body),
      actOnInternalTransfer: (id: number, action: 'authorise' | 'dispatch' | 'receive' | 'cancel', expectedVersion: number) => client.post<MarketplaceStateResult>(PLATFORM_ENDPOINTS.marketplace.internalTransferAction(id, action), { expected_version: expectedVersion }),
      listExchanges: () => client.get<MarketplaceExchange[]>(PLATFORM_ENDPOINTS.marketplace.exchanges),
      getExchange: (id: string) => client.get<MarketplaceExchange>(PLATFORM_ENDPOINTS.marketplace.exchange(id)),
      listExchangeMessages: (id: string) => client.get<MarketplaceMessage[]>(PLATFORM_ENDPOINTS.marketplace.exchangeMessages(id)),
      sendExchangeMessage: (id: string, body: string) => client.post<MarketplaceMessage>(PLATFORM_ENDPOINTS.marketplace.exchangeMessages(id), { body }),
      actOnExchange: (id: string, action: string, body: Record<string, unknown>) => client.post<MarketplaceStateResult>(PLATFORM_ENDPOINTS.marketplace.exchangeAction(id, action), body),
      saveListing: (id: string) => client.post<void>(PLATFORM_ENDPOINTS.marketplace.saved(id), {}),
      unsaveListing: (id: string) => client.delete<void>(PLATFORM_ENDPOINTS.marketplace.saved(id)),
      reportListing: (listing: string, reason: string) => client.post<{ reference: string }>(PLATFORM_ENDPOINTS.marketplace.reports, { listing, reason }, { auth: false }),
      lookupCatalogue: (query?: ApiQuery) => client.get<{ results: Array<{ id: number; name: string; brand: string; description: string; category: { slug: string; name: string } }> }>(PLATFORM_ENDPOINTS.marketplace.catalogueLookup, query),
    },

    ethicalMarketplace: {
      ...domain(client),
      getAccess: () => client.get<EthicalAccess>(PLATFORM_ENDPOINTS.ethicalMarketplace.access),
      getMyListings: (query: ApiQuery) => client.get<{ results: EthicalListing[]; pharmacy: number; is_owner: boolean }>(PLATFORM_ENDPOINTS.ethicalMarketplace.myListings, query),
      getPharmacyApproval: (pharmacyId: number) => client.get<EthicalApproval>(PLATFORM_ENDPOINTS.ethicalMarketplace.pharmacyApproval(pharmacyId)),
      submitPharmacyApproval: (pharmacyId: number, body: FormData | { pbs_approval_number?: string; business_phone: string; business_email: string }) => client.post<EthicalApproval>(PLATFORM_ENDPOINTS.ethicalMarketplace.pharmacyApproval(pharmacyId), body),
      getPharmacyGrants: (pharmacyId: number) => client.get<{ grants: EthicalGrant[]; eligible_admins: Array<{ assignment_id: number; user_id: number; label: string; staff_role: string }> }>(PLATFORM_ENDPOINTS.ethicalMarketplace.pharmacyGrants(pharmacyId)),
      createPharmacyGrant: (pharmacyId: number, body: { user: number; pharmacy_admin: number; allowed_actions: string[]; valid_from: string; valid_until?: string | null }) => client.post<EthicalGrant>(PLATFORM_ENDPOINTS.ethicalMarketplace.pharmacyGrants(pharmacyId), body),
      revokePharmacyGrant: (pharmacyId: number, grantId: number, reason: string) => client.post<{ status: 'REVOKED' }>(PLATFORM_ENDPOINTS.ethicalMarketplace.revokeGrant(pharmacyId, grantId), { reason }),
      getCatalogue: (query: ApiQuery) => client.get<{ results: EthicalProduct[] }>(PLATFORM_ENDPOINTS.ethicalMarketplace.catalogue, query),
      lookupCatalogue: (query: ApiQuery) => client.get<EthicalProduct | Record<string, never>>(PLATFORM_ENDPOINTS.ethicalMarketplace.catalogueLookup, query),
      uploadImport: (body: FormData) => client.post<EthicalImportResult>(PLATFORM_ENDPOINTS.ethicalMarketplace.imports, body),
      getImport: (id: number) => client.get<EthicalImportResult>(PLATFORM_ENDPOINTS.ethicalMarketplace.import(id)),
      commitImport: (id: number) => client.post<EthicalImportResult>(PLATFORM_ENDPOINTS.ethicalMarketplace.importCommit(id), {}),
      getLots: (query: ApiQuery) => client.get<EthicalStockLot[]>(PLATFORM_ENDPOINTS.ethicalMarketplace.lots, query),
      createLot: (body: EthicalStockLotWrite) => client.post<EthicalStockLot>(PLATFORM_ENDPOINTS.ethicalMarketplace.lots, body),
      updateLot: (id: number, body: Partial<EthicalStockLotWrite> & { expected_version: number }) => client.patch<EthicalStockLot>(PLATFORM_ENDPOINTS.ethicalMarketplace.lot(id), body),
      reconcileLot: (id: number, body: { expected_version: number; on_hand_quantity: number }) => client.post<EthicalStockLot>(PLATFORM_ENDPOINTS.ethicalMarketplace.lotReconcile(id), body),
      listListings: (query: ApiQuery) => client.get<{ results: EthicalListing[]; context_pharmacy: number }>(PLATFORM_ENDPOINTS.ethicalMarketplace.listings, query),
      getListing: (id: string) => client.get<EthicalListing>(PLATFORM_ENDPOINTS.ethicalMarketplace.listing(id)),
      createListing: (body: EthicalListingWrite) => client.post<EthicalListing>(PLATFORM_ENDPOINTS.ethicalMarketplace.listings, body),
      updateListing: (id: string, body: Partial<EthicalListingWrite> & { expected_version: number }) => client.patch<EthicalListing>(PLATFORM_ENDPOINTS.ethicalMarketplace.listing(id), body),
      actOnListing: (id: string, action: 'publish' | 'withdraw' | 'escalation', body: { expected_version: number; target_circle?: string; schedule?: Array<{ target_circle: string; due_at: string }> }) => client.post<{ status: string; current_circle: string; version: number }>(PLATFORM_ENDPOINTS.ethicalMarketplace.listingAction(id, action), body),
      requestTransfer: (id: string, body: { destination_pharmacy: number; client_request_id: string; lines: Array<{ lot: number; quantity: number }>; terms?: Record<string, unknown> }) => client.post<EthicalTransfer>(PLATFORM_ENDPOINTS.ethicalMarketplace.listingRequests(id), body),
      listTransfers: (query: ApiQuery) => client.get<EthicalTransfer[]>(PLATFORM_ENDPOINTS.ethicalMarketplace.transfers, query),
      getTransfer: (id: string) => client.get<EthicalTransfer>(PLATFORM_ENDPOINTS.ethicalMarketplace.transfer(id)),
      listTransferMessages: (id: string) => client.get<EthicalMessage[]>(PLATFORM_ENDPOINTS.ethicalMarketplace.transferMessages(id)),
      sendTransferMessage: (id: string, body: string) => client.post<EthicalMessage>(PLATFORM_ENDPOINTS.ethicalMarketplace.transferMessages(id), { body }),
      uploadTransferDocument: (id: string, body: FormData) => client.post<{ id: number; document_type: string }>(PLATFORM_ENDPOINTS.ethicalMarketplace.transferDocuments(id), body),
      transferDocumentPath: (id: string, documentId: number) => PLATFORM_ENDPOINTS.ethicalMarketplace.transferDocument(id, documentId),
      actOnTransfer: (id: string, action: 'agree' | 'authorise' | 'dispatch' | 'receive' | 'cancel', body: { expected_version: number; client_request_id: string }) => client.post<{ state: string; version: number }>(PLATFORM_ENDPOINTS.ethicalMarketplace.transferAction(id, action), body),
    },

    /**
     * Kiosk endpoint contracts are shared, but native kiosk calls must continue
     * to use the restricted device-token transport in Tauri/Rust. Do not attach
     * a user bearer token to NATIVE_OFFLINE enrollment/sync calls.
     */
    kiosk: {
      endpoints: PLATFORM_ENDPOINTS.kiosk,
    },

    contentManagement: {
      ...domain(client),
      getMe: () => client.get<ContentMe>(PLATFORM_ENDPOINTS.content.me),
      getDocuments: (query?: ApiQuery) => client.get<ApiPage<ContentDocument>>(PLATFORM_ENDPOINTS.content.documents, query),
      createDocument: (body: { area: string; payload: ContentPayload }) => client.post<ContentDocument>(PLATFORM_ENDPOINTS.content.documents, body),
      getDocument: (id: number) => client.get<ContentDocument>(PLATFORM_ENDPOINTS.content.document(id)),
      updateDocument: (id: number, body: { payload: ContentPayload; version: number }) => client.patch<ContentDocument>(PLATFORM_ENDPOINTS.content.document(id), body),
      actOnDocument: (id: number, action: 'submit' | 'return' | 'publish' | 'archive', body: { version: number; publish_at?: string | null; feedback?: string }) => client.post<ContentDocument>(PLATFORM_ENDPOINTS.content.documentAction(id, action), body),
      getInvitations: (query?: ApiQuery) => client.get<ApiPage<ContentInvitation>>(PLATFORM_ENDPOINTS.content.invitations, query),
      createInvitation: (body: { email: string; assignments: ContentAssignments }) => client.post<{ id: number; detail: string }>(PLATFORM_ENDPOINTS.content.invitations, body),
      acceptInvitation: (token: string) => client.post<DetailResponse & Pick<ContentMe, 'administrator' | 'areas'>>(PLATFORM_ENDPOINTS.content.invitationAccept, { token }),
      actOnInvitation: (id: number, action: 'resend' | 'revoke') => client.post<DetailResponse>(PLATFORM_ENDPOINTS.content.invitationAction(id, action), {}),
      getTeam: (query?: ApiQuery) => client.get<ApiPage<ContentTeamMember>>(PLATFORM_ENDPOINTS.content.team, query),
      updateTeamMember: (id: number, assignments: ContentAssignments) => client.put<DetailResponse>(PLATFORM_ENDPOINTS.content.teamMember(id), { assignments }),
      uploadMedia: (body: FormData) => client.post<{ url: string }>(PLATFORM_ENDPOINTS.content.media, body),
      getModeration: () => client.get<ContentModerationItem[]>(PLATFORM_ENDPOINTS.content.moderation),
      moderate: (kind: 'article' | 'hub', id: number, action: 'resolve' | 'hide') => client.post<DetailResponse>(PLATFORM_ENDPOINTS.content.moderationItem(kind, id), { action }),
      getAudit: (query?: ApiQuery) => client.get<ApiPage<ContentAuditItem>>(PLATFORM_ENDPOINTS.content.audit, query),
    },
  };
}

export type ChemistTaskerApi = ReturnType<typeof createChemistTaskerApi>;
