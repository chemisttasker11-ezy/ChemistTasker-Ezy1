import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Chip, Dialog, Menu, Portal } from 'react-native-paper';
import { DatePickerInput } from 'react-native-paper-dates';
import { workforce } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import {
  ChoiceChips,
  DataRow,
  EmptyState,
  Field,
  InfoNote,
  MetricGrid,
  ParityPage,
  Section,
} from '@/features/parity/ParityUI';

const TYPES = ['ANNUAL', 'SICK', 'CARER', 'COMPASSIONATE', 'STUDY', 'UNPAID', 'OTHER'];
const typeOptions = TYPES.map((value) => ({ value, label: value.replaceAll('_', ' ') }));

const parseTime = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 ? { h, m } : null;
};

const combine = (day: Date | undefined, text: string) => {
  if (!day) return null;
  const time = parseTime(text);
  if (!time) return null;
  const next = new Date(day);
  next.setHours(time.h, time.m, 0, 0);
  return next;
};

const pharmacyName = (membership: any) =>
  membership?.pharmacy_name || membership?.pharmacyName || membership?.pharmacy?.name || `Pharmacy #${membership?.pharmacy_id || membership?.pharmacy?.id || ''}`;

export default function MyLeaveScreen() {
  const { user } = useAuth();
  const memberships = useMemo(
    () => ((user as any)?.memberships || []).filter((membership: any) =>
      membership.is_active !== false &&
      String(membership.status || 'ACCEPTED').toUpperCase() === 'ACCEPTED' &&
      membership.role !== 'CONTACT'
    ),
    [user],
  );
  const [rows, setRows] = useState<any[]>([]);
  const [visible, setVisible] = useState(false);
  const [membershipId, setMembershipId] = useState<number | null>(memberships[0]?.id ?? null);
  const [type, setType] = useState('ANNUAL');
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [membershipMenu, setMembershipMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!membershipId && memberships.length) setMembershipId(Number(memberships[0].id));
  }, [membershipId, memberships]);

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await workforce.listLeave();
      setRows(Array.isArray(result) ? result : []);
    } catch (e: any) {
      setError(e?.payload?.error || e?.message || 'Unable to load leave requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const start = combine(startDate, startTime);
  const end = combine(endDate, endTime);

  const submit = async () => {
    if (!membershipId || !start || !end || end <= start) {
      setError('Enter a valid start and end date/time.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await workforce.createLeave({
        membership_id: membershipId,
        leave_type: type,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        note: note.trim(),
      });
      setVisible(false);
      setNote('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Unable to request leave.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: number) => {
    setBusy(true);
    setError('');
    try {
      await workforce.decideLeave(id, 'CANCELLED', 'Cancelled by worker');
      await load();
    } catch (e: any) {
      setError(e?.payload?.error || e?.message || 'Unable to cancel request.');
    } finally {
      setBusy(false);
    }
  };

  const pending = rows.filter((row) => String(row.status || '').toUpperCase() === 'PENDING').length;
  const approved = rows.filter((row) => String(row.status || '').toUpperCase() === 'APPROVED').length;

  return (
    <ParityPage
      title="My leave"
      subtitle="Request full-day or partial-day leave before or after a roster is created."
      loading={loading}
      error={error}
      onRetry={load}
      right={<Button compact mode="contained" onPress={() => setVisible(true)}>Request</Button>}
    >
      <MetricGrid items={[
        { label: 'Requests', value: rows.length },
        { label: 'Pending', value: pending, tone: pending ? 'warning' : 'success' },
        { label: 'Approved', value: approved, tone: 'success' },
      ]} />

      <InfoNote title="Roster relationship">
        General leave can be requested here before a shift exists. For leave tied to a specific assigned shift, use My Roster so the request remains connected to that roster assignment.
      </InfoNote>

      <Section title="Leave requests">
        {rows.length ? rows.map((row) => (
          <View key={row.id} style={{ gap: 6 }}>
            <DataRow
              title={`${row.pharmacy_name || 'Pharmacy'} · ${String(row.leave_type || '').replaceAll('_', ' ')}`}
              subtitle={`${new Date(row.start_at).toLocaleString()} – ${new Date(row.end_at).toLocaleString()}${row.manager_note ? ` · ${row.manager_note}` : ''}`}
              status={String(row.status || '').replaceAll('_', ' ')}
            />
            {row.note ? <InfoNote title="Note">{row.note}</InfoNote> : null}
            {String(row.status || '').toUpperCase() === 'PENDING' ? (
              <Button compact textColor="#C53B47" disabled={busy} onPress={() => void cancel(Number(row.id))}>
                Cancel request
              </Button>
            ) : null}
          </View>
        )) : <EmptyState title="No leave requests" body="Your leave requests will appear here after you submit the first one." actionLabel="Request leave" onAction={() => setVisible(true)} />}
      </Section>

      <Portal>
        <Dialog visible={visible} onDismiss={() => !busy && setVisible(false)}>
          <Dialog.Title>Request leave</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }} keyboardShouldPersistTaps="handled">
              <Menu
                visible={membershipMenu}
                onDismiss={() => setMembershipMenu(false)}
                anchor={
                  <Button mode="outlined" onPress={() => setMembershipMenu(true)}>
                    {pharmacyName(memberships.find((membership: any) => Number(membership.id) === membershipId)) || 'Select pharmacy'}
                  </Button>
                }
              >
                {memberships.map((membership: any) => (
                  <Menu.Item
                    key={membership.id}
                    title={pharmacyName(membership)}
                    onPress={() => {
                      setMembershipId(Number(membership.id));
                      setMembershipMenu(false);
                    }}
                  />
                ))}
              </Menu>

              <ChoiceChips value={type} options={typeOptions} onChange={setType} disabled={busy} />
              <DatePickerInput locale="en-AU" label="Start date" value={startDate} onChange={setStartDate} inputMode="start" />
              <Field label="Start time (HH:MM)" value={startTime} onChangeText={setStartTime} disabled={busy} />
              <DatePickerInput locale="en-AU" label="End date" value={endDate} onChange={setEndDate} inputMode="start" />
              <Field label="End time (HH:MM)" value={endTime} onChangeText={setEndTime} disabled={busy} />
              <Field label="Note" value={note} onChangeText={setNote} multiline disabled={busy} />
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button disabled={busy} onPress={() => setVisible(false)}>Cancel</Button>
            <Button mode="contained" loading={busy} disabled={busy || !membershipId || !start || !end || end <= start} onPress={() => void submit()}>
              Submit
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ParityPage>
  );
}
