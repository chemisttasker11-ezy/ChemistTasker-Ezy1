import React, { memo } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import { BedDouble, Landmark, Plane, ReceiptText, Wallet } from 'lucide-react-native';
import { showPublishedShiftRates, type Shift } from '@chemisttasker/shared-core';
import { Pill } from '@/components/ui';
import { space } from '@/constants/tokens';

/** How the worker is paid, in web's words (TFN work goes to payroll, ABN work to invoicing); null when unknown. */
export function paymentLine(shift: Pick<Shift, 'paymentPreference' | 'employmentType'>): string | null {
  // Same fallback as the web and mobile boards: locums invoice on an ABN, employees are on payroll.
  const kind = String(shift.paymentPreference || (shift.employmentType === 'LOCUM' ? 'ABN' : shift.employmentType ? 'TFN' : '')).toUpperCase();
  if (kind === 'ABN') return 'Paid by invoice (ABN)';
  if (kind === 'TFN') return 'Paid through payroll (TFN)';
  return null;
}

/** "+ 11.5% super" for casual and locum work; full and part time say "+ super" (it sits on the package). */
export function superLine(shift: Pick<Shift, 'superPercent' | 'employmentType'>): string | null {
  const percent = Number(shift.superPercent);
  if (!Number.isFinite(percent) || percent <= 0) return null;
  return ['FULL_TIME', 'PART_TIME'].includes(shift.employmentType ?? '') ? '+ super' : `+ ${percent}% super`;
}

export type ShiftTermsSummaryProps = { shift: Shift; style?: StyleProp<ViewStyle> };

/**
 * The money terms a worker checks before applying (teardown STEAL 12): super, travel, accommodation and how
 * they get paid. Super and payment follow the published-rates rule; renders nothing when no term is known.
 */
export const ShiftTermsSummary = memo(function ShiftTermsSummary({ shift, style }: ShiftTermsSummaryProps) {
  const published = showPublishedShiftRates(shift);
  const superText = published ? superLine(shift) : null;
  const payment = published ? paymentLine(shift) : null;
  if (!superText && !payment && !shift.hasTravel && !shift.hasAccommodation) return null;

  return (
    <View style={[styles.row, style]}>
      {superText ? <Pill label={superText} tone="cyan" icon={<Landmark />} /> : null}
      {shift.hasTravel ? <Pill label="Travel" tone="blue" icon={<Plane />} /> : null}
      {shift.hasAccommodation ? <Pill label="Accommodation" tone="blue" icon={<BedDouble />} /> : null}
      {payment ? (
        <Pill label={payment} outlined icon={payment.includes('ABN') ? <ReceiptText /> : <Wallet />} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs + 2 },
});
