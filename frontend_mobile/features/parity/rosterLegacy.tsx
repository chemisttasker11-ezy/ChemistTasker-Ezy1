import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, View, ScrollView } from 'react-native';
import { Button, Chip, Menu, Text, TextInput } from 'react-native-paper';
import { DatePickerModal } from 'react-native-paper-dates';
import { useRouter } from 'expo-router';
import {
  createAsyncScope, deleteRosterAssignmentService, deleteRosterShiftService,
  escalateRosterShiftService, fetchOwnerOpenShifts, fetchRosterOwnerAssignments,
  fetchWorkerShiftRequestsService, approveWorkerShiftRequestService,
  rejectWorkerShiftRequestService, type OpenShift, type RosterAssignment,
  type WorkerShiftRequest, type RosterPharmacyMember,
  fetchRosterOwnerMembersService, createShiftAndAssignService,
  approveLeaveRequestService, rejectLeaveRequestService,
} from '@chemisttasker/shared-core';
import { useWorkspace } from '@/context/WorkspaceContext';
import { ContentState } from '@/components/ui';
import { ParityPage, Section, DataRow, EmptyState } from './ParityUI';
import { errorMessage, replaceUnderscore, startOfWeek, isoDate } from './utils';
import { colors, touch, space } from '@/constants/tokens';

const assignableRoles = ['PHARMACIST', 'INTERN', 'TECHNICIAN', 'ASSISTANT', 'STUDENT'] as const;
const nameOfMember = (member: RosterPharmacyMember) =>
  [member.userDetails?.firstName, member.userDetails?.lastName].filter(Boolean).join(' ').trim()
  || member.invitedName || member.userDetails?.email || 'Member ' + member.id;
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
  const [visibilityByShift, setVisibilityByShift] = useState<Record<number, string>>({});
  const busyRef = useRef(false);
  const [members, setMembers] = useState<RosterPharmacyMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState(false);
  const [membersReloadKey, setMembersReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createDate, setCreateDate] = useState(isoDate(new Date(Date.now() + 7 * 86400000)));
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [neededRole, setNeededRole] = useState<string>('PHARMACIST');
  const [memberId, setMemberId] = useState<number | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberMenuOpen, setMemberMenuOpen] = useState(false);

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

  useEffect(() => {
    const ticket = requestScope.begin('members');
    if (!pharmacyId) { setMembers([]); setMembersLoading(false); return; }
    setMembers([]);
    setMembersError(false);
    setMembersLoading(true);
    void fetchRosterOwnerMembersService(pharmacyId)
      .then((rows) => {
        if (ticket.isCurrent()) setMembers(rows);
      })
      .catch(() => {
        if (ticket.isCurrent()) setMembersError(true);
      })
      .finally(() => {
        if (ticket.isCurrent()) setMembersLoading(false);
      });
  }, [pharmacyId, requestScope, membersReloadKey]);

  const act = async (operation: () => Promise<unknown>, success: string) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    const ticket = requestScope.begin('action');
    setBusy(true); setError('');
    try {
      await ticket.run(operation);
      setNotice(success);
      await load();
      return true;
    } catch (e) {
      if (ticket.isCurrent()) setError(errorMessage(e, 'Unable to update this roster record.'));
      return false;
    } finally {
      busyRef.current = false;
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

  const eligible = members.filter((member) =>
    member.role === neededRole && (
      !memberSearch.trim()
      || nameOfMember(member).toLowerCase().includes(memberSearch.trim().toLowerCase())
    )
  );
  const matchingMember = members.find((member) => member.user === memberId);
  const validClock = (text: string) => /^(?:[01]\\d|2[0-3]):[0-5]\\d$/.test(text);
  const canCreate =
    !busy && !membersLoading && !membersError && Boolean(memberId)
    && /^\\d{4}-\\d{2}-\\d{2}$/.test(createDate)
    && validClock(startTime) && validClock(endTime) && startTime !== endTime;

  const submitAssignment = async () => {
    if (!pharmacyId || !canCreate || !memberId) return;
    const completed = await act(
      () => createShiftAndAssignService({
        pharmacy_id: pharmacyId,
        role_needed: neededRole,
        slot_date: createDate,
        start_time: startTime,
        end_time: endTime,
        user_id: memberId,
      }),
      'Assigned shift created',
    );
    if (completed) setCreating(false);
  };

  if (!pharmacyId) return <ContentState kind="empty" title="Select a pharmacy" description="Choose a pharmacy workspace before managing roster actions." />;

  return <ParityPage title="Roster operations" subtitle={pharmacyName || 'Selected pharmacy'} loading={loading} error={error} onRetry={load} onRefresh={load}>
    {notice ? <Text accessibilityRole="alert">{notice}</Text> : null}
    <Section title="Create assigned shift" description="Assign an eligible pharmacy staff member directly. The backend enforces role, roster, booking and payroll protections.">
      <Button mode="outlined" icon={creating ? 'chevron-up' : 'plus'} contentStyle={{ minHeight: touch.min }}
        onPress={() => setCreating((value) => !value)} disabled={busy}>
        {creating ? 'Close assignment form' : 'New assignment'}
      </Button>
      {creating ? <View style={{ gap: space.md }}>
        <Text variant="labelLarge">Worker role</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {assignableRoles.map((role) => <Chip key={role} selected={neededRole === role}
            style={{ minHeight: touch.min, justifyContent: 'center' }}
            onPress={() => { setNeededRole(role); setMemberId(null); }}>
            {replaceUnderscore(role)}
          </Chip>)}
        </View>
        <Button mode="outlined" icon="calendar" contentStyle={{ minHeight: touch.min }}
          onPress={() => setDatePickerOpen(true)}>Date · {createDate}</Button>
        <DatePickerModal locale="en" mode="single" visible={datePickerOpen}
          date={new Date(createDate + 'T12:00:00')}
          onDismiss={() => setDatePickerOpen(false)}
          onConfirm={({ date }) => { setDatePickerOpen(false); if (date) setCreateDate(isoDate(date)); }} />
        <TextInput mode="outlined" label="Start (24-hour HH:mm)" value={startTime}
          onChangeText={setStartTime} keyboardType="numbers-and-punctuation" />
        <TextInput mode="outlined" label="End (24-hour HH:mm)" value={endTime}
          onChangeText={setEndTime} keyboardType="numbers-and-punctuation" />
        {membersError ? (
          <Button mode="outlined" onPress={() => setMembersReloadKey((value) => value + 1)}>
            Could not load eligible staff · Retry
          </Button>
        ) : membersLoading ? <Text>Loading eligible staff…</Text> : (
          <>
            <TextInput mode="outlined" label="Search eligible staff" value={memberSearch}
              onChangeText={setMemberSearch} />
            <Menu visible={memberMenuOpen} onDismiss={() => setMemberMenuOpen(false)}
              anchor={<Button mode="outlined" contentStyle={{ minHeight: touch.min }}
                onPress={() => setMemberMenuOpen(true)}>
                {matchingMember ? nameOfMember(matchingMember) : 'Choose worker'}
              </Button>}>
              <ScrollView style={{ maxHeight: 280 }}>
                {eligible.length ? eligible.map((member) => (
                  <Menu.Item key={member.id} title={nameOfMember(member)} onPress={() => {
                    setMemberId(member.user); setMemberMenuOpen(false);
                  }} />
                )) : <Menu.Item title="No eligible staff in this role" disabled />}
              </ScrollView>
            </Menu>
          </>
        )}
        {!validClock(startTime) || !validClock(endTime) || startTime === endTime
          ? <Text style={{ color: colors.status.red.fg }}>Use valid 24-hour times. Start and end must differ.</Text> : null}
        <Button mode="contained" contentStyle={{ minHeight: touch.min }} disabled={!canCreate}
          loading={busy} onPress={() => void submitAssignment()}>Create assigned shift</Button>
      </View> : null}
    </Section>
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
            {visibilityChoices.filter((value) => !row.allowedEscalationLevels?.length || row.allowedEscalationLevels.includes(value)).map((value) => (
              <Chip key={value} selected={(visibilityByShift[row.id] ?? '') === value}
                onPress={() => setVisibilityByShift((current) => ({ ...current, [row.id]: value }))}
                disabled={busy}>{replaceUnderscore(value)}</Chip>
            ))}
          </View>
          <Button mode="outlined" disabled={busy || !visibilityByShift[row.id]} onPress={() => confirmDecision('Escalate open shift?', () => escalateRosterShiftService(row.id, { target_visibility: visibilityByShift[row.id] }), 'Visibility updated')}>Escalate</Button>
          <Button mode="outlined" textColor="#B42318" disabled={busy} onPress={() => confirmDelete(
            'Delete open shift?', 'The server rejects protected or financially linked shifts. This cannot be undone.',
            () => deleteRosterShiftService(row.id),
          )}>Delete open shift</Button>
        </View>
      )) : <EmptyState title="No open shifts" body="No open shifts in this pharmacy for the coming four weeks." />}
    </Section>
    <Section title="Legacy leave requests" description="Approve or reject recorded leave without changing historic roster or payroll rules.">
      {data.assignments.some((row) => row.leaveRequest?.status === 'PENDING')
        ? data.assignments.filter((row) => row.leaveRequest?.status === 'PENDING').map((row) => (
          <View key={row.id} style={{ gap: space.sm }}>
            <DataRow title={nameOfMember({id: row.id, user: row.user || 0, userDetails: row.userDetail} as RosterPharmacyMember)}
              subtitle={String(row.slotDate) + ' · ' + replaceUnderscore(row.leaveRequest?.leaveType)} status="Leave pending" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              <Button mode="contained" contentStyle={{minHeight:touch.min}} disabled={busy}
                onPress={() => confirmDecision('Approve leave?', () => approveLeaveRequestService(row.leaveRequest!.id), 'Leave approved')}>Approve leave</Button>
              <Button mode="outlined" contentStyle={{minHeight:touch.min}} disabled={busy}
                onPress={() => confirmDecision('Reject leave?', () => rejectLeaveRequestService(row.leaveRequest!.id), 'Leave rejected')}>Reject leave</Button>
            </View>
          </View>
        )) : <EmptyState title="No pending leave" body="Leave submitted against legacy roster assignments will appear here." />}
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
