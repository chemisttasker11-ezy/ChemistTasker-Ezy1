import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Chip, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import {
  createAsyncScope, deleteRosterAssignmentService, deleteRosterShiftService,
  escalateRosterShiftService, fetchOwnerOpenShifts, fetchRosterOwnerAssignments,
  fetchWorkerShiftRequestsService, approveWorkerShiftRequestService,
  rejectWorkerShiftRequestService, type OpenShift, type RosterAssignment,
  type WorkerShiftRequest,
} from '@chemisttasker/shared-core';
import { useWorkspace } from '@/context/WorkspaceContext';
import { ContentState } from '@/components/ui';
import { ParityPage, Section, DataRow, EmptyState } from './ParityUI';
import { errorMessage, replaceUnderscore, startOfWeek } from './utils';

const visibilityChoices = ['LOCUM_CASUAL', 'OWNER_CHAIN', 'ORG_CHAIN', 'PLATFORM'] as const;
type Data = { assignments: RosterAssignment[]; open: OpenShift[]; requests: WorkerShiftRequest[] };
const blank: Data = { assignments: [], open: [], requests: [] };

export default function RosterLegacyOperations() {
  const { selectedPharmacyId, selectedPharmacyName } = useWorkspace();
  return <ScopedLegacyRoster key={String(selectedPharmacyId || '')} pharmacyId={selectedPharmacyId} pharmacyName={selectedPharmacyName} />;
}

function ScopedLegacyRoster({ pharmacyId, pharmacyName }: { pharmacyId: number | null; pharmacyName: string | null }) {
  const router = useRouter();
  const requestScope = useRef(createAsyncScope()).current;
  const [data, setData] = useState<Data>(blank);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedVisibility, setSelectedVisibility] = useState<(typeof visibilityChoices)[number]>('PLATFORM');

  const load = useCallback(async () => {
    const ticket = requestScope.begin('load');
    if (!pharmacyId) { setData(blank); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const startDate = startOfWeek();
      const endDate = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10);
      const [assignments, open, requests] = await ticket.run(() => Promise.all([
        fetchRosterOwnerAssignments({ pharmacyId, startDate, endDate }),
        fetchOwnerOpenShifts({ pharmacyId, startDate, endDate }),
        fetchWorkerShiftRequestsService({ pharmacyId, startDate, endDate }),
      ]));
      ticket.assertCurrent();
      // The backend enforces tenant permissions. Defensive filtering also prevents mixed-tenant display.
      const scopedAssignments = assignments.filter((row) => {
        const id = (row.shiftDetail as any)?.pharmacy ?? (row.shiftDetail as any)?.pharmacyId;
        return id == null || Number(id) === Number(pharmacyId);
      });
      setData({
        assignments: scopedAssignments,
        open: open.filter((row) => Number(row.pharmacy) === Number(pharmacyId)),
        requests: requests.filter((row) => row.pharmacy == null || Number(row.pharmacy) === Number(pharmacyId)),
      });
    } catch (e) {
      if (ticket.isCurrent()) setError(errorMessage(e, 'Could not refresh legacy roster actions.'));
    } finally {
      if (ticket.isCurrent()) setLoading(false);
    }
  }, [pharmacyId, requestScope]);

  useEffect(() => {
    requestScope.activate();
    void load();
    return () => requestScope.dispose();
  }, [requestScope, load]);

  const act = async (operation: () => Promise<unknown>, success: string) => {
    if (busy) return;
    const ticket = requestScope.begin('action');
    setBusy(true); setError('');
    try {
      await ticket.run(operation);
      setNotice(success);
      await load();
    } catch (e) {
      if (ticket.isCurrent()) setError(errorMessage(e, 'Unable to update this roster record.'));
    } finally {
      if (ticket.isCurrent()) setBusy(false);
    }
  };
  const confirmDelete = (title: string, explanation: string, action: () => Promise<unknown>) => {
    Alert.alert(title, explanation, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void act(action, 'Roster updated'); } },
    ]);
  };
  const confirmDecision = (title: string, action: () => Promise<unknown>, success: string) => {
    Alert.alert(title, 'This changes the request status. Confirm that the request and pharmacy are correct.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => { void act(action, success); } },
    ]);
  };

  if (!pharmacyId) return <ContentState kind="empty" title="Select a pharmacy" description="Choose a pharmacy workspace before managing roster actions." />;

  return <ParityPage title="Roster operations" subtitle={pharmacyName || 'Selected pharmacy'} loading={loading} error={error} onRetry={load} onRefresh={load}>
    {notice ? <Text accessibilityRole="alert">{notice}</Text> : null}
    <Section title="Assigned shifts" description="Removing an assignment is checked against booked, invoiced and locked history by the backend.">
      {data.assignments.length ? data.assignments.map((row) => (
        <View key={row.id} style={{ gap: 8 }}>
          <DataRow title={[row.userDetail?.firstName, row.userDetail?.lastName].filter(Boolean).join(' ') || 'Worker'}
            subtitle={String(row.slotDate || '') + ' · ' + String(row.slotDetail?.startTime || '') + '–' + String(row.slotDetail?.endTime || '')}
            status={row.isPublishedRoster ? 'Published roster' : 'Assignment'} />
          <Button mode="outlined" textColor="#B42318" disabled={busy} onPress={() => confirmDelete(
            'Remove assignment?',
            'Remove this assignment only if it has no protected payroll, booking or invoice history.',
            () => deleteRosterAssignmentService(row.id),
          )}>Remove assignment</Button>
        </View>
      )) : <EmptyState title="No assignments" body="No assignments were returned for the coming four weeks." />}
    </Section>
    <Section title="Open shifts" description="Escalation widens an existing posting; it does not alter rates.">
      {data.open.length ? data.open.map((row) => (
        <View key={row.id} style={{ gap: 8 }}>
          <DataRow title={replaceUnderscore(row.roleNeeded)} subtitle={'Shift ' + row.id} status={replaceUnderscore(row.visibility)} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {visibilityChoices.map((value) => <Chip key={value} selected={selectedVisibility === value} onPress={() => setSelectedVisibility(value)} disabled={busy}>{replaceUnderscore(value)}</Chip>)}
          </View>
          <Button mode="outlined" disabled={busy} onPress={() => confirmDecision('Escalate open shift?', () => escalateRosterShiftService(row.id, { target_visibility: selectedVisibility }), 'Visibility updated')}>Escalate</Button>
          <Button mode="outlined" textColor="#B42318" disabled={busy} onPress={() => confirmDelete(
            'Delete open shift?', 'The server rejects protected or financially linked shifts. This cannot be undone.',
            () => deleteRosterShiftService(row.id),
          )}>Delete open shift</Button>
        </View>
      )) : <EmptyState title="No open shifts" body="No open shifts in this pharmacy for the coming four weeks." />}
    </Section>
    <Section title="Legacy cover requests" description="These are separate from V2 roster swap and replacement requests.">
      {data.requests.filter((row) => row.status === 'PENDING').length
        ? data.requests.filter((row) => row.status === 'PENDING').map((row) => (
          <View key={row.id} style={{ gap: 8 }}>
            <DataRow title={row.requesterName || replaceUnderscore(row.role)} subtitle={row.slotDate + ' · ' + (row.note || 'No note')} status="Pending" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Button mode="contained" disabled={busy} onPress={() => confirmDecision('Approve request?', () => approveWorkerShiftRequestService(row.id), 'Request approved')}>Approve</Button>
              <Button mode="outlined" disabled={busy} onPress={() => confirmDecision('Reject request?', () => rejectWorkerShiftRequestService(row.id), 'Request rejected')}>Reject</Button>
            </View>
          </View>
        )) : <EmptyState title="No pending requests" body="Pending legacy cover requests will appear here." />}
    </Section>
    <Button mode="text" onPress={() => router.push('/manager/roster' as any)}>Back to roster planner</Button>
  </ParityPage>;
}
