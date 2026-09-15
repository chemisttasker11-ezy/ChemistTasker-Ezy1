import React, { useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  Collapse,
  Pagination,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import Groups2RoundedIcon from '@mui/icons-material/Groups2Rounded';
import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import AssignmentIndRoundedIcon from '@mui/icons-material/AssignmentIndRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import type { Shift, ShiftAssignment } from '@chemisttasker/shared-core';

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

const palette = {
  surface: '#FFFFFF',
  page: 'linear-gradient(180deg, #F6FBFF 0%, #F8FAFC 46%, #FFFFFF 100%)',
  border: '#D9E2F2',
  text: '#0F172A',
  muted: '#64748B',
  violet: '#7C3AED',
  violetSoft: '#F3E8FF',
  cyan: '#06B6D4',
  cyanSoft: '#ECFEFF',
  emerald: '#10B981',
  emeraldSoft: '#ECFDF5',
  amber: '#F59E0B',
  amberSoft: '#FFFBEB',
};

const statCardSx = {
  borderRadius: 3,
  border: `1px solid ${palette.border}`,
  background: '#FFFFFFCC',
  minWidth: 0,
  width: '100%',
  px: { xs: 1.25, sm: 2 },
  py: { xs: 1.25, sm: 1.75 },
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: { xs: 0.75, sm: 1.25 },
};

const actionButtonSx = {
  borderRadius: 999,
  textTransform: 'none',
  fontWeight: 700,
  px: 1.75,
};

const primaryButtonSx = {
  ...actionButtonSx,
  color: '#fff',
  background: 'linear-gradient(135deg, #8B5CF6 0%, #2563EB 100%)',
  '&:hover': {
    background: 'linear-gradient(135deg, #7C3AED 0%, #1D4ED8 100%)',
  },
};

const secondaryButtonSx = {
  ...actionButtonSx,
  borderColor: '#BAE6FD',
  color: '#0F172A',
  backgroundColor: '#fff',
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
    day: parsed.toLocaleDateString(undefined, { weekday: 'short' }),
    date: parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
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

const StatCard = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) => (
  <Paper elevation={0} sx={statCardSx}>
    <Avatar sx={{ width: { xs: 30, sm: 36 }, height: { xs: 30, sm: 36 }, bgcolor: palette.violetSoft, color: palette.violet }}>
      {icon}
    </Avatar>
    <Box sx={{ minWidth: 0, textAlign: 'center' }}>
      <Typography variant="h6" sx={{ fontWeight: 800, color: palette.text, lineHeight: 1.05, fontSize: { xs: '1.2rem', sm: '1.5rem' } }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: palette.muted, textTransform: 'uppercase', letterSpacing: { xs: 0.2, sm: 0.6 }, fontSize: { xs: '0.62rem', sm: '0.75rem' } }}>
        {label}
      </Typography>
    </Box>
  </Paper>
);

export default function OwnerAssignedShiftBoard({
  emptyText,
  loading,
  mode,
  onRateAssigned,
  onViewAssigned,
  shifts,
  title,
}: Props) {
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
      <Box sx={{ display: 'grid', gap: 2.5 }}>
        {[...Array(3)].map((_, index) => (
          <Paper
            key={index}
            sx={{
              p: 3,
              borderRadius: 5,
              border: `1px solid ${palette.border}`,
              background: palette.surface,
            }}
          >
            <Skeleton variant="text" width="42%" height={34} />
            <Skeleton variant="text" width="24%" height={22} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5, mt: 2 }}>
              {[...Array(3)].map((__, slotIndex) => (
                <Skeleton key={slotIndex} variant="rounded" height={144} />
              ))}
            </Box>
          </Paper>
        ))}
      </Box>
    );
  }

  if (!shifts.length) {
    return (
      <Paper
        sx={{
          p: 5,
          textAlign: 'center',
          borderRadius: 5,
          border: `1px solid ${palette.border}`,
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 800, color: palette.text, mb: 1 }}>
          {title}
        </Typography>
        <Typography sx={{ color: palette.muted }}>{emptyText}</Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      {visibleShifts.map((shift) => {
        const shiftAny = shift as any;
        const assignedEntries = getAssignedEntries(shift);
        const slotEntries = mode === 'history' ? getSlotEntries(shift) : assignedEntries.map((entry) => ({ ...entry, assigned: true }));
        const totalSlots = (shift.slots ?? []).length;
        const interests = shiftAny.interestedUsersCount ?? shiftAny.interested_users_count ?? 0;
        const location = shift.uiAddressLine ?? shiftAny.ui_address_line ?? shift.pharmacyDetail?.streetAddress ?? '';
        const modeChip = mode === 'history'
          ? { label: 'Completed', fg: palette.amber, bg: palette.amberSoft }
          : { label: 'Assigned', fg: palette.emerald, bg: palette.emeraldSoft };
        const isExpanded = Boolean(expandedShiftIds[shift.id]);

        return (
          <Paper
            key={shift.id}
            elevation={0}
            role="button"
            tabIndex={0}
            aria-expanded={isExpanded}
            onClick={() => toggleShift(shift.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleShift(shift.id);
              }
            }}
            sx={{
              p: { xs: 2, md: 3 },
              borderRadius: 6,
              border: `1px solid ${palette.border}`,
              background: palette.page,
              overflow: 'hidden',
              position: 'relative',
              cursor: 'pointer',
              transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
              '&:hover': {
                transform: 'translateY(-1px)',
                boxShadow: '0 18px 42px rgba(15,23,42,.08)',
                borderColor: '#C7D2FE',
              },
              '&:focus-visible': {
                outline: '3px solid rgba(124,58,237,.28)',
                outlineOffset: 3,
              },
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                background: 'radial-gradient(circle at top right, rgba(37,99,235,.10), transparent 32%), radial-gradient(circle at top left, rgba(124,58,237,.10), transparent 28%)',
              }}
            />

            <Stack spacing={2} sx={{ position: 'relative' }}>
              <Stack
                direction={{ xs: 'column', xl: 'row' }}
                justifyContent="space-between"
                spacing={2}
                alignItems={{ xs: 'stretch', xl: 'flex-start' }}
              >
                <Stack spacing={1.5} sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar
                      variant="rounded"
                      sx={{
                        width: 58,
                        height: 58,
                        borderRadius: 3.5,
                        background: 'linear-gradient(135deg, #5EEAD4 0%, #7C3AED 100%)',
                        boxShadow: '0 18px 40px rgba(124,58,237,.24)',
                      }}
                    >
                      <AssignmentIndRoundedIcon />
                    </Avatar>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="h5" sx={{ fontWeight: 900, color: palette.text, lineHeight: 1.05 }}>
                        {shift.pharmacyDetail?.name ?? 'Unknown Pharmacy'}
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
                        <Chip
                          size="small"
                          label={shift.roleLabel ?? shift.roleNeeded ?? shiftAny.role_needed ?? 'Role'}
                          sx={{ bgcolor: palette.emeraldSoft, color: palette.emerald, fontWeight: 800 }}
                        />
                        {shift.employmentType && (
                          <Chip
                            size="small"
                            label={String(shift.employmentType).replace('_', ' ')}
                            sx={{ bgcolor: '#E0F2FE', color: '#0369A1', fontWeight: 800 }}
                          />
                        )}
                        {shift.uiIsUrgent && (
                          <Chip
                            size="small"
                            label="Urgent"
                            sx={{ bgcolor: '#FEE2E2', color: '#DC2626', fontWeight: 800 }}
                          />
                        )}
                      </Stack>
                    </Box>
                  </Stack>

                  {location && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <LocationOnOutlinedIcon sx={{ fontSize: 18, color: palette.muted }} />
                      <Typography variant="body2" sx={{ color: palette.muted }}>
                        {location}
                      </Typography>
                    </Stack>
                  )}
                </Stack>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: { xs: 0.75, sm: 1.25 },
                    width: '100%',
                    maxWidth: { xs: '100%', xl: 520 },
                    alignSelf: { xs: 'stretch', xl: 'flex-end' },
                  }}
                >
                  <StatCard icon={<CalendarMonthRoundedIcon fontSize="small" />} label="Slots" value={totalSlots} />
                  <StatCard icon={<Groups2RoundedIcon fontSize="small" />} label="Assigned" value={assignedEntries.length} />
                  <StatCard icon={<FavoriteBorderRoundedIcon fontSize="small" />} label="Interests" value={interests} />
                </Box>
              </Stack>

              <Collapse in={isExpanded} timeout="auto" unmountOnExit onClick={(event) => event.stopPropagation()}>
                <Box
                  sx={{
                    pt: 2.5,
                    borderTop: `1px solid ${palette.border}`,
                    position: 'relative',
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                    <Typography variant="h6" sx={{ fontWeight: 900, color: palette.text }}>
                      {mode === 'history' ? 'Shift Slot Grid' : 'Assigned Slot Grid'}
                    </Typography>
                    <Chip
                      size="small"
                      label={modeChip.label}
                      sx={{ bgcolor: modeChip.bg, color: modeChip.fg, fontWeight: 800 }}
                    />
                  </Stack>

                  <Typography variant="body2" sx={{ color: palette.muted, mb: 2.25 }}>
                    {mode === 'history'
                      ? 'All past slots are shown. Assigned ones keep profile and rating actions.'
                      : 'Focused on paid and assigned chemists only.'}
                  </Typography>

                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }, gap: 1.75 }}>
                    {slotEntries.map(({ slot, userId, assigned, assignment }) => {
                      const dateBits = formatDateLabel(slot?.date);
                      const assignedMember = getAssignedMember(shift, userId);
                      const assignedName = getAssignedName(assignment, assignedMember);
                      const assignedDetails = getAssignedDetails(assignment, assignedMember);
                      const lockedRate = formatLockedRate(slot);
                      return (
                        <Paper
                          key={`${shift.id}_${slot?.id}`}
                          elevation={0}
                          sx={{
                            p: 2,
                            borderRadius: 4,
                            border: `1px solid ${assigned ? (mode === 'history' ? '#FDE68A' : '#C7D2FE') : palette.border}`,
                            background: assigned
                              ? (mode === 'history'
                                ? 'linear-gradient(180deg, #FFFFFF 0%, #FFFBEB 100%)'
                                : 'linear-gradient(180deg, #FFFFFF 0%, #EFF6FF 100%)')
                              : 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
                            cursor: assigned ? 'pointer' : 'default',
                            transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
                            '&:hover': assigned ? {
                              transform: 'translateY(-2px)',
                              boxShadow: '0 16px 30px rgba(15,23,42,.10)',
                              borderColor: mode === 'history' ? '#F59E0B' : '#6366F1',
                            } : undefined,
                          }}
                          onClick={assigned ? () => onViewAssigned(shift.id, slot?.id ?? null, userId as number) : undefined}
                        >
                          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                            <Box>
                              <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.7 }}>
                                {dateBits.day}
                              </Typography>
                              <Typography variant="h6" sx={{ color: palette.text, fontWeight: 900, lineHeight: 1.1 }}>
                                {dateBits.date}
                              </Typography>
                            </Box>
                            <Stack spacing={0.75} alignItems="flex-end">
                              <Chip
                                size="small"
                                label={assigned ? 'Assigned' : 'Open'}
                                sx={{
                                  bgcolor: assigned
                                    ? (mode === 'history' ? palette.amberSoft : palette.cyanSoft)
                                    : '#E2E8F0',
                                  color: assigned
                                    ? (mode === 'history' ? palette.amber : palette.cyan)
                                    : palette.muted,
                                  fontWeight: 800,
                                }}
                              />
                              <Avatar sx={{ width: 36, height: 36, bgcolor: assigned ? (mode === 'history' ? palette.amberSoft : palette.cyanSoft) : '#E2E8F0', color: assigned ? (mode === 'history' ? palette.amber : palette.cyan) : palette.muted }}>
                                <PersonRoundedIcon fontSize="small" />
                              </Avatar>
                            </Stack>
                          </Stack>

                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.25 }}>
                            <AccessTimeRoundedIcon sx={{ fontSize: 16, color: palette.violet }} />
                            <Typography variant="body2" sx={{ color: palette.violet, fontWeight: 800 }}>
                              {formatTimeRange(slot)}
                            </Typography>
                          </Stack>

                          <Paper
                            elevation={0}
                            sx={{
                              mt: 1.75,
                              p: 1.5,
                              borderRadius: 3,
                              border: `1px solid ${palette.border}`,
                              background: '#FFFFFFD9',
                            }}
                          >
                            <Typography variant="body2" sx={{ color: palette.text, fontWeight: 800 }}>
                              {assigned ? assignedName : 'Unassigned Slot'}
                            </Typography>
                            {assigned ? (
                              <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                                <Typography variant="caption" sx={{ color: palette.muted }}>
                                  {assignedDetails}
                                </Typography>
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                  <LockRoundedIcon sx={{ fontSize: 14, color: mode === 'history' ? palette.amber : palette.cyan }} />
                                  <Typography variant="caption" sx={{ color: palette.text, fontWeight: 800 }}>
                                    {lockedRate}
                                  </Typography>
                                </Stack>
                              </Stack>
                            ) : (
                              <Typography variant="caption" sx={{ color: palette.muted }}>
                                No one was assigned to this slot
                              </Typography>
                            )}
                          </Paper>

                          <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1.75 }}>
                            {assigned ? (
                              <Button
                                variant="contained"
                                size="small"
                                sx={primaryButtonSx}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onViewAssigned(shift.id, slot?.id ?? null, userId as number);
                                }}
                              >
                                View Assigned
                              </Button>
                            ) : (
                              <Button
                                variant="outlined"
                                size="small"
                                sx={secondaryButtonSx}
                                disabled
                              >
                                No Assignment
                              </Button>
                            )}
                            {assigned && mode === 'history' && onRateAssigned && (
                              <Button
                                variant="outlined"
                                size="small"
                                sx={secondaryButtonSx}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onRateAssigned(userId as number);
                                }}
                              >
                                Rate Chemist
                              </Button>
                            )}
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Box>
                </Box>
              </Collapse>
            </Stack>
          </Paper>
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
    </Box>
  );
}
