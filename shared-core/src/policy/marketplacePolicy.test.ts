import { describe, expect, it } from 'vitest';
import {
  categoriesForSellerContext,
  clampMaximumAudience,
  nextMarketplaceAudience,
  permittedBuyerRolesForCategory,
  permittedModesForCategory,
} from './marketplacePolicy';

const personal = {
  id: 1,
  slug: 'books',
  name: 'Books',
  description: '',
  context: 'PERSONAL',
  permitted_modes: ['SELL', 'FREE'],
  maximum_buyer_roles: ['PHARMACIST', 'INTERN'],
  field_schema: {},
  policy_version: '1',
};

const pharmacy = {
  id: 2,
  slug: 'fixtures',
  name: 'Fixtures',
  description: '',
  context: 'PHARMACY',
  permitted_modes: ['SELL', 'SWAP'],
  maximum_buyer_roles: ['OWNER'],
  field_schema: {},
  policy_version: '1',
};

describe('marketplace policy', () => {
  const options = {
    can_trade_personally: true,
    can_trade_for_pharmacy: true,
    role_code: 'OWNER',
    role_label: 'Owner',
    blockers: [],
    eligible_pharmacies: [],
    role_guidance: [],
    personal_categories: [personal],
    pharmacy_categories: [pharmacy],
    ethical_entry_available: true,
    seller_policy_version: '1',
    rules: {
      ordinary_pharmacy_assets_owner_only: true,
      medicine_private_only: true,
      admin_ordinary_asset_authority: false,
    },
  };

  it('keeps seller category contexts separate', () => {
    expect(categoriesForSellerContext(options, 'PERSONAL')).toEqual([personal]);
    expect(categoriesForSellerContext(options, 'PHARMACY')).toEqual([pharmacy]);
  });

  it('uses category permitted modes', () => {
    expect(permittedModesForCategory(personal)).toEqual(['SELL', 'FREE']);
    expect(permittedModesForCategory(pharmacy)).toEqual(['SELL', 'SWAP']);
  });

  it('uses category buyer policy and owner-only pharmacy policy', () => {
    expect(permittedBuyerRolesForCategory(personal, 'PERSONAL')).toEqual(['PHARMACIST', 'INTERN']);
    expect(permittedBuyerRolesForCategory(pharmacy, 'PHARMACY')).toEqual(['OWNER']);
  });

  it('progresses pharmacy audience in the canonical order only', () => {
    expect(nextMarketplaceAudience('OWNED_CHAIN', 'PLATFORM')).toBe('ORGANISATION');
    expect(nextMarketplaceAudience('ORGANISATION', 'PLATFORM')).toBe('PLATFORM');
    expect(nextMarketplaceAudience('PLATFORM', 'PLATFORM')).toBeNull();
  });

  it('clamps unknown maximum audience to platform', () => {
    expect(clampMaximumAudience('unexpected')).toBe('PLATFORM');
  });
});
