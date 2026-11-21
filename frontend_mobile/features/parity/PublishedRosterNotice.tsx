import React, { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button } from 'react-native-paper';
import { rosterV2 } from '@chemisttasker/shared-core';
import { InfoNote } from './ParityUI';

export function isPendingPublishedRoster(shift: { period_id: number | null; can_acknowledge: boolean; is_acknowledged: boolean }) {
  return shift.period_id != null && shift.can_acknowledge && !shift.is_acknowledged;
}

export function hasPendingPublishedRoster(response: any) {
  return Array.isArray(response?.shifts) && response.shifts.some(isPendingPublishedRoster);
}

export function PublishedRosterNotice() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    void rosterV2.getWorkerRoster({}).then((response: any) => {
      if (active) setPending(hasPendingPublishedRoster(response));
    }).catch(() => {});
    return () => { active = false; };
  }, []));
  if (!pending) return null;
  return <>
    <InfoNote title="Roster acknowledgement needed">A published roster week at one of your pharmacies is ready to review.</InfoNote>
    <Button accessibilityLabel="Review and acknowledge published roster" contentStyle={{ minHeight: 44 }} onPress={() => router.push('/attendance/published-roster' as any)}>Review and acknowledge</Button>
  </>;
}
