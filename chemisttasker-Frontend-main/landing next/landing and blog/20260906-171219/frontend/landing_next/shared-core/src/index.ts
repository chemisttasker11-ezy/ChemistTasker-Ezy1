/**
 * Shared-Core Package Entry Point
 * Exports everything from the package
 */

// Re-export API configuration and all functions
export { configureApi } from './api';
export * from './api';

// Re-export all types
export * from './types';

// Re-export all domain helpers
export * from './domain';

// Re-export storage helpers
export * from './storage';

// Re-export all constants
export * from './constants/endpoints';
export * from './constants/roles';
export * from './constants/capabilities';
export * from './constants/colors';
export * from './constants/personas';

// Re-export pricing utils
export * from './utils/pricing';
