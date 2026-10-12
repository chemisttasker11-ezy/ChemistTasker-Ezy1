import { useState } from 'react';
import type { Shift } from '@chemisttasker/shared-core';
import ShiftList from './ShiftList';

const ROLE_LABELS: Record<string, string> = {
  PHARMACIST: 'Pharmacist', INTERN: 'Intern Pharmacist', TECHNICIAN: 'Dispensary Technician',
  ASSISTANT: 'Assistant', STUDENT: 'Pharmacy Student', EXPLORER: 'Explorer',
};
const noop = () => undefined;
const none = new Set<number>();

/** The job board card for an unsaved shift: same component and layout as the board, with every action switched off. */
export default function ShiftBoardPreview({ shift }: { shift: Shift }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const pharmacy = (shift.pharmacyDetail ?? {}) as any;
  // The board reads a few server-computed display fields; fill them from the draft.
  const draft = {
    ...shift,
    roleLabel: ROLE_LABELS[String(shift.roleNeeded)] ?? shift.roleNeeded,
    uiLocationCity: pharmacy.suburb ?? '',
    uiLocationState: pharmacy.state ?? '',
    uiAddressLine: pharmacy.streetAddress ?? '',
  } as Shift;

  return (
    <div aria-label="Job board preview">
      <ShiftList
        processedShifts={[draft]}
        clearAllFilters={noop}
        hideCounterOffer
        hideSaveToggle
        disableSlotActions
        handleApplyAll={noop}
        handleApplySlot={noop}
        handleApplySlots={noop}
        handleRejectShift={noop}
        handleRejectSlot={noop}
        handleRejectSlots={noop}
        toggleExpandedCard={id => setExpanded(current => ({ ...current, [id]: !current[id] }))}
        expandedCards={expanded}
        selectedSlotIds={{}}
        toggleSlotSelection={noop}
        clearSelection={noop}
        appliedShiftIds={none}
        appliedSlotIds={none}
        rejectedShiftIds={none}
        rejectedSlotIds={none}
        savedShiftIds={none}
        savedFeatureEnabled={false}
        toggleSaveShift={noop}
        counterOffers={{}}
        onReviewOffers={noop}
        openCounterOffer={noop}
        actionDisabledGuard={() => true}
        pharmacyRatings={{}}
        showAllSlots
      />
    </div>
  );
}
