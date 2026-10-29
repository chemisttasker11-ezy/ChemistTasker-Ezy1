/** The established generator has its own preview/save policy, including external legacy rounding. */
export type InvoiceGenerationCategory = 'ProfessionalServices' | 'Superannuation' | 'Transportation' | 'Accommodation' | 'Miscellaneous';

export interface InvoiceGenerationCustomLine {
  description: string;
  category_code: InvoiceGenerationCategory;
  unit: string;
  quantity: string;
  unit_price: string;
  discount: string;
  gst_applicable: boolean;
  super_applicable: boolean;
}

export interface InvoiceAssignmentPreviewLine extends Omit<InvoiceGenerationCustomLine, 'quantity' | 'unit_price' | 'discount'> {
  id: string | number;
  assignmentId: number;
  shiftId: number;
  shiftSlotId: number;
  date: string;
  start_time: string;
  end_time: string;
  quantity: number | string;
  unit_price: number | string;
  discount: number | string;
  total: number | string;
  locked: boolean;
  was_modified?: boolean;
  rate_reason?: Record<string, unknown>;
}

export interface InvoiceGenerationInput {
  external: boolean;
  pharmacy?: number;
  shift_ids?: number[];
  gst_registered: boolean;
  super_rate_snapshot: string;
  /** Deliberate custom rows only. Accepted work and generated super remain server-owned. */
  line_items: InvoiceGenerationCustomLine[];
}

export interface InvoiceGenerationPreviewLine extends InvoiceGenerationCustomLine {
  origin: 'assignment' | 'custom' | 'generated_super';
  /** Original index in the submitted line_items, present for custom rows only. */
  custom_index?: number;
  total: string;
  id?: string | number;
  assignmentId?: number;
  shiftId?: number;
  shiftSlotId?: number;
  date?: string;
  start_time?: string;
  end_time?: string;
  locked?: boolean;
  is_manual?: boolean;
  was_modified?: boolean;
  rate_reason?: Record<string, unknown>;
}

export interface InvoiceGenerationPreview {
  line_items: InvoiceGenerationPreviewLine[];
  subtotal: string;
  gst_amount: string;
  super_amount: string;
  /** Worker payable; excludes the separate super contribution. */
  total: string;
}
