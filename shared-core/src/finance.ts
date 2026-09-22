/** Worker finance uses the same base URL, credentials and token provider as core API. */
export type FinanceTaxCode = 'GST' | 'GST_FREE' | 'INPUT_TAXED' | 'OUT_OF_SCOPE';
export type FinanceCategory = 'ProfessionalServices' | 'Superannuation' | 'Transportation' | 'Accommodation' | 'Miscellaneous';
export type FinanceUnit = string;
export type FinanceMoney = string;
export interface FinanceConfig {
  baseURL: string;
  getToken: () => string | null | undefined | Promise<string | null | undefined>;
  refreshToken?: () => string | null | undefined | Promise<string | null | undefined>;
  onAuthFailure?: () => void | Promise<void>;
  credentials?: RequestCredentials;
}
export interface FinanceCustomer {
  id: number; name: string; legal_name: string; abn: string; contact_name: string;
  email: string; phone: string; address: string; payment_terms_days: number;
  notes: string; active: boolean; abn_result?: Record<string, unknown>; abn_checked_at?: string | null;
}
export interface FinanceItem {
  id: number; code: string; name: string; category: FinanceCategory; unit: FinanceUnit;
  unit_price: FinanceMoney; tax_code: FinanceTaxCode; super_eligible: boolean; active: boolean;
}
export interface FinanceLine {
  item_id?: number | null; description?: string; quantity: string; unit_price: FinanceMoney;
  discount: string; tax_code?: FinanceTaxCode; super_eligible?: boolean; worked_on?: string | null;
  category_code?: FinanceCategory; unit?: FinanceUnit;
  locked?: boolean; source_assignment_id?: number | null; shift_id?: number | null;
}
export interface FinanceDraft {
  request_key: string; version?: number; customer_id: number; invoice_date: string; due_date: string;
  issuer_name: string; issuer_entity_type?: 'sole_trader' | 'company'; issuer_abn: string; issuer_address: string; gst_registered: boolean;
  price_mode: 'exclusive' | 'inclusive'; super_mode: 'none' | 'summary' | 'separate';
  super_rate: string; super_confirmed: boolean; bank_account_name: string; bsb: string; account_number: string;
  super_fund_name: string; super_usi: string; super_member_number: string; reference: string; notes: string;
  lines: FinanceLine[];
  source_assignment_ids?: number[];
  customer?: Pick<FinanceCustomer, 'name' | 'legal_name' | 'address' | 'abn' | 'email' | 'contact_name'>;
}
export interface FinanceCalculation {
  lines: (FinanceLine & { net: string; gst: string; gross: string })[];
  subtotal: string; gst: string; payable: string; sales_gross: string; super: string; automatic_super: string;
}
export interface FinanceInvoice {
  id: number; invoice_id: number; number: string; version: number; current_version?: number; is_current?: boolean; has_unsent_revision?: boolean; request_key: string;
  kind: 'invoice' | 'super_request'; source: 'external' | 'internal'; payload: FinanceDraft;
  calculation: FinanceCalculation; source_snapshot?: Record<string, unknown>;
  locked: boolean; editable?: boolean; voided: boolean; status: 'draft' | 'sent' | 'paid' | 'void';
  review_status?: 'NONE' | 'APPROVED_FOR_PAYMENT' | 'REVISION_REQUESTED';
  last_review_note?: string; last_reviewed_at?: string | null;
  delivery_status: string | null; paid: string; balance: string; super_document_id: number | null;
  payments: { id: number; date: string; amount: string; reference: string }[];
  revisions?: Array<{ version: number; invoice_status: string; review_status: string; created_at: string; calculation: FinanceCalculation }>;
  review_requests?: Array<{ id: number; requested_version: number; note: string; requested_by_name: string; created_at: string; resolved_at: string | null; resolved_by_version: number | null }>;
}
export interface FinanceInvoiceDefaults {
  issuer_name: string; issuer_abn: string; issuer_address: string; gst_registered: boolean;
  bank_account_name: string; bsb: string; account_number: string;
  super_fund_name: string; super_usi: string; super_member_number: string; super_rate: string;
}
export interface FinanceInternalSource {
  assignment_id: number; shift_id: number; slot_id: number; date: string; start_time: string; end_time: string;
  hours: string; rate: string;
  pharmacy: { id: number; name: string; abn: string; legal_name: string; email: string; address: string };
}
export interface FinanceExpense {
  id: number; request_key: string; version: number; supplier: string; description: string; category: string;
  incurred_on: string; paid_on: string | null; amount: string; gst_amount: string; tax_code: FinanceTaxCode;
  business_use_percent: string; gst_registered: boolean; evidence_confirmed: boolean; reimbursable: boolean;
  reference: string; notes: string; gst_credit: string;
  receipts: { id: number; filename: string; size: number; created_at: string }[];
}
export interface FinanceWorksheet {
  start: string; end: string; basis: 'cash' | 'accrual'; G1: string; '1A': string; '1B': string;
  estimated_gst_net: string; expenses_needing_evidence: number[]; excluded_legacy_invoice_count: number;
  lodgement_ready: false; warnings: string[];
}
export type FinanceCustomerInput = Omit<FinanceCustomer, 'id' | 'abn_result' | 'abn_checked_at'>;
export type FinanceItemInput = Omit<FinanceItem, 'id'>;
export type FinanceExpenseInput = Omit<FinanceExpense, 'id' | 'gst_credit' | 'receipts'>;
import { financeApi } from './api';

/**
 * Worker finance belongs to the established authenticated shared-core surface.
 * Keep the finance domain API and types stable, but delegate all network I/O
 * to api.ts so Vite/mobile use one authenticated request engine.
 */
export const finance = financeApi;

/**
 * Backwards-compatible no-op. configureApi() now configures the authenticated
 * core once; finance no longer owns independent transport state.
 */
export function configureFinanceApi(_value: FinanceConfig): void {
  // Intentionally empty.
}
