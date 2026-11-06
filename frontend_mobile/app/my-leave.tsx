import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Dialog, Menu, Portal } from 'react-native-paper';
import { GuardedDatePickerInput as DatePickerInput, GuardedTimePickerModal as TimePickerModal } from '@/components/security/GuardedModal';
import { leaveRequestMemberships, workforce, WORKFORCE_LEAVE_TYPE_OPTIONS, type WorkforceLeaveType } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { useUnsavedChangesGuard } from '@/roles/shared/forms/useUnsavedChangesGuard';
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

export function validateMembershipSelection(memberships: any[], selectedId: number | null): number | null {
  if (!Array.isArray(memberships) || !memberships.length) return null;
  const match = memberships.find((m: any) => Number(m.id) === Number(selectedId));
  return match ? Number(match.id) : Number(memberships[0].id);
}

export default function MyLeaveScreen() {
  const { user } = useAuth();
  const accountKey = user ? String(user.id ?? user.email ?? '') : '';
  return <MyLeaveAccountScreen key={accountKey} accountKey={accountKey} user={user} />;
}

function MyLeaveAccountScreen({ accountKey, user }: { accountKey: string; user: any }) {
  const memberships = useMemo(() => leaveRequestMemberships((user as any)?.memberships), [user]);
  const [rows, setRows] = useState<any[]>([]);
  const [visible, setVisible] = useState(false);
  const [membershipId, setMembershipId] = useState<number | null>(() => validateMembershipSelection(memberships, null));
  const [type, setType] = useState<WorkforceLeaveType>('ANNUAL');
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [timeTarget, setTimeTarget] = useState<'start' | 'end' | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [membershipMenu, setMembershipMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const submitRef = useRef(false);
  const isBusy = busy || Boolean(submitRef.current);
  useUnsavedChangesGuard(null, { enabled: false, saving: isBusy });

  const loadSequence = useRef(0);
  const submitSequence = useRef(0);
  const accountRef = useRef(accountKey);

  useEffect(() => {
    setMembershipId((current) => validateMembershipSelection(memberships, current));
  }, [memberships]);

  useEffect(() => {
    return () => {
      loadSequence.current += 1;
      submitSequence.current += 1;
      submitRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!accountKey) {
      setRows([]);
      setLoading(false);
      return;
    }
    const seq = ++loadSequence.current;
    const currentAccount = accountKey;
    const isCurrent = () => seq === loadSequence.current && accountRef.current === currentAccount;
    setError('');
    try {
      const result = await workforce.listLeave();
      if (!isCurrent()) return;
      setRows(Array.isArray(result) ? result : []);
    } catch (e: any) {
      if (isCurrent()) setError(e?.payload?.error || e?.message || 'Unable to load leave requests.');
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [accountKey]);

  useEffect(() => { void load(); }, [load]);

  const start = combine(startDate, startTime);
  const end = combine(endDate, endTime);

  const submit = async () => {
    if (busy || submitRef.current || !membershipId || !start || !end || end <= start) {
      if (!membershipId || !start || !end || end <= start) {
        setError('Enter a valid start and end date/time.');
      }
      return;
    }
    const seq = ++submitSequence.current;
    const currentAccount = accountKey;
    const isCurrent = () => seq === submitSequence.current && accountRef.current === currentAccount;
    submitRef.current = true;
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
      if (!isCurrent()) return;
      setVisible(false);
      setNote('');
      await load();
    } catch (e: any) {
      if (isCurrent()) setError(e?.response?.data?.error || e?.payload?.error || e?.message || 'Unable to request leave.');
    } finally {
      if (isCurrent()) {
        submitRef.current = false;
        setBusy(false);
      }
    }
  };

  const cancel = async (id: number) => {
    if (busy || submitRef.current) return;
    const seq = ++submitSequence.current;
    const currentAccount = accountKey;
    const isCurrent = () => seq === submitSequence.current && accountRef.current === currentAccount;
    submitRef.current = true;
    setBusy(true);
    setError('');
    try {
      await workforce.decideLeave(id, 'CANCELLED', 'Cancelled by worker');
      if (!isCurrent()) return;
      await load();
    } catch (e: any) {
      if (isCurrent()) setError(e?.payload?.error || e?.message || 'Unable to cancel request.');
    } finally {
      if (isCurrent()) {
        submitRef.current = false;
        setBusy(false);
      }
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
      backDisabled={isBusy}
    >
      <MetricGrid items={[
        { label: 'Requests', value: rows.length },
        { label: 'Pending', value: pending, tone: pending ? 'warning' : 'success' },
        { label: 'Approved', value: approved, tone: 'success' },
      ]} />

      <InfoNote title="Roster relationship">
        All leave uses the same workforce leave record. Use My Roster when the request is for an existing assigned shift so that record is also linked to the roster assignment.
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

              <ChoiceChips value={type} options={WORKFORCE_LEAVE_TYPE_OPTIONS} onChange={(value) => setType(value as WorkforceLeaveType)} disabled={busy} />
              <DatePickerInput locale="en-AU" label="Start date" value={startDate} onChange={setStartDate} inputMode="start" />
              <Button mode="outlined" icon="clock-outline" disabled={busy} onPress={() => setTimeTarget('start')}>
                Start time · {startTime}
              </Button>
              <DatePickerInput locale="en-AU" label="End date" value={endDate} onChange={setEndDate} inputMode="start" />
              <Button mode="outlined" icon="clock-outline" disabled={busy} onPress={() => setTimeTarget('end')}>
                End time · {endTime}
              </Button>
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
        <TimePickerModal
          visible={timeTarget !== null}
          onDismiss={() => setTimeTarget(null)}
          onConfirm={({ hours, minutes }) => {
            const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            if (timeTarget === 'start') setStartTime(value);
            else if (timeTarget === 'end') setEndTime(value);
            setTimeTarget(null);
          }}
          hours={parseTime(timeTarget === 'end' ? endTime : startTime)?.h ?? 9}
          minutes={parseTime(timeTarget === 'end' ? endTime : startTime)?.m ?? 0}
          label="Select time"
          locale="en"
        />
      </Portal>
    </ParityPage>
  );
}
