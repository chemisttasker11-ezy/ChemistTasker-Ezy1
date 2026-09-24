import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, Dialog, Portal, Text } from 'react-native-paper';
import {
  claimShiftService,
  createLeaveRequestService,
  createWorkerShiftRequestService,
  deleteLeaveRequestService,
  deleteWorkerShiftRequestService,
  fetchCommunityShifts,
  fetchRosterWorkerAssignments,
  fetchRosterWorkerPharmaciesService,
  fetchWorkerShiftRequestsService,
  updateLeaveRequestService,
  updateWorkerShiftRequestService,
} from '@chemisttasker/shared-core';
import {
  ActionButtons,
  ChoiceChips,
  DataRow,
  EmptyState,
  Field,
  InfoNote,
  MetricGrid,
  ParityPage,
  Section,
} from '@/features/parity/ParityUI';
import { asArray, errorMessage, replaceUnderscore, startOfWeek } from '@/features/parity/utils';

const LEAVE_TYPES = [
  { value: 'ANNUAL', label: 'Annual' },
  { value: 'SICK', label: 'Sick' },
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'OTHER', label: 'Other' },
];

const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

const assignmentDate = (row: any) =>
  row?.slotDate ?? row?.slot_date ?? row?.slotDetail?.date ?? row?.slot_detail?.date ?? '';

const assignmentStart = (row: any) =>
  row?.slotDetail?.startTime ?? row?.slot_detail?.start_time ?? row?.startTime ?? row?.start_time ?? '';

const assignmentEnd = (row: any) =>
  row?.slotDetail?.endTime ?? row?.slot_detail?.end_time ?? row?.endTime ?? row?.end_time ?? '';

const assignmentRole = (row: any) =>
  row?.shiftDetail?.roleNeeded ?? row?.shift_detail?.role_needed ?? row?.role ?? 'PHARMACIST';

const assignmentLeave = (row: any) => row?.leaveRequest ?? row?.leave_request ?? null;

const pharmacyIdOf = (row: any) => Number(row?.id ?? row?.pharmacyId ?? row?.pharmacy_id ?? 0);

const pharmacyNameOf = (row: any) => row?.name ?? row?.pharmacyName ?? row?.pharmacy_name ?? `Pharmacy #${pharmacyIdOf(row)}`;

const openShiftSlots = (shift: any) => asArray<any>(shift?.slots);

type EditState =
  | { type: 'leave'; assignment: any; existing?: any | null }
  | { type: 'cover'; assignment: any; existing?: any | null }
  | { type: 'claim'; shift: any; slot: any }
  | null;

export default function MyRosterScreen() {
  const [pharmacies, setPharmacies] = useState<any[]>([]);
  const [pharmacyId, setPharmacyId] = useState<number | null>(null);
  const [weekStart, setWeekStart] = useState(startOfWeek());
  const [assignments, setAssignments] = useState<any[]>([]);
  const [openShifts, setOpenShifts] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<EditState>(null);
  const [leaveType, setLeaveType] = useState('ANNUAL');
  const [note, setNote] = useState('');

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const loadPharmacies = useCallback(async () => {
    const rows = asArray<any>(await fetchRosterWorkerPharmaciesService());
    setPharmacies(rows);
    setPharmacyId((current) => {
      if (current && rows.some((row) => pharmacyIdOf(row) === current)) return current;
      return rows.length ? pharmacyIdOf(rows[0]) : null;
    });
  }, []);

  const loadRoster = useCallback(async () => {
    if (!pharmacyId) {
      setAssignments([]);
      setOpenShifts([]);
      setRequests([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError('');
    try {
      const [assignmentRows, openRows, requestRows] = await Promise.all([
        fetchRosterWorkerAssignments({ pharmacyId, startDate: weekStart, endDate: weekEnd }),
        fetchCommunityShifts({ pharmacyId, startDate: weekStart, endDate: weekEnd, unassigned: true } as any),
        fetchWorkerShiftRequestsService({ pharmacyId, startDate: weekStart, endDate: weekEnd }),
      ]);
      setAssignments(asArray<any>(assignmentRows));
      setOpenShifts(asArray<any>((openRows as any)?.results ?? openRows));
      setRequests(asArray<any>(requestRows));
    } catch (e) {
      setError(errorMessage(e, 'Unable to load your roster.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [pharmacyId, weekEnd, weekStart]);

  useEffect(() => {
    void loadPharmacies().catch((e) => {
      setError(errorMessage(e, 'Unable to load roster pharmacies.'));
      setLoading(false);
    });
  }, [loadPharmacies]);

  useEffect(() => {
    if (pharmacyId) void loadRoster();
  }, [loadRoster, pharmacyId]);

  const refresh = () => {
    setRefreshing(true);
    void loadRoster();
  };

  const openLeave = (assignment: any) => {
    const existing = assignmentLeave(assignment);
    setLeaveType(existing?.leaveType ?? existing?.leave_type ?? 'ANNUAL');
    setNote(existing?.note ?? '');
    setEdit({ type: 'leave', assignment, existing });
  };

  const openCover = (assignment: any, existing?: any | null) => {
    setNote(existing?.note ?? '');
    setEdit({ type: 'cover', assignment, existing: existing ?? null });
  };

  const saveLeave = async () => {
    if (!edit || edit.type !== 'leave') return;
    setBusy(true); setError('');
    try {
      const existingId = Number(edit.existing?.id ?? 0);
      if (existingId) {
        await updateLeaveRequestService(existingId, { leave_type: leaveType, note: note.trim() });
      } else {
        await createLeaveRequestService({
          slot_assignment: Number(edit.assignment?.id),
          leave_type: leaveType,
          note: note.trim(),
        });
      }
      setEdit(null); setNote('');
      await loadRoster();
    } catch (e) {
      setError(errorMessage(e, 'Unable to save leave request.'));
    } finally {
      setBusy(false);
    }
  };

  const cancelLeave = async () => {
    if (!edit || edit.type !== 'leave' || !edit.existing?.id) return;
    setBusy(true); setError('');
    try {
      await deleteLeaveRequestService(Number(edit.existing.id));
      setEdit(null); setNote('');
      await loadRoster();
    } catch (e) {
      setError(errorMessage(e, 'Unable to cancel leave request.'));
    } finally {
      setBusy(false);
    }
  };

  const coverPayload = (assignment: any) => ({
    pharmacy: pharmacyId,
    role: assignmentRole(assignment),
    slot_date: assignmentDate(assignment),
    start_time: assignmentStart(assignment),
    end_time: assignmentEnd(assignment),
    note: note.trim(),
  });

  const saveCover = async () => {
    if (!edit || edit.type !== 'cover' || !pharmacyId) return;
    setBusy(true); setError('');
    try {
      const payload = coverPayload(edit.assignment);
      const existingId = Number(edit.existing?.id ?? 0);
      if (existingId) await updateWorkerShiftRequestService(existingId, payload);
      else await createWorkerShiftRequestService(payload);
      setEdit(null); setNote('');
      await loadRoster();
    } catch (e) {
      setError(errorMessage(e, 'Unable to save cover request.'));
    } finally {
      setBusy(false);
    }
  };

  const cancelCover = async () => {
    if (!edit || edit.type !== 'cover' || !edit.existing?.id) return;
    setBusy(true); setError('');
    try {
      await deleteWorkerShiftRequestService(Number(edit.existing.id));
      setEdit(null); setNote('');
      await loadRoster();
    } catch (e) {
      setError(errorMessage(e, 'Unable to cancel cover request.'));
    } finally {
      setBusy(false);
    }
  };

  const claim = async () => {
    if (!edit || edit.type !== 'claim') return;
    const shiftId = Number(edit.shift?.id);
    const slotId = Number(edit.slot?.id);
    if (!shiftId || !slotId) return;
    setBusy(true); setError('');
    try {
      await claimShiftService({ shiftId, slotId });
      setEdit(null);
      await loadRoster();
    } catch (e) {
      setError(errorMessage(e, 'Unable to claim this open shift.'));
    } finally {
      setBusy(false);
    }
  };

  const pendingRequests = requests.filter((row) => String(row?.status || '').toUpperCase() === 'PENDING');
  const selectedPharmacy = pharmacies.find((row) => pharmacyIdOf(row) === pharmacyId);

  return (
    <ParityPage
      title="My roster"
      subtitle="Your pharmacy roster, shift-linked leave and cover requests, and open roster slots."
      loading={loading}
      error={error}
      onRetry={loadRoster}
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {pharmacies.length > 1 ? (
        <Section title="Pharmacy" description="Choose the pharmacy roster you want to review.">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {pharmacies.map((row) => {
              const id = pharmacyIdOf(row);
              return <Chip key={id} selected={id === pharmacyId} onPress={() => setPharmacyId(id)}>{pharmacyNameOf(row)}</Chip>;
            })}
          </View>
        </Section>
      ) : selectedPharmacy ? (
        <InfoNote title="Pharmacy">{pharmacyNameOf(selectedPharmacy)}</InfoNote>
      ) : null}

      <Section title="Week" description="The same weekly roster window used by the web workspace.">
        <Field label="Week starting (YYYY-MM-DD)" value={weekStart} onChangeText={setWeekStart} />
      </Section>

      <MetricGrid items={[
        { label: 'Assigned', value: assignments.length },
        { label: 'Open slots', value: openShifts.reduce((sum, shift) => sum + openShiftSlots(shift).length, 0), tone: openShifts.length ? 'warning' : 'success' },
        { label: 'Cover requests', value: pendingRequests.length, tone: pendingRequests.length ? 'warning' : 'success' },
      ]} />

      <Section title="My assigned shifts" description="Leave and cover requests are tied to the selected roster assignment, matching the web workflow.">
        {assignments.length ? assignments.map((row, index) => {
          const leave = assignmentLeave(row);
          const leaveStatus = String(leave?.status || '').toUpperCase();
          return (
            <View key={row.id ?? index} style={{ gap: 8 }}>
              <DataRow
                title={replaceUnderscore(assignmentRole(row))}
                subtitle={`${assignmentDate(row)} · ${assignmentStart(row)}–${assignmentEnd(row)}`}
                status={leave ? `Leave: ${replaceUnderscore(leaveStatus)}` : 'Assigned'}
              />
              <ActionButtons>
                <Button compact mode="outlined" onPress={() => openLeave(row)}>
                  {leave ? 'Manage leave' : 'Request leave'}
                </Button>
                <Button compact mode="outlined" onPress={() => openCover(row)}>
                  Request cover
                </Button>
              </ActionButtons>
            </View>
          );
        }) : <EmptyState title="No assigned shifts" body="You have no assigned roster shifts at this pharmacy for the selected week." />}
      </Section>

      <Section title="Open roster slots" description="Claim an unassigned slot at this pharmacy without leaving the roster context.">
        {openShifts.length ? openShifts.flatMap((shift) =>
          openShiftSlots(shift).map((slot: any) => (
            <DataRow
              key={`${shift.id}-${slot.id}`}
              title={replaceUnderscore(shift.roleNeeded ?? shift.role_needed ?? 'Open shift')}
              subtitle={`${slot.date ?? slot.slotDate ?? 'Date'} · ${slot.startTime ?? slot.start_time ?? '—'}–${slot.endTime ?? slot.end_time ?? '—'}`}
              status="Open"
              onPress={() => setEdit({ type: 'claim', shift, slot })}
            />
          ))
        ) : <EmptyState title="No open roster slots" body="There are no unassigned slots for this pharmacy and week." />}
      </Section>

      <Section title="Pending cover requests" description="Pending requests can be updated or cancelled until a manager acts on them.">
        {pendingRequests.length ? pendingRequests.map((request) => {
          const syntheticAssignment = {
            role: request.role,
            slotDate: request.slotDate ?? request.slot_date,
            startTime: request.startTime ?? request.start_time,
            endTime: request.endTime ?? request.end_time,
          };
          return (
            <DataRow
              key={request.id}
              title={replaceUnderscore(request.role || 'Cover request')}
              subtitle={`${request.slotDate ?? request.slot_date ?? ''} · ${request.startTime ?? request.start_time ?? ''}–${request.endTime ?? request.end_time ?? ''}`}
              status={replaceUnderscore(request.status || 'PENDING')}
              onPress={() => openCover(syntheticAssignment, request)}
            />
          );
        }) : <EmptyState title="No pending cover requests" body="Cover requests submitted from your assigned shifts will appear here." />}
      </Section>

      <Portal>
        <Dialog visible={edit?.type === 'leave'} onDismiss={() => !busy && setEdit(null)}>
          <Dialog.Title>{edit && edit.type === 'leave' && edit.existing ? 'Manage leave request' : 'Request leave'}</Dialog.Title>
          <Dialog.ScrollArea>
            <View style={{ padding: 18, gap: 14 }}>
              <ChoiceChips value={leaveType} options={LEAVE_TYPES} onChange={setLeaveType} disabled={busy} />
              <Field label="Note" value={note} onChangeText={setNote} multiline disabled={busy} />
              {edit?.type === 'leave' && edit.existing && String(edit.existing?.status || '').toUpperCase() !== 'PENDING'
                ? <InfoNote title="Request locked">Only pending leave requests can be changed or cancelled.</InfoNote>
                : null}
            </View>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            {edit?.type === 'leave' && edit.existing?.id && String(edit.existing?.status || '').toUpperCase() === 'PENDING'
              ? <Button textColor="#C53B47" disabled={busy} onPress={() => void cancelLeave()}>Cancel request</Button>
              : null}
            <Button disabled={busy} onPress={() => setEdit(null)}>Close</Button>
            <Button
              mode="contained"
              loading={busy}
              disabled={busy || (edit?.type === 'leave' && edit.existing && String(edit.existing?.status || '').toUpperCase() !== 'PENDING')}
              onPress={() => void saveLeave()}
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={edit?.type === 'cover'} onDismiss={() => !busy && setEdit(null)}>
          <Dialog.Title>{edit && edit.type === 'cover' && edit.existing ? 'Manage cover request' : 'Request cover'}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">Your current assignment stays in place until a manager approves a replacement.</Text>
            <View style={{ marginTop: 14 }}>
              <Field label="Note" value={note} onChangeText={setNote} multiline disabled={busy} />
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            {edit?.type === 'cover' && edit.existing?.id
              ? <Button textColor="#C53B47" disabled={busy} onPress={() => void cancelCover()}>Cancel request</Button>
              : null}
            <Button disabled={busy} onPress={() => setEdit(null)}>Close</Button>
            <Button mode="contained" loading={busy} disabled={busy} onPress={() => void saveCover()}>Save</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={edit?.type === 'claim'} onDismiss={() => !busy && setEdit(null)}>
          <Dialog.Title>Claim open roster slot?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">This uses the same claim action as the web roster and will assign the selected open slot if it is still available.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button disabled={busy} onPress={() => setEdit(null)}>Cancel</Button>
            <Button mode="contained" loading={busy} disabled={busy} onPress={() => void claim()}>Claim shift</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ParityPage>
  );
}
