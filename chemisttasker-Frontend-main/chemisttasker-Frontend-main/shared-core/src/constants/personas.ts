/**
 * Shared persona/workspace identifiers that both web and mobile can consume.
 * These are plain string unions (no React) to keep UI-agnostic.
 */
export type PersonaMode = 'staff' | 'admin';

// Extend if additional workspace scopes are introduced.
export type WorkspaceScope = 'internal' | 'platform';

export const PERSONA_MODES: PersonaMode[] = ['staff', 'admin'];
export const WORKSPACE_SCOPES: WorkspaceScope[] = ['internal', 'platform'];

// Web-legacy persona string map for consistency (same casing the clients use)
export const PERSONA_MODE_STAFF: PersonaMode = 'staff';
export const PERSONA_MODE_ADMIN: PersonaMode = 'admin';
