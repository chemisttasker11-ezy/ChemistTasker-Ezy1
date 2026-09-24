import type { MarketplaceCategory, MarketplaceListingOptions } from '../contracts/marketplace';

export type MarketplaceSellerContext = 'PERSONAL' | 'PHARMACY';
export type MarketplaceMode = 'SELL' | 'FREE' | 'SWAP';
export type MarketplaceAudienceCircle = 'OWNED_CHAIN' | 'ORGANISATION' | 'PLATFORM';

export const MARKETPLACE_AUDIENCE_ORDER: MarketplaceAudienceCircle[] = [
  'OWNED_CHAIN',
  'ORGANISATION',
  'PLATFORM',
];

export function categoriesForSellerContext(
  options: MarketplaceListingOptions | null | undefined,
  context: MarketplaceSellerContext,
): MarketplaceCategory[] {
  if (!options) return [];
  return context === 'PHARMACY'
    ? options.pharmacy_categories ?? []
    : options.personal_categories ?? [];
}

export function permittedModesForCategory(
  category: MarketplaceCategory | null | undefined,
): MarketplaceMode[] {
  const modes = (category?.permitted_modes ?? [])
    .map((value) => String(value).toUpperCase())
    .filter((value): value is MarketplaceMode =>
      value === 'SELL' || value === 'FREE' || value === 'SWAP',
    );
  return modes.length ? modes : ['SELL'];
}

export function permittedBuyerRolesForCategory(
  category: MarketplaceCategory | null | undefined,
  context: MarketplaceSellerContext,
): string[] {
  if (context === 'PHARMACY') return ['OWNER'];
  return [...(category?.maximum_buyer_roles ?? [])];
}

export function clampMaximumAudience(
  value: string | null | undefined,
): MarketplaceAudienceCircle {
  const normalized = String(value || '').toUpperCase() as MarketplaceAudienceCircle;
  return MARKETPLACE_AUDIENCE_ORDER.includes(normalized) ? normalized : 'PLATFORM';
}

export function nextMarketplaceAudience(
  current: string | null | undefined,
  maximum: string | null | undefined,
): MarketplaceAudienceCircle | null {
  const currentValue = String(current || '').toUpperCase() as MarketplaceAudienceCircle;
  const maximumValue = clampMaximumAudience(maximum);
  const currentIndex = MARKETPLACE_AUDIENCE_ORDER.indexOf(currentValue);
  const maxIndex = MARKETPLACE_AUDIENCE_ORDER.indexOf(maximumValue);
  if (currentIndex < 0 || currentIndex >= maxIndex) return null;
  return MARKETPLACE_AUDIENCE_ORDER[currentIndex + 1] ?? null;
}
