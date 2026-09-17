/**
 * Shared-Core Package Entry Point
 * Exports everything from the package
 */

// Legacy application-wide configuration and existing API functions remain
// exported for backwards compatibility while clients migrate domain-by-domain.
import { configureApi as configureCoreApi } from './api';
import { configureFinanceApi, type FinanceConfig } from './finance';
export function configureApi(config: FinanceConfig): void {
  configureCoreApi(config);
  configureFinanceApi(config);
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

// Re-export all types
export * from './types';

// Re-export all domain helpers
export * from './domain';

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

// Re-export pricing utils
export * from './utils/pricing';

// Shared mobile/desktop offline kiosk protocol.
export * from './kioskProtocol';
