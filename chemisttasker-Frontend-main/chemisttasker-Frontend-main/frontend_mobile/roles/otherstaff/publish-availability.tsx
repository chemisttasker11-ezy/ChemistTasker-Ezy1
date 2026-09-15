import React from 'react';
import TalentBoard from '@/roles/shared/talent-board';

export default function OtherStaffPublishAvailabilityScreen() {
  return <TalentBoard postShiftRoute="/owner/post-shift" openPitchOnMount />;
}
