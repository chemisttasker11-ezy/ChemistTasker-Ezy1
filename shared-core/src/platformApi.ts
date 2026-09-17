import type { ApiClient, ApiClientConfig, ApiQuery, ApiRequestOptions } from './transport/client';
import { createApiClient } from './transport/client';
import { PLATFORM_ENDPOINTS } from './constants/platformEndpoints';

export interface DomainApi {
  request<T = unknown>(path: string, options?: ApiRequestOptions): Promise<T>;
}

const domain = (client: ApiClient): DomainApi => ({ request: client.request });

export function createChemistTaskerApi(config: ApiClientConfig) {
  const client = createApiClient(config);

  return {
    client,

    publicContent: {
      ...domain(client),
      listArticles: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.publicHub.articles, query, { auth: false }),
      getArticle: <T = unknown>(slug: string) => client.get<T>(PLATFORM_ENDPOINTS.publicHub.article(slug), undefined, { auth: false }),
      listArticleComments: <T = unknown>(slug: string, query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.publicHub.articleComments(slug), query, { auth: false }),
      createArticleComment: <T = unknown>(slug: string, body: Record<string, unknown>) => client.post<T>(PLATFORM_ENDPOINTS.publicHub.articleComments(slug), body),
      reactToArticle: <T = unknown>(slug: string, body: Record<string, unknown>) => client.post<T>(PLATFORM_ENDPOINTS.publicHub.articleReaction(slug), body),
      getMemberContext: <T = unknown>() => client.get<T>(PLATFORM_ENDPOINTS.publicHub.me),
    },

    marketplace: {
      ...domain(client),
      listCategories: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.marketplace.categories, query, { auth: false }),
      listListings: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.marketplace.listings, query, { auth: false }),
      getListing: <T = unknown>(id: string) => client.get<T>(PLATFORM_ENDPOINTS.marketplace.listing(id), undefined, { auth: false }),
      getAccess: <T = unknown>() => client.get<T>(PLATFORM_ENDPOINTS.marketplace.access),
      getListingOptions: <T = unknown>() => client.get<T>(PLATFORM_ENDPOINTS.marketplace.listingOptions),
      getMyListings: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.marketplace.myListings, query),
      getDashboard: <T = unknown>() => client.get<T>(PLATFORM_ENDPOINTS.marketplace.dashboard),
      getEligibility: <T = unknown>(id: string) => client.get<T>(PLATFORM_ENDPOINTS.marketplace.eligibility(id)),
      getAudience: <T = unknown>(id: string) => client.get<T>(PLATFORM_ENDPOINTS.marketplace.audience(id)),
      lookupCatalogue: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.marketplace.catalogueLookup, query),
    },

    ethicalMarketplace: {
      ...domain(client),
      getAccess: <T = unknown>() => client.get<T>(PLATFORM_ENDPOINTS.ethicalMarketplace.access),
      getMyListings: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.ethicalMarketplace.myListings, query),
      getPharmacyApproval: <T = unknown>(pharmacyId: number) => client.get<T>(PLATFORM_ENDPOINTS.ethicalMarketplace.pharmacyApproval(pharmacyId)),
      getPharmacyGrants: <T = unknown>(pharmacyId: number) => client.get<T>(PLATFORM_ENDPOINTS.ethicalMarketplace.pharmacyGrants(pharmacyId)),
      getCatalogue: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.ethicalMarketplace.catalogue, query),
      lookupCatalogue: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.ethicalMarketplace.catalogueLookup, query),
      getImports: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.ethicalMarketplace.imports, query),
      getLots: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.ethicalMarketplace.lots, query),
      listListings: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.ethicalMarketplace.listings, query),
      getListing: <T = unknown>(id: string) => client.get<T>(PLATFORM_ENDPOINTS.ethicalMarketplace.listing(id)),
      listTransfers: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.ethicalMarketplace.transfers, query),
      getTransfer: <T = unknown>(id: string) => client.get<T>(PLATFORM_ENDPOINTS.ethicalMarketplace.transfer(id)),
    },

    attendance: {
      ...domain(client),
      getWorkerStatus: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.attendance.workerStatus, query),
      clockIn: <T = unknown>(body?: Record<string, unknown>) => client.post<T>(PLATFORM_ENDPOINTS.attendance.workerClockIn, body ?? {}),
      breakStart: <T = unknown>(body?: Record<string, unknown>) => client.post<T>(PLATFORM_ENDPOINTS.attendance.workerBreakStart, body ?? {}),
      breakEnd: <T = unknown>(body?: Record<string, unknown>) => client.post<T>(PLATFORM_ENDPOINTS.attendance.workerBreakEnd, body ?? {}),
      clockOut: <T = unknown>(body?: Record<string, unknown>) => client.post<T>(PLATFORM_ENDPOINTS.attendance.workerClockOut, body ?? {}),
      getManagerPending: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.attendance.managerPending, query),
      getManagerTimeline: <T = unknown>(sessionId: number) => client.get<T>(PLATFORM_ENDPOINTS.attendance.managerTimeline(sessionId)),
    },

    rosterV2: {
      ...domain(client),
      getPeriod: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.rosterV2.period, query),
      validate: <T = unknown>(body: Record<string, unknown>) => client.post<T>(PLATFORM_ENDPOINTS.rosterV2.validate, body),
      publish: <T = unknown>(body: Record<string, unknown>) => client.post<T>(PLATFORM_ENDPOINTS.rosterV2.publish, body),
      unpublish: <T = unknown>(body: Record<string, unknown>) => client.post<T>(PLATFORM_ENDPOINTS.rosterV2.unpublish, body),
      archive: <T = unknown>(body: Record<string, unknown>) => client.post<T>(PLATFORM_ENDPOINTS.rosterV2.archive, body),
      getWorkerRoster: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.rosterV2.worker, query),
      acknowledge: <T = unknown>(body: Record<string, unknown>) => client.post<T>(PLATFORM_ENDPOINTS.rosterV2.acknowledge, body),
      getAcknowledgements: <T = unknown>(periodId: number) => client.get<T>(PLATFORM_ENDPOINTS.rosterV2.acknowledgements(periodId)),
      getTemplates: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.rosterV2.templates, query),
      getAudits: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.rosterV2.audits, query),
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
      getMe: <T = unknown>() => client.get<T>(PLATFORM_ENDPOINTS.content.me),
      getDocuments: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.content.documents, query),
      getInvitations: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.content.invitations, query),
      getTeam: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.content.team, query),
      getAudit: <T = unknown>(query?: ApiQuery) => client.get<T>(PLATFORM_ENDPOINTS.content.audit, query),
    },
  };
}

export type ChemistTaskerApi = ReturnType<typeof createChemistTaskerApi>;
