import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Shift } from '@chemisttasker/shared-core';
import { colors, space, type } from '@/constants/tokens';
import ShiftList from './ShiftsBoard/components/ShiftList';

const noop = () => undefined;
const none = new Set<number>();
const text = (t: { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing: number }) =>
  ({ fontFamily: t.fontFamily, fontSize: t.fontSize, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing });

/** The real native board card, with actions disabled, for the exact submitted draft. */
export default function NativeShiftBoardPreview({ shift }: { shift: Shift }) {
  const [expandedCards, setExpanded] = useState<Record<number, boolean>>({});
  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Text style={s.title} accessibilityRole="header">Candidate board preview</Text>
        <Text style={s.subtitle}>How workers see this shift on the board, including hourly rates, dates, and money terms.</Text>
      </View>
      <ShiftList processedShifts={[shift]} clearAllFilters={noop} hideCounterOffer hideSaveToggle disableSlotActions
        handleApplyAll={noop} handleApplySlot={noop} handleApplySlots={noop} handleRejectShift={noop}
        handleRejectSlot={noop} handleRejectSlots={noop} toggleExpandedCard={id => setExpanded(previous => ({...previous,[id]:!previous[id]}))}
        expandedCards={expandedCards} selectedSlotIds={{}} toggleSlotSelection={noop} clearSelection={noop}
        appliedShiftIds={none} appliedSlotIds={none} rejectedShiftIds={none} rejectedSlotIds={none}
        savedShiftIds={none} savedFeatureEnabled={false} toggleSaveShift={noop} counterOffers={{}}
        onReviewOffers={noop} openCounterOffer={noop} actionDisabledGuard={() => true} pharmacyRatings={{}} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: space.sm },
  header: { gap: space.xxs },
  title: { ...text(type.titleMedium), color: colors.textPrimary },
  subtitle: { ...text(type.bodySmall), color: colors.textSecondary },
});
