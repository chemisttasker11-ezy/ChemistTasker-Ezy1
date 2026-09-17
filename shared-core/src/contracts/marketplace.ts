import type { ApiPage, JsonValue } from './publicContent';

export interface MarketplaceBlocker {
  code: string;
  message?: string;
  detail?: string;
}

export interface MarketplacePharmacyOption {
  id: number;
  label: string;
  suburb: string;
  state: string;
}

export interface MarketplaceAccess {
  can_trade_personally: boolean;
  can_trade_for_pharmacy: boolean;
  role_code: string | null;
  role_label: string | null;
  blockers: MarketplaceBlocker[];
  eligible_pharmacies: MarketplacePharmacyOption[];
}

export interface MarketplaceCategory {
  id: number;
  slug: string;
  name: string;
  description: string;
  context: string;
  permitted_modes: string[];
  maximum_buyer_roles: string[];
  field_schema: Record<string, JsonValue>;
  policy_version: string;
}

export interface MarketplaceListingOptions extends MarketplaceAccess {
  role_guidance: string[];
  personal_categories: MarketplaceCategory[];
  pharmacy_categories: MarketplaceCategory[];
  ethical_entry_available: boolean;
  seller_policy_version: string;
  rules: {
    ordinary_pharmacy_assets_owner_only: boolean;
    medicine_private_only: boolean;
    admin_ordinary_asset_authority: boolean;
  };
}

export interface MarketplacePublicListing {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  category: MarketplaceCategory;
  condition: string;
  mode: string;
  item_amount: string;
  currency: string;
  seller_role_label: string;
  coarse_location: string;
  permitted_buyer_labels: string[];
  delivery_options: string[];
  postage_payer: string;
  postage_organiser: string;
  postage_quote_required: boolean;
  images: Array<{ derivative_url: string; alt: string }>;
  availability_status: string;
  published_at: string;
}

export interface MarketplaceDeliveryInput {
  method: 'PICKUP' | 'POSTAGE' | 'BOTH';
  postage_payer?: 'BUYER' | 'SELLER' | '';
  postage_organiser?: 'BUYER' | 'SELLER' | '';
  known_cost?: string | null;
  quote_required?: boolean;
}

export interface MarketplaceListingWrite {
  seller_context: 'PERSONAL' | 'PHARMACY';
  pharmacy?: number | null;
  category: number;
  mode: 'SELL' | 'FREE' | 'SWAP';
  title: string;
  description: string;
  attributes?: Record<string, JsonValue>;
  condition: string;
  quantity: number;
  unit: string;
  amount: string | number;
  desired_swap?: string;
  suburb: string;
  state: string;
  postcode?: string;
  private_pickup_details?: string;
  allowed_buyer_roles: string[];
  delivery: MarketplaceDeliveryInput;
  expected_version?: number;
}

export interface MarketplaceOwnedListing {
  id: string;
  slug: string;
  seller_context: 'PERSONAL' | 'PHARMACY';
  pharmacy: number | null;
  category: number;
  mode: 'SELL' | 'FREE' | 'SWAP';
  title: string;
  description: string;
  attributes: Record<string, JsonValue>;
  condition: string;
  quantity: number;
  unit: string;
  amount: string;
  desired_swap: string;
  suburb: string;
  state: string;
  postcode: string;
  private_pickup_details: string;
  publication_status: string;
  availability_status: string;
  version: number;
}

export interface MarketplaceDashboardListing {
  id: string;
  slug: string;
  title: string;
  seller_context: string;
  category: { slug: string; name: string };
  pharmacy: { id: number; label: string } | null;
  publication_status: string;
  availability_status: string;
  version: number;
  current_circle: string | null;
  maximum_circle: string | null;
  allowed_buyer_roles: string[];
  delivery: MarketplaceDeliveryInput | null;
  images: Array<{ id: number; status: string; position: number }>;
  escalation_steps: Array<{ id: number; target_circle: string; due_at: string; status: string }>;
  updated_at: string;
}

export interface MarketplaceMessage {
  id: number;
  author_label: string;
  body: string;
  created_at: string;
}

export interface MarketplaceExchange {
  id: string;
  listing: string;
  listing_title: string;
  buying_pharmacy: number | null;
  proposed_terms: Record<string, JsonValue>;
  agreed_terms: Record<string, JsonValue>;
  quantity: number;
  state: string;
  version: number;
  seller_confirmed: boolean;
  buyer_confirmed: boolean;
  created_at: string;
  updated_at: string;
  messages: MarketplaceMessage[];
  allowed_actions: string[];
}

export interface MarketplaceStateResult {
  state: string;
  version: number;
}

export type MarketplaceListingPage = ApiPage<MarketplacePublicListing>;
