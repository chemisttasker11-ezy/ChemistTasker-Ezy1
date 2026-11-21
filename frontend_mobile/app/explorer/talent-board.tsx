import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import TalentBoard from '@/roles/shared/talent-board';

/** Direct-create handoff from Explorer Home while retaining the normal browse tab. */
export default function ExplorerTalentBoardRoute() {
  const { compose } = useLocalSearchParams<{ compose?: string }>();
  return <TalentBoard openPitchOnMount={compose === '1'} />;
}
