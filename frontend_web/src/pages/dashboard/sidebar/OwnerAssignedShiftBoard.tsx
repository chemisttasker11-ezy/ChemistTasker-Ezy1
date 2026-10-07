import { useMemo, useState } from 'react';
import { Box, Button, Collapse, Divider, Pagination, Paper, Stack, Typography } from '@mui/material';
import { ExpandMoreRounded } from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { formatShiftLabel, getShiftJourneyStatus, getShiftSearchText, type Shift, type ShiftAssignment } from '@chemisttasker/shared-core';
import { ShiftAudienceChip, ShiftEmptyState, ShiftListLoading, ShiftListToolbar, ShiftStatusChip } from '../shiftCenter/ShiftJourneyUI';
import { getShiftSummary } from './ActiveShiftsPage/utils/shiftHelpers';

type AssignmentLike = ShiftAssignment | { slot_id?: number; user_id?: number; user?: any };

type Props = {
  emptyText: string;
  loading: boolean;
  mode: 'confirmed' | 'history';
  onRateAssigned?: (userId: number) => void;
  onViewAssigned: (shiftId: number, slotId: number | null, userId: number) => void;
  shifts: Shift[];
  title: string;
};

const getAssignmentSlotId = (assignment: AssignmentLike): number | null =>
  'slotId' in assignment ? assignment.slotId ?? null : assignment.slot_id ?? null;

const getAssignmentUserId = (assignment: AssignmentLike): number | null =>
  'userId' in assignment ? assignment.userId ?? null : assignment.user_id ?? null;

const formatDateLabel = (rawDate?: string | null) => {
  if (!rawDate) return { day: 'TBD', date: '--' };
  const parsed = new Date(`${rawDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return { day: 'TBD', date: rawDate };
  return {
    day: parsed.toLocaleDateString('en-AU', { weekday: 'short' }),
    date: parsed.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
  };
};

const formatClockTime = (rawTime?: string | null) => {
  if (!rawTime) return '--';
  const [hour, minute] = String(rawTime).split(':');
  return hour && minute ? `${hour}:${minute}` : String(rawTime);
};

const formatTimeRange = (slot: any) => {
  const start = formatClockTime(slot?.startTime ?? slot?.start_time);
  const end = formatClockTime(slot?.endTime ?? slot?.end_time);
  return `${start} - ${end}`;
};

const formatLockedRate = (slot: any) => {
  const rawRate = slot?.rate ?? slot?.hourlyRate ?? slot?.hourly_rate;
  if (rawRate == null || rawRate === '') return 'Rate not provided';
  const numeric = Number(rawRate);
  const value = Number.isFinite(numeric)
    ? numeric.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : String(rawRate);
  return `$${value}/hr locked`;
};

const getAssignedMember = (shift: Shift, userId?: number | null) => {
  if (userId == null) return null;
  const members = ((shift as any).assignedMembers ?? (shift as any).assigned_members ?? []) as any[];
  return members.find((member) => Number(member.userId ?? member.user_id) === Number(userId)) ?? null;
};

const getAssignedName = (assignment?: AssignmentLike | null, member?: any) => {
  const user = (assignment as any)?.user ?? {};
  const firstName = user.firstName ?? user.first_name ?? '';
  const lastName = user.lastName ?? user.last_name ?? '';
  const fullName = `${firstName} ${lastName}`.trim();
  const memberFirstName = member?.userFirstName ?? member?.user_first_name ?? '';
  const memberLastName = member?.userLastName ?? member?.user_last_name ?? '';
  const memberFullName = `${memberFirstName} ${memberLastName}`.trim();
  return fullName || user.name || user.displayName || memberFullName || member?.name || user.email || 'Assigned candidate';
};

const getAssignedDetails = (assignment?: AssignmentLike | null, member?: any) => {
  const user = (assignment as any)?.user ?? {};
  return user.email || user.phoneNumber || user.phone_number || member?.role || member?.employmentType || member?.employment_type || 'Profile locked to this slot';
};

const getAssignedEntries = (shift: Shift) => {
  const assignments = ((shift as any).slotAssignments ?? (shift as any).slot_assignments ?? []) as AssignmentLike[];
  const slots = (shift.slots ?? []) as any[];
  const firstAssignedUserId = assignments.length > 0 ? getAssignmentUserId(assignments[0]) : null;

  if (shift.singleUserOnly) {
    return slots
      .map((slot) => ({
        slot,
        userId: firstAssignedUserId,
        assignment: assignments[0] ?? null,
      }))
      .filter((entry) => entry.userId != null);
  }

  return slots
    .map((slot) => {
      const assignment = assignments.find((entry) => getAssignmentSlotId(entry) === slot.id);
      return {
        slot,
        userId: assignment ? getAssignmentUserId(assignment) : null,
        assignment: assignment ?? null,
      };
    })
    .filter((entry) => entry.userId != null);
};

const getSlotEntries = (shift: Shift) => {
  const assignments = ((shift as any).slotAssignments ?? (shift as any).slot_assignments ?? []) as AssignmentLike[];
  const slots = (shift.slots ?? []) as any[];
  const firstAssignedUserId = assignments.length > 0 ? getAssignmentUserId(assignments[0]) : null;

  if (shift.singleUserOnly) {
    return slots.map((slot) => ({
      slot,
      userId: firstAssignedUserId,
      assignment: assignments[0] ?? null,
      assigned: firstAssignedUserId != null,
    }));
  }

  return slots.map((slot) => {
    const assignment = assignments.find((entry) => getAssignmentSlotId(entry) === slot.id);
    const userId = assignment ? getAssignmentUserId(assignment) : null;
    return {
      slot,
      userId,
      assignment: assignment ?? null,
      assigned: userId != null,
    };
  });
};

export default function OwnerAssignedShiftBoard({ emptyText, loading, mode, onRateAssigned, onViewAssigned, shifts, title }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') ?? '';
  const [page, setPage] = useState(1);
  const [expandedShiftIds, setExpandedShiftIds] = useState<Record<number, boolean>>({});
  const itemsPerPage = 6;
  const filtered = useMemo(() => shifts.filter((shift) => getShiftSearchText(shift).includes(search.trim().toLowerCase())), [shifts, search]);
  const pageCount = Math.ceil(filtered.length / itemsPerPage);
  const currentPage = Math.min(page, Math.max(1, pageCount));
  const visibleShifts = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const onSearch = (value: string) => {
    setPage(1);
    setSearchParams((previous) => { const next = new URLSearchParams(previous); if (value) next.set('q', value); else next.delete('q'); return next; }, { replace: true });
  };
  if (loading) return <ShiftListLoading />;
  if (!shifts.length) return <ShiftEmptyState title={emptyText} description={mode === 'confirmed'
    ? 'Confirmed assignments will appear here after the candidate and any required payment are finalised.'
    : 'Past shifts will appear here with their assignment details and feedback actions.'} />;
  return <Stack spacing={2.5}>
    <ShiftListToolbar search={search} onSearch={onSearch} count={filtered.length} total={shifts.length} />
    {!filtered.length && <ShiftEmptyState filtered title={title} description="" onReset={() => onSearch('')} />}
    {visibleShifts.map((shift) => {
      const entries = mode === 'history' ? getSlotEntries(shift) : getAssignedEntries(shift).map((entry) => ({ ...entry, assigned: true }));
      const assignedCount = entries.filter((entry) => entry.assigned).length;
      const isExpanded = Boolean(expandedShiftIds[shift.id]);
      const status = getShiftJourneyStatus(shift, { section: mode });
      return <Paper component="article" key={shift.id} aria-labelledby={`assigned-shift-${shift.id}`} elevation={0}
        sx={{ p: { xs: 2, md: 3 }, border: '1px solid', borderColor: 'divider', borderRadius: 3, minWidth: 0 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
          <Box sx={{ minWidth: 0 }}>
            <Typography color="text.secondary" variant="body2">Shift #{shift.id}</Typography>
            <Typography id={`assigned-shift-${shift.id}`} component="h3" variant="h6" fontWeight={700} sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>{shift.pharmacyDetail?.name ?? shift.pharmacyName ?? 'Pharmacy'}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{shift.roleLabel ?? formatShiftLabel(shift.roleNeeded)} · {formatShiftLabel(shift.employmentType)}</Typography>
            <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1} sx={{ my: 1.5 }}><ShiftStatusChip status={status} /><ShiftAudienceChip shift={shift} /></Stack>
            <Typography variant="body2">{getShiftSummary(shift)}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{assignedCount} assigned slot{assignedCount === 1 ? '' : 's'}{mode === 'history' ? ` · ${entries.length - assignedCount} unfilled` : ''}</Typography>
          </Box>
          <Button variant="outlined" onClick={() => setExpandedShiftIds((previous) => ({ ...previous, [shift.id]: !previous[shift.id] }))}
            aria-expanded={isExpanded} aria-controls={`assignments-${shift.id}`} endIcon={<ExpandMoreRounded sx={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }} />}
            sx={{ minHeight: 44, alignSelf: { xs: 'stretch', md: 'center' }, flexShrink: 0 }}>{isExpanded ? 'Hide details' : mode === 'history' ? 'View past slots' : 'View assignments'}</Button>
        </Stack>
        <Collapse in={isExpanded} unmountOnExit>
          <Box id={`assignments-${shift.id}`} sx={{ mt: 2.5, pt: 2.5, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography component="h4" variant="subtitle1" fontWeight={700}>{mode === 'history' ? 'Past slots and feedback' : 'Confirmed assignments'}</Typography>
            {!entries.length && <Typography color="text.secondary" sx={{ mt: 1 }}>No slot details are available for this post.</Typography>}
            <Stack divider={<Divider />}>
              {entries.map(({ slot, assignment, assigned, userId }) => {
                const dateBits = formatDateLabel(slot?.date);
                const member = getAssignedMember(shift, userId);
                return <Stack key={`${shift.id}-${slot?.id}`} direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ py: 2.5 }} alignItems={{ md: 'center' }}>
                  <Box sx={{ minWidth: { md: 160 } }}><Typography fontWeight={600}>{dateBits.day} {dateBits.date}</Typography><Typography variant="body2" color="text.secondary">{formatTimeRange(slot)}</Typography></Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{assigned ? getAssignedName(assignment, member) : 'Unfilled slot'}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{assigned ? getAssignedDetails(assignment, member) : 'No team member was assigned.'}</Typography>
                    {assigned && <Typography variant="body2" color="text.secondary">{formatLockedRate(slot)}</Typography>}
                  </Box>
                  {assigned && <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1}>
                    <Button variant="outlined" onClick={() => onViewAssigned(shift.id, slot?.id ?? null, userId as number)} sx={{ minHeight: 44 }}>View profile</Button>
                    {mode === 'history' && onRateAssigned && <Button variant="contained" onClick={() => onRateAssigned(userId as number)} sx={{ minHeight: 44 }}>Rate team member</Button>}
                  </Stack>}
                </Stack>;
              })}
            </Stack>
          </Box>
        </Collapse>
      </Paper>;
    })}
    {pageCount > 1 && <Pagination aria-label="Shift pages" count={pageCount} page={currentPage} onChange={(_, value) => setPage(value)} />}
  </Stack>;
}
