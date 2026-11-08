import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

/** Legacy creation deep links always open the canonical validated Post Shift wizard. */
export default function CreateShiftScreen() {
  const { pharmacy_id } = useLocalSearchParams<{ pharmacy_id?: string | string[] }>();
  const pharmacyId = Array.isArray(pharmacy_id) ? pharmacy_id[0] : pharmacy_id;
  return <Redirect href={{
    pathname: '/owner/post-shift',
    params: pharmacyId ? { pharmacyId } : {},
  }} />;
}
