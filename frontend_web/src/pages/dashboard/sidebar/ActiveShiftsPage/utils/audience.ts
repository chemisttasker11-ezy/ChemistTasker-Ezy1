import type { LucideIcon } from 'lucide-react';
import { Building2, Heart, Network, Sparkles, Store } from 'lucide-react';
import type { EscalationLevelKey } from '@chemisttasker/shared-core';

export type AudienceScope = 'internal' | 'platform';

export type AudienceLevel = {
    key: EscalationLevelKey;
    label: string;
    /** Who is reached at this level, written for the poster. */
    reach: string;
    scope: AudienceScope;
    icon: LucideIcon;
    requiresOrganization?: boolean;
};

/** Escalation order: the shift is offered to each audience in turn, internal first. */
export const AUDIENCE_LEVELS: AudienceLevel[] = [
    { key: 'FULL_PART_TIME', label: 'My Pharmacy', reach: 'your full-time and part-time team', scope: 'internal', icon: Building2 },
    { key: 'LOCUM_CASUAL', label: 'Favourites', reach: 'your favourite locums and casuals', scope: 'internal', icon: Heart },
    { key: 'OWNER_CHAIN', label: 'Chain', reach: 'staff across your other pharmacies', scope: 'internal', icon: Store },
    { key: 'ORG_CHAIN', label: 'Organization', reach: 'members of your organisation', scope: 'internal', icon: Network, requiresOrganization: true },
    { key: 'PLATFORM', label: 'ChemistTasker', reach: 'verified professionals across ChemistTasker', scope: 'platform', icon: Sparkles },
];

export const getAudienceLevel = (key: unknown): AudienceLevel | undefined =>
    AUDIENCE_LEVELS.find((level) => level.key === key);

/** "PART_TIME" -> "Part time"; leaves already-readable values alone. */
export const humanizeEnum = (value: unknown): string => {
    if (value == null) return '';
    const text = String(value).trim();
    if (!text) return '';
    if (!/^[A-Z0-9_]+$/.test(text)) return text;
    const words = text.toLowerCase().split('_').filter(Boolean).join(' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
};
