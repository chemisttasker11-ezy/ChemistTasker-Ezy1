/** Raw invoicing.InvoiceSerializer payload. DRF decimal values serialize as strings. */
export interface InvoiceLineItemApi {
    id: number;
    description: string;
    category_code: string;
    unit: string;
    quantity: string | number;
    unit_price: string | number;
    discount: string | number;
    total: string | number;
    gst_applicable: boolean;
    super_applicable: boolean;
    is_manual?: boolean;
    was_modified?: boolean;
    shift?: number | null;
    source_assignment?: number | null;
}
export interface InvoiceDetailApi {
    id: number;
    user: number;
    external: boolean;
    pharmacy: number | null;
    issuer_first_name: string;
    issuer_last_name: string;
    issuer_abn: string;
    issuer_email: string;
    pharmacy_name_snapshot: string;
    pharmacy_address_snapshot: string;
    pharmacy_abn_snapshot: string;
    custom_bill_to_name: string;
    custom_bill_to_address: string;
    bill_to_first_name: string;
    bill_to_last_name: string;
    bill_to_abn: string;
    bill_to_email: string;
    cc_emails: string;
    gst_registered: boolean;
    super_rate_snapshot: string | number;
    bank_account_name: string;
    bsb: string;
    account_number: string;
    super_fund_name: string;
    super_usi: string;
    super_member_number: string;
    invoice_date: string;
    due_date: string;
    subtotal: string | number;
    gst_amount: string | number;
    super_amount: string | number;
    total: string | number;
    source_snapshot: Record<string, unknown>;
    finance_record_id: number | null;
    status: string;
    created_at: string;
    line_items: InvoiceLineItemApi[];
}
