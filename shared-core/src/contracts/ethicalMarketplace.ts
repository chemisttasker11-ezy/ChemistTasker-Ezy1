import type { JsonValue } from './publicContent';
import type { MarketplaceBlocker, MarketplacePharmacyOption } from './marketplace';

export interface EthicalAccessContext {
  pharmacy: MarketplacePharmacyOption;
  admitted: boolean;
  action: string;
  pharmacy_id: number;
  is_owner: boolean;
  grant_actions: string[];
  blockers: MarketplaceBlocker[];
}

export interface EthicalAccess {
  contexts: EthicalAccessContext[];
  application_enabled: boolean;
  private_read_enabled: boolean;
}

export interface EthicalApproval {
  id?: number;
  pharmacy: number;
  pbs_approval_number?: string;
  business_phone?: string;
  business_email?: string;
  status: string;
  owner_confirmed_at?: string | null;
  checked_at?: string | null;
  due_at?: string | null;
  review_reason?: string;
  created_at?: string;
  updated_at?: string;
}

export interface EthicalGrant {
  id: number;
  pharmacy: number;
  user: number;
  pharmacy_admin: number;
  allowed_actions: string[];
  valid_from: string;
  valid_until: string | null;
  revoked_at: string | null;
  revocation_reason: string;
  created_at: string;
}

export interface EthicalProduct {
  id: number;
  name: string;
  strength: string;
  form: string;
  pack_size: string;
  schedule: string;
  flags: string[];
  identifiers: Array<{ kind: string; value: string }>;
}

export interface EthicalStockLot {
  id: number;
  pharmacy: number;
  product: number;
  product_detail: EthicalProduct;
  batch_number: string;
  expiry_date: string;
  intact_pack_unit: string;
  on_hand_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  storage_checks: Record<string, JsonValue>;
  source_reference: string;
  last_reconciled_at: string;
  status: string;
  version: number;
}

export interface EthicalStockLotWrite {
  pharmacy: number;
  product: number;
  batch_number: string;
  expiry_date: string;
  intact_pack_unit: string;
  on_hand_quantity: number;
  storage_checks: Record<string, JsonValue>;
  source_reference: string;
  last_reconciled_at: string;
  expected_version?: number;
}

export interface EthicalListingAllocation {
  id: number;
  lot: number;
  quantity: number;
  lot_detail: EthicalStockLot;
}

export interface EthicalListing {
  id: string;
  pharmacy: number;
  product: number;
  product_detail: EthicalProduct;
  mode: string;
  amount: string;
  current_circle: string;
  maximum_circle: string;
  scope_chain: number | null;
  status: string;
  version: number;
  published_at: string | null;
  lot_allocations: EthicalListingAllocation[];
  created_at: string;
  updated_at: string;
  can_owner_authorise?: boolean;
  escalation_steps?: Array<{ id: number; target_circle: string; due_at: string; status: string; reason: string }>;
}

export interface EthicalListingWrite {
  pharmacy: number;
  product: number;
  mode: string;
  amount: string | number;
  current_circle: string;
  maximum_circle: string;
  scope_chain?: number | null;
  lots?: Array<{ lot: number; quantity: number }>;
  expected_version?: number;
}

export interface EthicalTransferLine {
  id: number;
  lot: number;
  quantity: number;
  unit_amount: string;
}

export interface EthicalTransfer {
  id: string;
  listing: string;
  source_pharmacy: number;
  destination_pharmacy: number;
  mode: string;
  terms: Record<string, JsonValue>;
  legal_basis: string;
  state: string;
  version: number;
  dispatched_at: string | null;
  received_at: string | null;
  lines: EthicalTransferLine[];
  created_at: string;
  updated_at: string;
}

export interface EthicalMessage {
  id: number;
  body: string;
  created_at: string;
}

export interface EthicalImportResult {
  id: number;
  status: string;
  row_count?: number;
  accepted_count?: number;
  rejected_count?: number;
}
