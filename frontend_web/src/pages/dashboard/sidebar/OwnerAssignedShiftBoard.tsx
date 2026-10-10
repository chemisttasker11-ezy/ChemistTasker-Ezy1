import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Collapse, Pagination, Skeleton, Stack, Typography } from '@mui/material';
import {
  Building2,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  Clock,
  History,
  Lock,
  MapPin,
  Star,
  UserCheck,
  Users,
} from 'lucide-react';
import type { Shift, ShiftAssignment } from '@chemisttasker/shared-core';
import IconTile, { type Tone } from '../../../components/ui/IconTile';
import DashboardContentState from '../../../components/dashboard/DashboardContentState';
import { RowAction } from '../shiftCenter/ShiftCentreParts';
import { Hint } from '../../../components/ui/Hint';
import { InitialsAvatar } from '../../../components/ui/InitialsAvatar';
import { Pill } from '../../../components/ui/Pill';
import { humanizeEnum } from '../../../utils/labels';

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
  return `${start} – ${end}`;
};

const formatLockedRate = (slot: any) => {
  const rawRate = slot?.rate ?? slot?.hourlyRate ?? slot?.hourly_rate;
  if (rawRate == null || rawRate === '') return 'Rate locked';
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
  // Names and roles on the card; contact details live in View profile (owner rule: names, not emails).
  const role = user.role || member?.role || member?.employmentType || member?.employment_type;
  return role ? humanizeEnum(role) : 'Booked for this date';
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

export default function OwnerAssignedShiftBoard({
  emptyText,
  loading,
  mode,
  onRateAssigned,
  onViewAssigned,
  shifts,
  title,
}: Props) {
  const navigate = useNavigate();
  const itemsPerPage = 6;
  const [page, setPage] = useState(1);
  const [expandedShiftIds, setExpandedShiftIds] = useState<Record<number, boolean>>({});

  const visibleShifts = useMemo(
    () => shifts.slice((page - 1) * itemsPerPage, page * itemsPerPage),
    [page, shifts]
  );
  const pageCount = Math.ceil(shifts.length / itemsPerPage);

  const toggleShift = (shiftId: number) => {
    setExpandedShiftIds((prev) => ({
      ...prev,
      [shiftId]: !prev[shiftId],
    }));
  };

  if (loading) {
    return (
      <Stack spacing={2.5} role="status" aria-label={`Loading ${title.toLowerCase()}`}>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} variant="rounded" height={196} sx={{ borderRadius: 'var(--ct-card-radius)' }} />
        ))}
      </Stack>
    );
  }

  if (!shifts.length) {
    return (
      <DashboardContentState
        kind="empty"
        icon={mode === 'history' ? <History /> : <CalendarCheck />}
        title={mode === 'history' ? 'No past shifts yet' : 'No confirmed shifts yet'}
        description={emptyText}
        actionLabel={mode === 'history' ? 'See confirmed shifts' : 'See active shifts'}
        onAction={() => navigate(mode === 'history' ? '../confirmed' : '../active', { relative: 'path' })}
      />
    );
  }

  return (
    <Stack spacing={2.5}>
      {visibleShifts.map((shift) => {
        const shiftAny = shift as any;
        const assignedEntries = getAssignedEntries(shift);
        const slotEntries = mode === 'history' ? getSlotEntries(shift) : assignedEntries.map((entry) => ({ ...entry, assigned: true }));
        const totalSlots = (shift.slots ?? []).length;
        const interests = shiftAny.interestedUsersCount ?? shiftAny.interested_users_count ?? 0;
        const location = shift.uiAddressLine ?? shiftAny.ui_address_line ?? shift.pharmacyDetail?.streetAddress ?? '';
        const isExpanded = Boolean(expandedShiftIds[shift.id]);
        const roleLabel = shift.roleLabel ?? shift.roleNeeded ?? shiftAny.role_needed;
        const metrics: Array<{ label: string; value: number; icon: React.ReactNode; tone: Tone; hint: string }> = [
          { label: 'Slots', value: totalSlots, icon: <CalendarDays />, tone: 'violet', hint: 'Dates in this shift.' },
          { label: 'Assigned', value: assignedEntries.length, icon: <UserCheck />, tone: 'magenta', hint: mode === 'history' ? 'Dates that had someone booked.' : 'Dates with a confirmed, booked person.' },
          { label: 'Interested', value: interests, icon: <Users />, tone: 'cyan', hint: 'People who showed interest while the shift was open.' },
        ];

        return (
          <Box
            key={shift.id}
            component="article"
            onClick={() => toggleShift(shift.id)}
            sx={{
              borderRadius: 'var(--ct-card-radius)',
              border: '1px solid',
              borderColor: isExpanded ? 'var(--ct-tone-violet-bg)' : 'var(--ct-border-color)',
              bgcolor: 'var(--ct-surface-bg)',
              overflow: 'hidden',
              cursor: 'pointer',
              boxShadow: isExpanded ? '0 14px 36px rgba(6, 18, 58, 0.08)' : 'none',
              transition: 'box-shadow 160ms ease, border-color 160ms ease',
              '&:hover': { boxShadow: '0 10px 28px rgba(6, 18, 58, 0.07)', borderColor: 'var(--ct-tone-violet-bg)' },
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          >
            <Box
              sx={{
                p: { xs: 2, md: 3 },
                pb: { xs: 2, md: 2.5 },
                display: 'grid',
                gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) auto' },
                gap: { xs: 2, lg: 3 },
                alignItems: 'center',
              }}
            >
              <Stack direction="row" spacing={2} sx={{ minWidth: 0 }}>
                <IconTile icon={<Building2 />} tone="violet" size={48} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography component="h3" sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: { xs: 18, sm: 20 }, color: 'var(--ct-text-primary)', lineHeight: 1.25, overflowWrap: 'anywhere' }}>
                    {shift.pharmacyDetail?.name ?? 'Unknown Pharmacy'}
                  </Typography>
                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                    {roleLabel && <Pill tone="navy" label={humanizeEnum(roleLabel)} />}
                    {shift.employmentType && <Pill outlined label={humanizeEnum(shift.employmentType)} />}
                    {shift.uiIsUrgent && <Pill tone="red" label="Urgent" />}
                  </Stack>
                  {location && (
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1.25, color: 'var(--ct-text-secondary)', '& svg': { width: 15, height: 15, flexShrink: 0 } }}>
                      <MapPin />
                      <Typography sx={{ fontSize: 13.5, color: 'inherit', overflowWrap: 'anywhere' }}>{location}</Typography>
                    </Stack>
                  )}
                </Box>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, width: { xs: '100%', lg: 408 } }}>
                {metrics.map((item) => (
                  <Hint key={item.label} title={`${item.value} ${item.label.toLowerCase()}`} body={item.hint}>
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0, p: { xs: 1, sm: 1.25 }, borderRadius: '14px', border: '1px solid var(--ct-border-color)', cursor: 'help' }}>
                      <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                        <IconTile icon={item.icon} tone={item.tone} size={36} />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 22, lineHeight: 1.05, color: 'var(--ct-text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                          {item.value}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: 'var(--ct-text-secondary)' }}>{item.label}</Typography>
                      </Box>
                    </Stack>
                  </Hint>
                ))}
              </Box>
            </Box>

            <Stack
              direction="row"
              spacing={1.25}
              alignItems="center"
              justifyContent="space-between"
              sx={{ px: { xs: 2, md: 3 }, py: 1.25, borderTop: '1px solid var(--ct-border-color)', bgcolor: 'var(--ct-subtle-bg)' }}
            >
              <Pill
                tone={mode === 'history' ? 'neutral' : 'green'}
                icon={mode === 'history' ? <History /> : <CalendarCheck />}
                label={mode === 'history'
                  ? `Completed · ${assignedEntries.length} of ${totalSlots} ${totalSlots === 1 ? 'date' : 'dates'} booked`
                  : `Confirmed · ${assignedEntries.length} ${assignedEntries.length === 1 ? 'date' : 'dates'} booked`}
              />
              <Button
                size="small"
                color="inherit"
                aria-expanded={isExpanded}
                aria-controls={`assigned-shift-details-${shift.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleShift(shift.id);
                }}
                endIcon={<ChevronDown style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
                sx={{ minHeight: 36, px: 1.5, borderRadius: '10px', color: 'var(--ct-accent-strong)', fontWeight: 600, '&:hover': { bgcolor: 'var(--ct-tone-violet-bg)' }, '& .MuiButton-endIcon svg': { width: 16, height: 16 } }}
              >
                {isExpanded ? 'Hide dates' : mode === 'history' ? 'View dates' : 'View booked dates'}
              </Button>
            </Stack>

            <Collapse in={isExpanded} timeout="auto" unmountOnExit onClick={(event) => event.stopPropagation()}>
              <Box id={`assigned-shift-details-${shift.id}`} sx={{ px: { xs: 2, md: 3 }, py: { xs: 2.5, md: 3 }, borderTop: '1px solid var(--ct-border-color)', cursor: 'default' }}>
                <Typography component="h4" sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 17, color: 'var(--ct-text-primary)' }}>
                  {mode === 'history' ? 'Shift dates' : 'Booked dates'}
                </Typography>
                <Typography sx={{ fontSize: 13, color: 'var(--ct-text-secondary)', mb: 1.75 }}>
                  {mode === 'history'
                    ? 'Every past date. Booked ones keep the profile and rating actions.'
                    : 'Dates with a paid, confirmed booking.'}
                </Typography>

                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 1.5 }}>
                  {slotEntries.map(({ slot, userId, assigned, assignment }) => {
                    const dateBits = formatDateLabel(slot?.date);
                    const assignedMember = getAssignedMember(shift, userId);
                    const assignedName = getAssignedName(assignment, assignedMember);
                    const assignedDetails = getAssignedDetails(assignment, assignedMember);
                    const lockedRate = formatLockedRate(slot);
                    return (
                      <Box
                        key={`${shift.id}_${slot?.id}`}
                        sx={{ p: 1.75, borderRadius: '14px', border: '1px solid var(--ct-border-color)', bgcolor: 'var(--ct-surface-bg)', minWidth: 0 }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                          <Box>
                            <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--ct-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              {dateBits.day}
                            </Typography>
                            <Typography sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 18, color: 'var(--ct-text-primary)', lineHeight: 1.2 }}>
                              {dateBits.date}
                            </Typography>
                          </Box>
                          <Pill
                            tone={assigned ? (mode === 'history' ? 'neutral' : 'green') : 'amber'}
                            label={assigned ? (mode === 'history' ? 'Worked' : 'Booked') : 'Not filled'}
                          />
                        </Stack>
                        <Box
                          component="span"
                          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 1, px: 1, py: 0.35, borderRadius: '999px', bgcolor: 'var(--ct-tone-violet-bg)', color: 'var(--ct-tone-violet-fg)', fontSize: 12, fontWeight: 600, '& svg': { width: 13, height: 13 } }}
                        >
                          <Clock />
                          {formatTimeRange(slot)}
                        </Box>

                        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid var(--ct-border-color)' }}>
                          {assigned ? (
                            <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ minWidth: 0 }}>
                              <InitialsAvatar name={assignedName} tone={mode === 'history' ? 'magenta' : 'violet'} />
                              <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--ct-text-primary)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {assignedName}
                                </Typography>
                                <Typography sx={{ fontSize: 12.5, color: 'var(--ct-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {assignedDetails}
                                </Typography>
                                <Hint title="Rate locked" body="The agreed rate for this date is fixed and can no longer be changed.">
                                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5, width: 'fit-content', cursor: 'help', color: 'var(--ct-text-primary)', '& svg': { width: 13, height: 13, color: 'var(--ct-text-secondary)' } }}>
                                    <Lock />
                                    <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'inherit' }}>{lockedRate}</Typography>
                                  </Stack>
                                </Hint>
                              </Box>
                            </Stack>
                          ) : (
                            <Typography sx={{ fontSize: 13, color: 'var(--ct-text-muted)' }}>No one was booked for this date.</Typography>
                          )}
                        </Box>

                        {assigned && (
                          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
                            <RowAction kind="primary" onClick={() => onViewAssigned(shift.id, slot?.id ?? null, userId as number)}>
                              View profile
                            </RowAction>
                            {mode === 'history' && onRateAssigned && (
                              <RowAction kind="secondary" startIcon={<Star />} onClick={() => onRateAssigned(userId as number)}>
                                Rate
                              </RowAction>
                            )}
                          </Stack>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            </Collapse>
          </Box>
        );
      })}

      {pageCount > 1 && (
        <Box display="flex" justifyContent="center" mt={1}>
          <Pagination
            count={pageCount}
            page={page}
            onChange={(_, value) => {
              setPage(value);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            color="primary"
          />
        </Box>
      )}
    </Stack>
  );
}
