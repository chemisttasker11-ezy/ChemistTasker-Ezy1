/**
 * Shared-Core Package Entry Point
 * Exports everything from the package
 */

// Legacy application-wide configuration and existing API functions remain
// exported for backwards compatibility while clients migrate domain-by-domain.
import { configureApi as configureCoreApi } from './api';
import type { FinanceConfig } from './finance';
export function configureApi(config: FinanceConfig): void {
  configureCoreApi(config);
}
export * from './finance';
export * from './financePresentation';
export * from './api';

// Request-scoped/shared transport. Use createApiClient/createChemistTaskerApi
// for new cross-platform work (especially Next.js SSR).
export * from './transport/client';
export * from './platformApi';
export * from './contracts/publicContent';
export * from './contracts/marketplace';
export * from './contracts/ethicalMarketplace';
export * from './contracts/attendanceRoster';
export * from './contracts/workforce';

// Re-export all types
export * from './types';

// Re-export all domain helpers
export * from './domain';

// Transitional domain namespaces. These let new work use stable domain seams
// while legacy top-level exports remain backwards compatible.
export * as authDomain from './domains/auth';
export * as shiftsDomain from './domains/shifts';
export * as pharmaciesDomain from './domains/pharmacies';
export * as chatDomain from './domains/chat';

// Re-export storage helpers
export * from './storage';

// Re-export all constants. API_ENDPOINTS is the legacy catalogue; the new
// platform surfaces live in PLATFORM_ENDPOINTS until the catalogues are merged.
export * from './constants/endpoints';
export * from './constants/platformEndpoints';
export * from './constants/roles';
export * from './constants/capabilities';
export * from './constants/colors';
export * from './constants/personas';

// Shared cross-client authorization/persona policy.
export * from './policy/accessPolicy';
export * from './policy/marketplacePolicy';

// Re-export pricing utils
export * from './utils/pricing';

// Shared mobile/desktop offline kiosk protocol.
export * from './kioskProtocol';
