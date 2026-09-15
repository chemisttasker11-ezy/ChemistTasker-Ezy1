import React from 'react';
import TalentBoard from '@/roles/shared/talent-board';

export default function OrganizationTalentBoardScreen() {
  return (
    <TalentBoard
      postShiftRoute="/organization/post-shift"
      canRequestBookingOverride
      hidePitchButton
    />
  );
}
