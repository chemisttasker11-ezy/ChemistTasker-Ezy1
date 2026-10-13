import { useState } from 'react';
import type { Shift } from '@chemisttasker/shared-core';
import ShiftList from './ShiftsBoard/components/ShiftList';

const noop = () => undefined;
const none = new Set<number>();
/** The real native board card, with actions disabled, for the exact submitted draft. */
export default function NativeShiftBoardPreview({ shift }: { shift: Shift }) {
  const [expandedCards, setExpanded] = useState<Record<number, boolean>>({});
  return <ShiftList processedShifts={[shift]} clearAllFilters={noop} hideCounterOffer hideSaveToggle disableSlotActions
    handleApplyAll={noop} handleApplySlot={noop} handleApplySlots={noop} handleRejectShift={noop}
    handleRejectSlot={noop} handleRejectSlots={noop} toggleExpandedCard={id => setExpanded(previous => ({...previous,[id]:!previous[id]}))}
    expandedCards={expandedCards} selectedSlotIds={{}} toggleSlotSelection={noop} clearSelection={noop}
    appliedShiftIds={none} appliedSlotIds={none} rejectedShiftIds={none} rejectedSlotIds={none}
    savedShiftIds={none} savedFeatureEnabled={false} toggleSaveShift={noop} counterOffers={{}}
    onReviewOffers={noop} openCounterOffer={noop} actionDisabledGuard={() => true} pharmacyRatings={{}} />;
}
