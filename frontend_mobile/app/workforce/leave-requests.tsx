import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { workforce } from '@chemisttasker/shared-core';
import { useWorkspace } from '@/context/WorkspaceContext';
import {
  ActionButtons,
  ChoiceChips,
  DataRow,
  EmptyState,
  Field,
  InfoNote,
  MetricGrid,
  ParityPage,
  PharmacyRequired,
  Section,
} from '@/features/parity/ParityUI';
import { errorMessage, replaceUnderscore } from '@/features/parity/utils';

const statusOptions = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: '', label: 'All' },
];

export default function ManagerLeaveScreen() {
  const workspace = useWorkspace();
  const pharmacyId = workspace.selectedPharmacyId;
  const [status, setStatus] = useState('PENDING');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [decisionRow, setDecisionRow] = useState<any | null>(null);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!pharmacyId) {
      setRows([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError('');
    try {
      const result = await workforce.listLeave({
        pharmacy_id: pharmacyId,
        ...(status ? { status } : {}),
      });
      setRows(Array.isArray(result) ? result : []);
    } catch (e) {
      setError(errorMessage(e, 'Unable to load leave requests.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [pharmacyId, status]);

  useEffect(() => { void load(); }, [load]);

  if (!pharmacyId) {
    return (
      <ParityPage title="Leave requests" subtitle="Review workforce leave for the selected pharmacy.">
        <PharmacyRequired />
      </ParityPage>
    );
  }

  const openDecision = (row: any, next: 'APPROVED' | 'REJECTED') => {
    setDecisionRow(row);
    setDecision(next);
    setNote('');
  };

  const submitDecision = async () => {
    if (!decisionRow?.id || (decision === 'REJECTED' && !note.trim())) return;
    setBusy(true);
    setError('');
    try {
      await workforce.decideLeave(Number(decisionRow.id), decision, note.trim());
      setDecisionRow(null);
      setNote('');
      await load();
    } catch (e) {
      setError(errorMessage(e, 'Unable to update the leave request.'));
    } finally {
      setBusy(false);
    }
  };

  const pending = rows.filter((row) => String(row.status || '').toUpperCase() === 'PENDING').length;

  return (
    <ParityPage
      title="Leave requests"
      subtitle="Review dated and partial-day leave independently of whether a roster assignment already exists."
      loading={loading}
      error={error}
      onRetry={load}
      onRefresh={() => { setRefreshing(true); void load(); }}
      refreshing={refreshing}
    >
      <MetricGrid items={[
        { label: 'Matching', value: rows.length },
        { label: 'Pending', value: pending, tone: pending ? 'warning' : 'success' },
      ]} />

      <Section title="Status filter">
        <ChoiceChips value={status} options={statusOptions} onChange={setStatus} />
      </Section>

      <InfoNote title="Two leave paths">
        General workforce leave is reviewed here. Leave tied to a specific roster assignment remains visible in the roster workflow as well.
      </InfoNote>

      <Section title="Requests">
        {rows.length ? rows.map((row) => (
          <View key={row.id} style={{ gap: 8 }}>
            <DataRow
              title={row.worker_name || row.workerName || 'Worker'}
              subtitle={`${replaceUnderscore(row.leave_type || row.leaveType || '')} · ${new Date(row.start_at || row.startAt).toLocaleString()} – ${new Date(row.end_at || row.endAt).toLocaleString()}`}
              status={replaceUnderscore(row.status || '')}
            />
            {row.note ? <Text variant="bodySmall">{row.note}</Text> : null}
            {String(row.status || '').toUpperCase() === 'PENDING' ? (
              <ActionButtons>
                <Button mode="contained" disabled={busy} onPress={() => openDecision(row, 'APPROVED')}>Approve</Button>
                <Button mode="outlined" textColor="#C53B47" disabled={busy} onPress={() => openDecision(row, 'REJECTED')}>Reject</Button>
              </ActionButtons>
            ) : null}
          </View>
        )) : <EmptyState title="No leave requests" body="No requests match the selected pharmacy and status." />}
      </Section>

      <Portal>
        <Dialog visible={!!decisionRow} onDismiss={() => !busy && setDecisionRow(null)}>
          <Dialog.Title>{decision === 'APPROVED' ? 'Approve leave' : 'Reject leave'}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {decision === 'APPROVED'
                ? 'You can add an optional manager note before approval.'
                : 'A rejection reason is required so the worker has a clear audit trail.'}
            </Text>
            <View style={{ marginTop: 14 }}>
              <Field label={decision === 'APPROVED' ? 'Manager note (optional)' : 'Rejection reason'} value={note} onChangeText={setNote} multiline disabled={busy} />
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button disabled={busy} onPress={() => setDecisionRow(null)}>Cancel</Button>
            <Button
              mode="contained"
              loading={busy}
              disabled={busy || (decision === 'REJECTED' && !note.trim())}
              onPress={() => void submitDecision()}
            >
              {decision === 'APPROVED' ? 'Approve' : 'Reject'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ParityPage>
  );
}
