import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { MembershipDTO } from '@chemisttasker/shared-core';
import { ContentState } from '@/components/ui';
import { fetchMembershipsForPharmacy, isLocumMembership } from './membershipApi';
import StaffManager from './StaffManager';
import LocumManager from './LocumManager';

type Props = { pharmacyId?: string | string[]; kind: 'staff' | 'locum' };

/**
 * One scope-safe pharmacy members route shared by Owner and Organization.
 * A pending response for pharmacy A may never render on pharmacy B.
 */
export default function PharmacyMembersRoute({ pharmacyId, kind }: Props) {
  const id = typeof pharmacyId === 'string' ? pharmacyId : pharmacyId?.[0] ?? '';
  const generation = useRef(0);
  const [rows, setRows] = useState<MembershipDTO[]>([]);
  const [loadedId, setLoadedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const request = ++generation.current;
    if (!id) {
      setRows([]);
      setLoadedId('');
      setError('Select a pharmacy to manage its team.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await fetchMembershipsForPharmacy(id);
      if (generation.current !== request) return;
      setRows(Array.isArray(result) ? result : []);
      setLoadedId(id);
    } catch {
      if (generation.current !== request) return;
      setError('Could not load pharmacy memberships. Please try again.');
      setRows([]);
      setLoadedId(id);
    } finally {
      if (generation.current === request) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // Clear old tenant data synchronously when a route selects another pharmacy.
    setRows([]);
    setLoadedId('');
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  if (!id) {
    return <ContentState kind="empty" title="Choose a pharmacy" description="Select the pharmacy whose team you want to manage." />;
  }
  if (loadedId !== id || loading) {
    return <ContentState kind="loading" title={kind === 'locum' ? 'Loading locums' : 'Loading staff'} />;
  }
  if (error) {
    return <ContentState kind="error" title="Unable to load team" description={error} actionLabel="Retry" onAction={() => void load()} />;
  }
  const matching = rows.filter((membership) => isLocumMembership(membership) === (kind === 'locum'));
  return (
    <View style={{ flex: 1 }}>
      {kind === 'locum' ? (
        <LocumManager pharmacyId={id} memberships={matching} onMembershipsChanged={load} loading={loading} />
      ) : (
        <StaffManager pharmacyId={id} memberships={matching} onMembershipsChanged={load} loading={loading} category="staff" />
      )}
    </View>
  );
}
