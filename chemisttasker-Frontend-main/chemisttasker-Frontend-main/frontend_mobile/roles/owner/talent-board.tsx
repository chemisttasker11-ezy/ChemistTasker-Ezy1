import React from 'react';
import TalentBoard from '@/roles/shared/talent-board';

export default function OwnerTalentBoardScreen() {
  return (
    <TalentBoard
      postShiftRoute="/owner/post-shift"
      canRequestBookingOverride
      hidePitchButton
    />
  );
}
