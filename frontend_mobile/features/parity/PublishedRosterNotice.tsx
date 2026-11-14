import React, { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button } from 'react-native-paper';
import { rosterV2 } from '@chemisttasker/shared-core';
import { InfoNote } from './ParityUI';

export function PublishedRosterNotice() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    setPending(false);
    void rosterV2.getWorkerRoster({}).then((response: any) => {
      if (active) setPending(Array.isArray(response?.shifts) && response.shifts.some((shift: any) => shift.period_id != null && shift.can_acknowledge && !shift.is_acknowledged));
    }).catch(() => {});
    return () => { active = false; };
  }, []));
  if (!pending) return null;
  return <>
    <InfoNote title="Roster acknowledgement needed">A published roster week is ready to review.</InfoNote>
    <Button accessibilityLabel="Review and acknowledge published roster" contentStyle={{ minHeight: 44 }} onPress={() => router.push('/attendance/published-roster' as any)}>Review and acknowledge</Button>
  </>;
}
