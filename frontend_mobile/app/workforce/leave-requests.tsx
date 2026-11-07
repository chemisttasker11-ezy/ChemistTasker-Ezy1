import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { workforce } from '@chemisttasker/shared-core';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useAuth } from '@/context/AuthContext';
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
  const { user } = useAuth();
  const workspace = useWorkspace();
  const pharmacyId = workspace.selectedPharmacyId;
  const accountKey = user ? String(user.id ?? user.email ?? '') : '';
  const [status, setStatus] = useState('PENDING');

  if (!pharmacyId) {
    return (
      <ParityPage title="Leave requests" subtitle="Review workforce leave for the selected pharmacy.">
        <PharmacyRequired />
      </ParityPage>
    );
  }

  return (
    <ManagerLeaveScoped
      key={`${accountKey}:${pharmacyId}:${status}`}
      accountKey={accountKey}
      pharmacyId={pharmacyId}
      status={status}
      onStatusChange={setStatus}
    />
  );
}

function ManagerLeaveScoped({
  accountKey,
  pharmacyId,
  status,
  onStatusChange,
}: {
  accountKey: string;
  pharmacyId: number;
  status: string;
  onStatusChange: (status: string) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [decisionRow, setDecisionRow] = useState<any | null>(null);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [note, setNote] = useState('');

  const loadSequence = useRef(0);
  const mutationSequence = useRef(0);
  const busyRef = useRef(false);
  const accountRef = useRef(accountKey);
  const pharmacyRef = useRef(pharmacyId);
  const statusRef = useRef(status);

  const load = useCallback(async () => {
    const seq = ++loadSequence.current;
    const currentAccount = accountKey;
    const currentPharmacy = pharmacyId;
    const currentStatus = status;
    const isCurrent = () =>
      seq === loadSequence.current &&
      accountRef.current === currentAccount &&
      pharmacyRef.current === currentPharmacy &&
      statusRef.current === currentStatus;

    setError('');
    try {
      const result = await workforce.listLeave({
        pharmacy_id: currentPharmacy,
        ...(currentStatus ? { status: currentStatus } : {}),
      });
      if (!isCurrent()) return;
      setRows(Array.isArray(result) ? result : []);
    } catch (e) {
      if (isCurrent()) setError(errorMessage(e, 'Unable to load leave requests.'));
    } finally {
      if (isCurrent()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [accountKey, pharmacyId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      loadSequence.current += 1;
      mutationSequence.current += 1;
      busyRef.current = false;
    };
  }, []);

  const openDecision = (row: any, next: 'APPROVED' | 'REJECTED') => {
    setDecisionRow(row);
    setDecision(next);
    setNote('');
  };

  const submitDecision = async () => {
    if (busy || busyRef.current || !decisionRow?.id || (decision === 'REJECTED' && !note.trim())) return;
    const seq = ++mutationSequence.current;
    const currentAccount = accountKey;
    const currentPharmacy = pharmacyId;
    const currentStatus = status;
    const isCurrent = () =>
      seq === mutationSequence.current &&
      accountRef.current === currentAccount &&
      pharmacyRef.current === currentPharmacy &&
      statusRef.current === currentStatus;

    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await workforce.decideLeave(Number(decisionRow.id), decision, note.trim());
      if (!isCurrent()) return;
      setDecisionRow(null);
      setNote('');
      await load();
    } catch (e) {
      if (isCurrent()) setError(errorMessage(e, 'Unable to update the leave request.'));
    } finally {
      if (isCurrent()) {
        busyRef.current = false;
        setBusy(false);
      }
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
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
      refreshing={refreshing}
    >
      <MetricGrid items={[
        { label: 'Matching', value: rows.length },
        { label: 'Pending', value: pending, tone: pending ? 'warning' : 'success' },
      ]} />

      <Section title="Status filter">
        <ChoiceChips value={status} options={statusOptions} onChange={onStatusChange} />
      </Section>

      <InfoNote title="One leave record">
        Leave can be requested from My Leave or directly from an assigned roster shift. Both paths use the same workforce leave record and approval workflow.
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
