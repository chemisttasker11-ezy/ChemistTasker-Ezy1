import type {
  InvoiceAssignmentPreviewLine,
  InvoiceGenerationCategory,
  InvoiceGenerationCustomLine,
  InvoiceGenerationInput,
  InvoiceGenerationPreview,
} from '@chemisttasker/shared-core';

export type GeneratorMode = 'internal' | 'external';
export interface GeneratorLine extends InvoiceGenerationCustomLine {
  id: string;
  origin: 'assignment' | 'custom' | 'generated_super';
  locked: boolean;
  assignmentId?: number;
  shiftId?: number;
  shiftSlotId?: number;
  date?: string;
  start_time?: string;
  end_time?: string;
  total?: string;
}

export const GENERATION_CATEGORIES: ReadonlyArray<{ code: InvoiceGenerationCategory; label: string }> = [
  { code: 'ProfessionalServices', label: 'Professional services' },
  { code: 'Superannuation', label: 'Superannuation' },
  { code: 'Transportation', label: 'Transportation' },
  { code: 'Accommodation', label: 'Accommodation' },
  { code: 'Miscellaneous', label: 'Miscellaneous' },
];

function customCategoryDefaults(category: InvoiceGenerationCategory) {
  return {
    gst_applicable: !['Superannuation', 'Transportation', 'Accommodation'].includes(category),
    super_applicable: category !== 'Superannuation',
  };
}

export function customGenerationLine(id: string, mode: GeneratorMode): GeneratorLine {
  const category = mode === 'internal' ? 'Miscellaneous' : 'ProfessionalServices';
  return {
    id, origin: 'custom', locked: false, description: '', category_code: category,
    unit: 'Lump Sum', quantity: '1.00', unit_price: '0.00', discount: '0.00',
    ...customCategoryDefaults(category),
  };
}

export function acceptedGenerationLines(lines: InvoiceAssignmentPreviewLine[]): GeneratorLine[] {
  return lines.map(line => ({
    ...line, id: String(line.id), origin: 'assignment', locked: true,
    quantity: String(line.quantity), unit_price: String(line.unit_price), discount: String(line.discount), total: String(line.total),
    gst_applicable: line.gst_applicable === true, super_applicable: line.super_applicable === true,
  }));
}

type EditableField = 'description' | 'category_code' | 'unit' | 'quantity' | 'unit_price' | 'discount' | 'date' | 'start_time' | 'end_time';
export function editGenerationLine(line: GeneratorLine, field: EditableField, value: string): GeneratorLine {
  if (line.origin !== 'custom' || line.locked) return line;
  const updated = { ...line, [field]: value, total: undefined };
  if (field === 'category_code') {
    const category = GENERATION_CATEGORIES.find(choice => choice.code === value)?.code;
    if (!category) return line;
    updated.category_code = category;
    Object.assign(updated, customCategoryDefaults(category));
    if (['Transportation', 'Accommodation'].includes(category)) updated.quantity = '1.00';
  }
  if (['date', 'start_time', 'end_time'].includes(field)) {
    const start = new Date(`${updated.date}T${updated.start_time}`);
    const end = new Date(`${updated.date}T${updated.end_time}`);
    const hours = (end.getTime() - start.getTime()) / 3600000;
    updated.quantity = Number.isFinite(hours) && hours > 0 ? hours.toFixed(2) : '0.00';
  }
  return updated;
}

function submittedCustomLines(lines: GeneratorLine[], external: boolean) {
  return lines.filter(line => line.origin === 'custom' && (external || line.category_code !== 'ProfessionalServices'));
}

export function generationInput({ mode, pharmacy, shiftId, lines, gstRegistered, superRate }: {
  mode: GeneratorMode; pharmacy?: number; shiftId?: number; lines: GeneratorLine[]; gstRegistered: boolean; superRate: string;
}): InvoiceGenerationInput {
  const external = mode === 'external';
  return {
    external, ...(external ? {} : { pharmacy, shift_ids: shiftId ? [shiftId] : [] }),
    gst_registered: gstRegistered, super_rate_snapshot: superRate,
    line_items: submittedCustomLines(lines, external).map(line => ({
      description: line.description.trim() || (
        line.category_code === 'ProfessionalServices' && line.date && line.start_time && line.end_time
          ? `${line.date} ${line.start_time.slice(0, 5)}-${line.end_time.slice(0, 5)}` : ''
      ),
      category_code: line.category_code, unit: line.unit,
      // Preserve the user's decimal text, including invalid input for server validation.
      // No JS monetary calculation or Number(value) || 0 coercion belongs here.
      quantity: line.quantity, unit_price: line.unit_price, discount: line.discount,
      gst_applicable: line.gst_applicable, super_applicable: line.super_applicable,
    })),
  };
}

export function generationDisplayLines(lines: GeneratorLine[], mode: GeneratorMode, preview: InvoiceGenerationPreview | null): GeneratorLine[] {
  if (!preview) return lines.map(line => ({ ...line, total: undefined }));
  const customs = submittedCustomLines(lines, mode === 'external');
  return preview.line_items.map((line, index) => {
    if (line.origin === 'custom') {
      const draft = customs[line.custom_index ?? -1];
      if (draft) return { ...draft, total: line.total };
    }
    return {
      ...line, id: String(line.id ?? `${line.origin}-${line.assignmentId ?? index}`),
      origin: line.origin, locked: line.origin !== 'custom',
    };
  });
}
