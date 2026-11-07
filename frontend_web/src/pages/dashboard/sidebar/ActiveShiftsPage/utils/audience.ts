import type { LucideIcon } from 'lucide-react';
import { Building2, Heart, Network, Sparkles, Store } from 'lucide-react';
import { SHIFT_AUDIENCE_LEVELS, type EscalationLevelKey } from '@chemisttasker/shared-core';

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
const ICONS: Record<EscalationLevelKey, LucideIcon> = {
    FULL_PART_TIME: Building2,
    LOCUM_CASUAL: Heart,
    OWNER_CHAIN: Store,
    ORG_CHAIN: Network,
    PLATFORM: Sparkles,
};

export const AUDIENCE_LEVELS: AudienceLevel[] = SHIFT_AUDIENCE_LEVELS.map((level) => ({
    ...level,
    icon: ICONS[level.key],
}));

export const getAudienceLevel = (key: unknown): AudienceLevel | undefined =>
    AUDIENCE_LEVELS.find((level) => level.key === key);
