import React, { useState, useMemo } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import moment from 'moment';
import { rosterV2 } from '@chemisttasker/shared-core';
import { BRAND_COLORS, BRAND_FONTS, BRAND_SHADOWS } from '../../constants/brandTheme';
import { type RosterGridViewsProps, getRoleStyle } from './RosterGridViews.model';
import RosterStackedDayView from './RosterStackedDayView';
export type { StaffShiftItem, StaffMemberSummary, StackedShiftItem, DayStackedBucket, RosterGridViewsProps } from './RosterGridViews.model';

export default function RosterGridViews({
  viewMode,
  staffViewData,
  stackedViewData,
  weekStart,
  periodId,
  pharmacyId,
  vacantSlots = [],
  onRosterUpdated,
  isPublished = false,
}: RosterGridViewsProps) {
  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Drag and Drop State
  const [draggedShift, setDraggedShift] = useState<{
    slotId: number;
    assignmentId?: number;
    sourceDate: string;
    sourceWorkerId?: number | null;
    role: string;
  } | null>(null);

  const [dragOverCell, setDragOverCell] = useState<{
    workerId: number | null; // null = open shifts row
    date: string;
  } | null>(null);

  // Dropdown Action Menu State
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [activeShift, setActiveShift] = useState<{
    slotId: number;
    assignmentId?: number;
    date: string;
    workerId?: number | null;
    workerName?: string;
    role: string;
    startTime: string;
    endTime: string;
  } | null>(null);

  // Modals for Single-Pointer Move & Reassign Operations (WCAG 2.2 AA)
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [targetWorkerId, setTargetWorkerId] = useState<number | ''>('');

  const [moveDayModalOpen, setMoveDayModalOpen] = useState(false);
  const [targetDayDate, setTargetDayDate] = useState<string>('');

  const [quickAddModalOpen, setQuickAddModalOpen] = useState(false);
  const [quickAddWorkerId, setQuickAddWorkerId] = useState<number | ''>('');
  const [quickAddDate, setQuickAddDate] = useState<string>('');
  const [quickAddRole, setQuickAddRole] = useState<string>('PHARMACIST');
  const [quickAddStartTime, setQuickAddStartTime] = useState('09:00');
  const [quickAddEndTime, setQuickAddEndTime] = useState('17:00');

  // Loading & Feedback State
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 1. Generate the 7 Days of the Week (Mon - Sun)
  const weekDays = useMemo(() => {
    const days: Array<{
      dateStr: string;
      dayShort: string;
      dayMonth: string;
      dayNumber: string;
      isToday: boolean;
      momentObj: moment.Moment;
    }> = [];

    const start = moment(weekStart);
    for (let i = 0; i < 7; i++) {
      const d = moment(start).add(i, 'days');
      days.push({
        dateStr: d.format('YYYY-MM-DD'),
        dayShort: d.format('ddd').toUpperCase(),
        dayMonth: d.format('MMM D'),
        dayNumber: d.format('D'),
        isToday: d.isSame(moment(), 'day'),
        momentObj: d,
      });
    }
    return days;
  }, [weekStart]);

  // 2. Filter Staff Members
  const filteredStaff = useMemo(() => {
    return staffViewData.filter((staff) => {
      const matchesSearch = staff.worker_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = roleFilter === 'ALL' || (staff.role || '').toUpperCase() === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [staffViewData, searchTerm, roleFilter]);

  // 3. Unassigned / Vacant Shifts Grouped by Date
  const vacantShiftsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    weekDays.forEach((d) => {
      map[d.dateStr] = [];
    });

    vacantSlots.forEach((slot) => {
      const d = String(slot.date);
      if (map[d]) {
        map[d].push(slot);
      }
    });
    return map;
  }, [vacantSlots, weekDays]);

  // 4. Calculate Daily Total Hours across all staff
  const dailyTotalHours = useMemo(() => {
    const map: Record<string, number> = {};
    weekDays.forEach((d) => {
      map[d.dateStr] = 0;
    });

    staffViewData.forEach((staff) => {
      staff.shifts.forEach((shift) => {
        if (map[shift.date] !== undefined) {
          map[shift.date] += Number(shift.hours || 0);
        }
      });
    });
    return map;
  }, [staffViewData, weekDays]);

  // 5. Total scheduled hours for entire week
  const grandTotalWeeklyHours = useMemo(() => {
    return Object.values(dailyTotalHours).reduce((acc, curr) => acc + curr, 0);
  }, [dailyTotalHours]);

  // Total assignments count
  const totalAssignedCount = useMemo(() => {
    return staffViewData.reduce((acc, s) => acc + s.total_shifts, 0);
  }, [staffViewData]);

  // =========================================================================
  // Core Mutation: Execute Atomic Shift Move or Reassignment
  // =========================================================================
  const canEditSlot = (slotId: number) => {
    const item = staffViewData.flatMap((staff) => staff.shifts).find((shift) => shift.slot_id === slotId)
      ?? vacantSlots.find((slot) => slot.slot_id === slotId);
    return !isPublished && item?.editable === true;
  };

  const ensureDraftPeriod = async () => {
    if (isPublished) throw new Error('This roster is read-only.');
    if (periodId) return periodId;
    if (!pharmacyId) throw new Error('Select a pharmacy first.');
    const response = await rosterV2.initializePeriod(pharmacyId, weekStart);
    return response.period_id as number;
  };

  const executeMoveShift = async (
    slotId: number,
    targetDate: string,
    targetUserId: number | null | undefined
  ) => {
    if (!canEditSlot(slotId)) return;

    setIsActionLoading(true);
    try {
      await rosterV2.bulkEdit(await ensureDraftPeriod(), [
          {
            action: 'move_shift',
            slot_id: slotId,
            target_date: targetDate,
            target_user_id: targetUserId === undefined ? undefined : (targetUserId ?? 0),
          },
        ]);
      setFeedback({ type: 'success', text: 'Shift successfully moved and updated!' });
      onRosterUpdated?.();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.error || err?.message || 'Failed to move shift. Please verify roster status.',
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Delete a slot
  const executeDeleteSlot = async (slotId: number) => {
    if (!canEditSlot(slotId)) return;
    setIsActionLoading(true);
    try {
      await rosterV2.bulkEdit(await ensureDraftPeriod(), [{ action: 'delete_slot', slot_id: slotId }]);
      setFeedback({ type: 'success', text: 'Shift slot deleted.' });
      onRosterUpdated?.();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.error || err?.message || 'Failed to delete shift slot.',
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // Quick Add Shift
  const executeQuickAddShift = async () => {
    if (!quickAddDate || !quickAddStartTime || !quickAddEndTime) {
      setFeedback({ type: 'error', text: 'Please provide complete shift details.' });
      return;
    }

    setIsActionLoading(true);
    try {
      await rosterV2.bulkEdit(await ensureDraftPeriod(), [
          {
            action: 'create_shift',
            date: quickAddDate,
            start_time: quickAddStartTime,
            end_time: quickAddEndTime,
            role: quickAddRole,
            user_id: quickAddWorkerId || undefined,
          },
        ]);
      setFeedback({ type: 'success', text: 'Shift created successfully.' });
      setQuickAddModalOpen(false);
      onRosterUpdated?.();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err.response?.data?.error || err?.message || 'Failed to create shift.',
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  // =========================================================================
  // Drag & Drop Handlers
  // =========================================================================
  const handleDragStart = (e: React.DragEvent, shiftData: any) => {
    if (!canEditSlot(shiftData.slotId)) { e.preventDefault(); return; }
    setDraggedShift(shiftData);
    e.dataTransfer.setData('text/plain', JSON.stringify(shiftData));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, workerId: number | null, date: string) => {
    if (isPublished) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCell?.workerId !== workerId || dragOverCell?.date !== date) {
      setDragOverCell({ workerId, date });
    }
  };

  const handleDragLeave = () => {
    setDragOverCell(null);
  };

  const handleDrop = async (e: React.DragEvent, targetWorkerId: number | null, targetDate: string) => {
    if (isPublished) return;
    e.preventDefault();
    setDragOverCell(null);

    if (!draggedShift) return;

    // Same cell drop
    if (draggedShift.sourceDate === targetDate && draggedShift.sourceWorkerId === targetWorkerId) {
      setDraggedShift(null);
      return;
    }

    await executeMoveShift(draggedShift.slotId, targetDate, targetWorkerId);
    setDraggedShift(null);
  };

  // =========================================================================
  // Dropdown Menu Handlers
  // =========================================================================
  const handleOpenMenu = (e: React.MouseEvent<HTMLElement>, shiftData: any) => {
    e.stopPropagation();
    if (!canEditSlot(shiftData.slotId)) return;
    setMenuAnchorEl(e.currentTarget);
    setActiveShift(shiftData);
  };

  const handleCloseMenu = () => {
    setMenuAnchorEl(null);
  };

  const openReassignDialog = () => {
    if (activeShift) {
      setTargetWorkerId(activeShift.workerId || '');
      setReassignModalOpen(true);
    }
    handleCloseMenu();
  };

  const openMoveDayDialog = () => {
    if (activeShift) {
      setTargetDayDate(activeShift.date);
      setMoveDayModalOpen(true);
    }
    handleCloseMenu();
  };

  const handleConfirmReassign = async () => {
    if (!activeShift) return;
    await executeMoveShift(
      activeShift.slotId,
      activeShift.date,
      targetWorkerId === '' ? null : Number(targetWorkerId)
    );
    setReassignModalOpen(false);
  };

  const handleConfirmMoveDay = async () => {
    if (!activeShift || !targetDayDate) return;
    await executeMoveShift(activeShift.slotId, targetDayDate, activeShift.workerId);
    setMoveDayModalOpen(false);
  };

  const handleDeleteActiveShift = async () => {
    if (!activeShift) return;
    handleCloseMenu();
    await executeDeleteSlot(activeShift.slotId);
  };

  const openQuickAdd = (date: string, workerId?: number, defaultRole?: string) => {
    setQuickAddDate(date);
    setQuickAddWorkerId(workerId || '');
    setQuickAddRole(defaultRole || 'PHARMACIST');
    setQuickAddStartTime('09:00');
    setQuickAddEndTime('17:00');
    setQuickAddModalOpen(true);
  };

  return (
    <Box sx={{ mt: 2, width: '100%' }}>
      {/* 1. Header Toolbar & Metric Badges */}
      <Card
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          bgcolor: BRAND_COLORS.white,
          border: `1px solid ${BRAND_COLORS.border}`,
          borderRadius: '12px',
          boxShadow: BRAND_SHADOWS.card,
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'center' }}
          gap={2}
        >
          {/* Left: Summary Metrics */}
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <Box>
              <Typography
                variant="h6"
                sx={{
                  fontFamily: BRAND_FONTS.heading,
                  fontWeight: 700,
                  color: BRAND_COLORS.navy,
                  fontSize: 18,
                  letterSpacing: '-0.01em',
                }}
              >
                {viewMode === 'STACKED' ? 'Daily staffing plan' : 'Weekly staff schedule'}
              </Typography>
              <Typography variant="body2" sx={{ color: BRAND_COLORS.body, fontSize: 13 }}>
                {viewMode === 'STACKED' ? 'Review coverage by day and edit draft shifts.' : 'Drag or use shift actions to reassign and change dates.'}
              </Typography>
            </Box>

            <Chip
              icon={<PersonIcon sx={{ fontSize: 15 }} />}
              label={`${staffViewData.length} Staff`}
              size="small"
              sx={{ bgcolor: BRAND_COLORS.purpleLight, color: BRAND_COLORS.purple, fontWeight: 700 }}
            />
            <Chip
              icon={<AccessTimeIcon sx={{ fontSize: 15 }} />}
              label={`${grandTotalWeeklyHours.toFixed(1)}h Total`}
              size="small"
              sx={{ bgcolor: BRAND_COLORS.blueLight, color: BRAND_COLORS.blueText, fontWeight: 700 }}
            />
            <Chip
              label={`${totalAssignedCount} Assigned`}
              size="small"
              sx={{ bgcolor: BRAND_COLORS.cyanLight, color: '#075B71', fontWeight: 700 }}
            />
            {vacantSlots.length > 0 && (
              <Chip
                label={`${vacantSlots.length} Open`}
                size="small"
                sx={{ bgcolor: '#FEF3C7', color: '#7B4800', fontWeight: 700 }}
              />
            )}
          </Stack>

          {/* Right: Search & Role Filters */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <TextField
              size="small"
              label="Search team members"
              placeholder="Name"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: BRAND_COLORS.body, fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
              sx={{
                width: { xs: '100%', sm: 220 },
                bgcolor: BRAND_COLORS.mist,
                borderRadius: '8px',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: BRAND_COLORS.border },
              }}
            />

            <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 150 }, width: { xs: '100%', sm: 'auto' } }}>
              <Select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                displayEmpty
                sx={{
                  bgcolor: BRAND_COLORS.mist,
                  borderRadius: '8px',
                  fontSize: 13,
                  fontWeight: 600,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: BRAND_COLORS.border },
                }}
              >
                <MenuItem value="ALL">All Roles</MenuItem>
                <MenuItem value="PHARMACIST">Pharmacists</MenuItem>
                <MenuItem value="INTERN">Interns</MenuItem>
                <MenuItem value="TECHNICIAN">Technicians</MenuItem>
                <MenuItem value="ASSISTANT">Assistants</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Stack>
      </Card>


      {/* A day-by-day manager planner replaces the wide weekly matrix on small screens.
          Mutations continue through the same validated draft-only handlers as desktop. */}
      <Box component="section" aria-label="Mobile weekly roster" sx={{ display: viewMode === 'STAFF' ? { xs: 'block', lg: 'none' } : 'none', mt: 1.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h3" sx={{ color: '#06123A', fontSize: 18, fontWeight: 800 }}>Daily schedule</Typography>
            <Typography sx={{ color: '#445474', fontSize: 13, mt: 0.4 }}>Select a day to see shifts and staffing gaps.</Typography>
          </Box>
          <Chip size="small" label={isPublished ? 'Published' : 'Draft'} sx={{ bgcolor: isPublished ? '#E8F7F0' : '#FFF4DB', color: isPublished ? '#086046' : '#7B4800', fontWeight: 800, flexShrink: 0 }} />
        </Stack>
        <Stack spacing={1.5}>
          {weekDays.map((day) => {
            const dayVacancies = (vacantShiftsByDate[day.dateStr] || []).filter((slot) => roleFilter === 'ALL' || slot.role_needed === roleFilter);
            const dayAssignments = filteredStaff.flatMap((staff) => staff.shifts
              .filter((shift) => shift.date === day.dateStr)
              .map((shift) => ({ staff, shift })))
              .sort((a, b) => a.shift.start_time.localeCompare(b.shift.start_time));
            return (
              <Paper key={day.dateStr} component="article" variant="outlined" sx={{ borderColor: day.isToday ? '#BFADE7' : '#E0E7F1', borderRadius: '12px', boxShadow: 'none', overflow: 'hidden' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ p: 1.75, bgcolor: day.isToday ? '#F2EDFC' : '#F8FAFE' }}>
                  <Box>
                    <Typography component="h4" sx={{ color: '#06123A', fontSize: 15, fontWeight: 800 }}>{day.momentObj.format('dddd D MMM')}</Typography>
                    <Typography sx={{ color: '#445474', fontSize: 12.5 }}>{dayAssignments.length} assigned · {dayVacancies.length} open</Typography>
                  </Box>
                  <Button
                    variant="outlined" size="small" startIcon={<AddIcon />}
                    disabled={isPublished || !pharmacyId}
                    onClick={() => openQuickAdd(day.dateStr)}
                    sx={{ minHeight: 44, px: 1.5, borderColor: '#CDBBE9', color: '#5222B8', textTransform: 'none', fontWeight: 800 }}
                    aria-label={'Add draft shift on ' + day.momentObj.format('dddd D MMM')}
                  >
                    Add
                  </Button>
                </Stack>
                {dayVacancies.length === 0 && dayAssignments.length === 0 ? (
                  <Typography sx={{ p: 2, color: '#445474', fontSize: 14 }}>No scheduled shifts for this day.</Typography>
                ) : (
                  <Stack spacing={0} sx={{ px: 1.75, pb: 1 }}>
                    {dayVacancies.map((slot) => (
                      <Stack key={'vacant-' + slot.slot_id} direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ py: 1.5, borderBottom: '1px solid #EDF1F7' }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ color: '#7B4800', fontWeight: 800, fontSize: 13.5 }}>{(slot.role_needed || 'Team member').replaceAll('_', ' ')} · Unassigned</Typography>
                          <Typography sx={{ color: '#445474', fontSize: 13 }}>{String(slot.start_time || '').slice(0, 5)} – {String(slot.end_time || '').slice(0, 5)}</Typography>
                        </Box>
                        <Button size="small" disabled={!canEditSlot(slot.slot_id)}
                          onClick={(event) => handleOpenMenu(event, {
                            slotId: slot.slot_id, date: day.dateStr, workerId: null,
                            role: slot.role_needed, startTime: slot.start_time, endTime: slot.end_time,
                          })}
                          sx={{ color: '#5222B8', minHeight: 44, flexShrink: 0, textTransform: 'none', fontWeight: 800 }}>
                          Assign
                        </Button>
                      </Stack>
                    ))}
                    {dayAssignments.map(({ staff, shift }) => (
                      <Stack key={staff.worker_id + '-' + shift.assignment_id} direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ py: 1.5, borderBottom: '1px solid #EDF1F7' }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ color: '#06123A', fontWeight: 800, fontSize: 14, overflowWrap: 'anywhere' }}>{staff.worker_name}</Typography>
                          <Typography sx={{ color: '#445474', fontSize: 12.5 }}>
                            {(shift.role || 'Staff').replaceAll('_', ' ')} · {shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)} · {shift.hours.toFixed(1)}h
                          </Typography>
                        </Box>
                        {canEditSlot(shift.slot_id) ? (
                          <Button size="small" onClick={(event) => handleOpenMenu(event, {
                            slotId: shift.slot_id, assignmentId: shift.assignment_id, date: shift.date,
                            workerId: staff.worker_id, workerName: staff.worker_name,
                            role: shift.role, startTime: shift.start_time, endTime: shift.end_time,
                          })}
                            sx={{ color: '#5222B8', minHeight: 44, flexShrink: 0, textTransform: 'none', fontWeight: 800 }}>
                            Edit
                          </Button>
                        ) : (
                          <Typography sx={{ color: '#52617C', fontSize: 12, fontWeight: 750, flexShrink: 0 }}>View only</Typography>
                        )}
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Paper>
            );
          })}
        </Stack>
      </Box>

      {viewMode === 'STACKED' && (
        <RosterStackedDayView
          weekStart={weekStart}
          days={stackedViewData}
          isPublished={isPublished}
          pharmacyId={pharmacyId ?? null}
          canEditSlot={canEditSlot}
          onAdd={(date) => openQuickAdd(date)}
          onEdit={handleOpenMenu}
        />
      )}

      {/* 2. Horizontal 7-Day Matrix Table (Tanda / Roubler / RosterElf Standard) */}
      <TableContainer
        component={Paper}
        elevation={0}
        sx={{
          borderRadius: '12px',
          border: `1px solid ${BRAND_COLORS.border}`,
          boxShadow: BRAND_SHADOWS.card,
          maxWidth: '100%',
          overflowX: 'auto',
          display: viewMode === 'STAFF' ? { xs: 'none', lg: 'block' } : 'none',
          bgcolor: BRAND_COLORS.white,
        }}
      >
        <Table sx={{ minWidth: 1100, borderCollapse: 'separate' }}>
          {/* Table Header Row: Staff Pinned Left + 7 Days of Week */}
          <TableHead>
            <TableRow sx={{ bgcolor: BRAND_COLORS.mist }}>
              {/* Sticky Staff Column Header */}
              <TableCell
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                  bgcolor: BRAND_COLORS.mist,
                  width: 220,
                  minWidth: 220,
                  fontWeight: 700,
                  fontFamily: BRAND_FONTS.heading,
                  color: BRAND_COLORS.navy,
                  borderRight: `2px solid ${BRAND_COLORS.border}`,
                  py: 1.5,
                  px: 2,
                }}
              >
                Team Member
              </TableCell>

              {/* 7 Horizontal Day Columns (Mon - Sun) */}
              {weekDays.map((day) => (
                <TableCell
                  key={day.dateStr}
                  align="center"
                  sx={{
                    width: 'calc((100% - 220px) / 7)',
                    minWidth: 130,
                    py: 1.5,
                    px: 1,
                    borderRight: `1px solid ${BRAND_COLORS.border}`,
                    bgcolor: day.isToday ? BRAND_COLORS.purpleLight : BRAND_COLORS.mist,
                  }}
                >
                  <Stack spacing={0.5} alignItems="center">
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 800,
                          fontSize: 12,
                          color: day.isToday ? BRAND_COLORS.purple : BRAND_COLORS.navy,
                          letterSpacing: 0.5,
                        }}
                      >
                        {day.dayShort}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          fontSize: 12,
                          color: day.isToday ? BRAND_COLORS.purple : BRAND_COLORS.body,
                        }}
                      >
                        {day.dayMonth}
                      </Typography>
                    </Stack>

                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Chip
                        label={`${(dailyTotalHours[day.dateStr] || 0).toFixed(1)}h`}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: 10,
                          fontWeight: 700,
                          bgcolor: day.isToday ? BRAND_COLORS.purple : BRAND_COLORS.white,
                          color: day.isToday ? 'white' : BRAND_COLORS.body,
                          border: `1px solid ${BRAND_COLORS.border}`,
                        }}
                      />
                      {day.isToday && (
                        <Chip
                          label="TODAY"
                          size="small"
                          sx={{
                            height: 16,
                            fontSize: 9,
                            fontWeight: 800,
                            bgcolor: BRAND_COLORS.purple,
                            color: 'white',
                          }}
                        />
                      )}
                    </Stack>
                  </Stack>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {/* ============================================================= */}
            {/* Row 1: Unassigned / Open Shifts Row (Pinned at Top) */}
            {/* ============================================================= */}
            <TableRow
              sx={{
                bgcolor: '#FFFDF5',
                borderBottom: `2px solid ${BRAND_COLORS.border}`,
              }}
            >
              {/* Left Pinned Cell */}
              <TableCell
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  bgcolor: '#FFFDF5',
                  borderRight: `2px solid ${BRAND_COLORS.border}`,
                  p: 1.5,
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Avatar
                    sx={{
                      width: 32,
                      height: 32,
                      bgcolor: '#FEF3C7',
                      color: '#A15C07',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    <EventBusyIcon sx={{ fontSize: 18 }} />
                  </Avatar>
                  <Box>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 700, color: '#B45309', fontSize: 13 }}
                    >
                      Open / Vacant Shifts
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#A15C07', fontWeight: 600 }}>
                      {vacantSlots.length} Unassigned
                    </Typography>
                  </Box>
                </Stack>
              </TableCell>

              {/* 7 Days of Open Shifts */}
              {weekDays.map((day) => {
                const dayVacancies = vacantShiftsByDate[day.dateStr] || [];
                const isDragOver = dragOverCell?.workerId === null && dragOverCell?.date === day.dateStr;

                return (
                  <TableCell
                    key={day.dateStr}
                    onDragOver={(e) => handleDragOver(e, null, day.dateStr)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, null, day.dateStr)}
                    sx={{
                      p: 1,
                      verticalAlign: 'top',
                      borderRight: `1px solid ${BRAND_COLORS.border}`,
                      bgcolor: isDragOver ? '#FEF3C7' : 'inherit',
                      outline: isDragOver ? '2px dashed #D97706' : 'none',
                      transition: 'background-color 0.15s, outline 0.15s',
                    }}
                  >
                    {dayVacancies.length === 0 ? (
                      <Box sx={{ minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="caption" aria-label="No open shifts" sx={{ color: 'var(--ct-text-muted)', fontSize: 11 }}>
                          —
                        </Typography>
                      </Box>
                    ) : (
                      <Stack spacing={1}>
                        {dayVacancies.map((slot) => {
                          const roleStyle = getRoleStyle(slot.role_needed);
                          const timeStr = `${(slot.start_time || '').slice(0, 5)} - ${(slot.end_time || '').slice(0, 5)}`;

                          return (
                            <Paper
                              key={slot.slot_id}
                              draggable={canEditSlot(slot.slot_id)}
                              onDragStart={(e) =>
                                handleDragStart(e, {
                                  slotId: slot.slot_id,
                                  sourceDate: day.dateStr,
                                  sourceWorkerId: null,
                                  role: slot.role_needed,
                                })
                              }
                              elevation={0}
                              sx={{
                                p: 1,
                                borderRadius: '8px',
                                border: '1.5px dashed #F59E0B',
                                bgcolor: '#FFFBEB',
                                cursor: canEditSlot(slot.slot_id) ? 'grab' : 'default',
                                transition: 'all 0.15s',
                                '&:hover': {
                                  boxShadow: '0 2px 8px rgba(217, 119, 6, 0.15)',
                                  borderColor: '#D97706',
                                },
                              }}
                            >
                              <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Chip
                                  label={slot.role_needed}
                                  size="small"
                                  sx={{
                                    height: 18,
                                    fontSize: 9,
                                    fontWeight: 800,
                                    bgcolor: roleStyle.bg,
                                    color: roleStyle.text,
                                  }}
                                />
                                <IconButton
                                  size="small"
                                  onClick={(e) =>
                                    handleOpenMenu(e, {
                                      slotId: slot.slot_id,
                                      date: day.dateStr,
                                      workerId: null,
                                      role: slot.role_needed,
                                      startTime: slot.start_time,
                                      endTime: slot.end_time,
                                    })
                                  }
                                  sx={{ p: 0.25, color: '#D97706' }}
                                >
                                  <MoreVertIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Stack>

                              <Typography
                                variant="caption"
                                sx={{
                                  display: 'block',
                                  fontWeight: 700,
                                  color: '#78350F',
                                  fontSize: 11,
                                  mt: 0.5,
                                }}
                              >
                                {timeStr}
                              </Typography>

                              {/* Quick Assign Dropdown Action */}
                              <Button
                                size="small"
                                variant="text"
                                startIcon={<PersonAddIcon sx={{ fontSize: 13 }} />}
                                onClick={(e) =>
                                  handleOpenMenu(e, {
                                    slotId: slot.slot_id,
                                    date: day.dateStr,
                                    workerId: null,
                                    role: slot.role_needed,
                                    startTime: slot.start_time,
                                    endTime: slot.end_time,
                                  })
                                }
                                sx={{
                                  mt: 0.5,
                                  p: 0,
                                  fontSize: 10,
                                  color: '#B45309',
                                  fontWeight: 700,
                                  textTransform: 'none',
                                  minWidth: 0,
                                }}
                              >
                                Assign to...
                              </Button>
                            </Paper>
                          );
                        })}
                      </Stack>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>

            {/* ============================================================= */}
            {/* Rows 2 to N: Team Member Rows */}
            {/* ============================================================= */}
            {filteredStaff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                  <Typography variant="body1" sx={{ color: BRAND_COLORS.body, fontWeight: 500 }}>
                    No team members match your filter.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredStaff.map((staff) => {
                const staffInitials = staff.worker_name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);

                const staffRoleStyle = getRoleStyle(staff.role);
                const isOvertime = staff.total_hours > 38.0;

                return (
                  <TableRow
                    key={staff.worker_id}
                    hover
                    sx={{
                      '&:hover td': { bgcolor: 'rgba(245, 248, 252, 0.6)' },
                    }}
                  >
                    {/* Left Sticky Team Member Cell */}
                    <TableCell
                      sx={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 2,
                        bgcolor: BRAND_COLORS.white,
                        borderRight: `2px solid ${BRAND_COLORS.border}`,
                        p: 1.5,
                      }}
                    >
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Avatar
                          sx={{
                            width: 34,
                            height: 34,
                            fontSize: 12,
                            fontWeight: 800,
                            bgcolor: staffRoleStyle.bg,
                            color: staffRoleStyle.text,
                            border: `1.5px solid ${staffRoleStyle.border}`,
                          }}
                        >
                          {staffInitials}
                        </Avatar>

                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography
                            variant="subtitle2"
                            noWrap
                            sx={{
                              fontWeight: 700,
                              color: BRAND_COLORS.navy,
                              fontSize: 13,
                              fontFamily: BRAND_FONTS.body,
                            }}
                          >
                            {staff.worker_name}
                          </Typography>

                          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
                            <Chip
                              label={staff.role || 'Staff'}
                              size="small"
                              sx={{
                                height: 16,
                                fontSize: 9,
                                fontWeight: 700,
                                bgcolor: staffRoleStyle.bg,
                                color: staffRoleStyle.text,
                              }}
                            />
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: isOvertime ? BRAND_COLORS.error : BRAND_COLORS.body,
                              }}
                            >
                              {staff.total_hours.toFixed(1)}h
                            </Typography>
                          </Stack>
                        </Box>
                      </Stack>
                    </TableCell>

                    {/* 7 Days of Shift Cells for this Team Member */}
                    {weekDays.map((day) => {
                      const dayShifts = staff.shifts.filter((s) => s.date === day.dateStr);
                      const isDragOver =
                        dragOverCell?.workerId === staff.worker_id && dragOverCell?.date === day.dateStr;

                      return (
                        <TableCell
                          key={day.dateStr}
                          onDragOver={(e) => handleDragOver(e, staff.worker_id, day.dateStr)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, staff.worker_id, day.dateStr)}
                          sx={{
                            p: 1,
                            verticalAlign: 'top',
                            borderRight: `1px solid ${BRAND_COLORS.border}`,
                            bgcolor: isDragOver ? BRAND_COLORS.purpleLight : 'inherit',
                            outline: isDragOver ? `2px dashed ${BRAND_COLORS.purple}` : 'none',
                            position: 'relative',
                            '&:hover .add-shift-btn': { opacity: 1 },
                          }}
                        >
                          {dayShifts.length === 0 ? (
                            /* Empty Cell: Droppable & Hover-to-Add */
                            <Box
                              sx={{
                                minHeight: 48,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '6px',
                                transition: 'background-color 0.15s',
                              }}
                            >
                              {!isPublished && (
                                <IconButton
                                  size="small"
                                  className="add-shift-btn"
                                  onClick={() => openQuickAdd(day.dateStr, staff.worker_id, staff.role)}
                                  sx={{
                                    opacity: 0,
                                    color: BRAND_COLORS.purple,
                                    bgcolor: BRAND_COLORS.purpleLight,
                                    transition: 'opacity 0.2s',
                                    '&:hover': { bgcolor: BRAND_COLORS.purple, color: 'white' },
                                    width: 28,
                                    height: 28,
                                  }}
                                >
                                  <AddIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              )}
                            </Box>
                          ) : (
                            /* Assigned Shift Cards */
                            <Stack spacing={0.8}>
                              {dayShifts.map((shift) => {
                                const roleStyle = getRoleStyle(shift.role);
                                const timeStr = `${(shift.start_time || '').slice(0, 5)} - ${(shift.end_time || '').slice(0, 5)}`;

                                return (
                                  <Paper
                                    key={shift.assignment_id || shift.slot_id}
                                    draggable={canEditSlot(shift.slot_id)}
                                    onDragStart={(e) =>
                                      handleDragStart(e, {
                                        slotId: shift.slot_id,
                                        assignmentId: shift.assignment_id,
                                        sourceDate: shift.date,
                                        sourceWorkerId: staff.worker_id,
                                        role: shift.role,
                                      })
                                    }
                                    elevation={0}
                                    sx={{
                                      p: 1,
                                      borderRadius: '8px',
                                      border: `1px solid ${BRAND_COLORS.border}`,
                                      borderLeft: `4px solid ${roleStyle.border}`,
                                      bgcolor: BRAND_COLORS.white,
                                      boxShadow: '0 2px 6px rgba(6, 33, 74, 0.04)',
                                      cursor: canEditSlot(shift.slot_id) ? 'grab' : 'default',
                                      transition: 'all 0.15s ease',
                                      '&:hover': {
                                        boxShadow: '0 4px 12px rgba(6, 33, 74, 0.08)',
                                        borderColor: BRAND_COLORS.borderHover,
                                      },
                                    }}
                                  >
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                      <Chip
                                        label={shift.role}
                                        size="small"
                                        sx={{
                                          height: 16,
                                          fontSize: 9,
                                          fontWeight: 800,
                                          bgcolor: roleStyle.bg,
                                          color: roleStyle.text,
                                        }}
                                      />

                                      {!isPublished && (
                                        <IconButton
                                          size="small"
                                          onClick={(e) =>
                                            handleOpenMenu(e, {
                                              slotId: shift.slot_id,
                                              assignmentId: shift.assignment_id,
                                              date: shift.date,
                                              workerId: staff.worker_id,
                                              workerName: staff.worker_name,
                                              role: shift.role,
                                              startTime: shift.start_time,
                                              endTime: shift.end_time,
                                            })
                                          }
                                          sx={{ p: 0.25, color: BRAND_COLORS.body }}
                                        >
                                          <MoreVertIcon sx={{ fontSize: 16 }} />
                                        </IconButton>
                                      )}
                                    </Stack>

                                    <Typography
                                      variant="caption"
                                      sx={{
                                        display: 'block',
                                        fontWeight: 700,
                                        color: BRAND_COLORS.navy,
                                        fontSize: 11,
                                        mt: 0.5,
                                      }}
                                    >
                                      {timeStr}
                                    </Typography>

                                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.25 }}>
                                      <Typography variant="caption" sx={{ fontSize: 10, color: BRAND_COLORS.body, fontWeight: 600 }}>
                                        {shift.hours.toFixed(1)} hrs
                                      </Typography>

                                      {!isPublished && (
                                        <Tooltip title="Drag to reorder or reassign">
                                          <DragIndicatorIcon sx={{ fontSize: 14, color: '#94A3B8' }} />
                                        </Tooltip>
                                      )}
                                    </Stack>
                                  </Paper>
                                );
                              })}
                            </Stack>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            )}

            {/* ============================================================= */}
            {/* Row N+1: Summary Footer Row (Daily Totals) */}
            {/* ============================================================= */}
            <TableRow sx={{ bgcolor: BRAND_COLORS.mist, borderTop: `2px solid ${BRAND_COLORS.border}` }}>
              <TableCell
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  bgcolor: BRAND_COLORS.mist,
                  fontWeight: 800,
                  fontFamily: BRAND_FONTS.heading,
                  color: BRAND_COLORS.navy,
                  borderRight: `2px solid ${BRAND_COLORS.border}`,
                  py: 1.5,
                  px: 2,
                  fontSize: 13,
                }}
              >
                Daily Scheduled Hours
              </TableCell>

              {weekDays.map((day) => (
                <TableCell key={day.dateStr} align="center" sx={{ py: 1.5, borderRight: `1px solid ${BRAND_COLORS.border}` }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: BRAND_COLORS.navy, fontSize: 12 }}>
                    {(dailyTotalHours[day.dateStr] || 0).toFixed(1)} hrs
                  </Typography>
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      {/* =================================================================== */}
      {/* DROPDOWN MENU: Reassign / Move / Delete Options */}
      {/* =================================================================== */}
      <Menu anchorEl={menuAnchorEl} open={Boolean(menuAnchorEl)} onClose={handleCloseMenu} elevation={4}>
        <MenuItem onClick={openReassignDialog}>
          <ListItemIcon>
            <SwapHorizIcon fontSize="small" sx={{ color: BRAND_COLORS.purple }} />
          </ListItemIcon>
          <ListItemText primary="Reassign Team Member..." secondary="Change worker or unassign" />
        </MenuItem>

        <MenuItem onClick={openMoveDayDialog}>
          <ListItemIcon>
            <CalendarMonthIcon fontSize="small" sx={{ color: BRAND_COLORS.blue }} />
          </ListItemIcon>
          <ListItemText primary="Move to Another Day..." secondary="Change scheduled weekday" />
        </MenuItem>

        <Divider />

        <MenuItem onClick={handleDeleteActiveShift} sx={{ color: BRAND_COLORS.error }}>
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" sx={{ color: BRAND_COLORS.error }} />
          </ListItemIcon>
          <ListItemText primary="Delete Shift" />
        </MenuItem>
      </Menu>

      {/* =================================================================== */}
      {/* MODAL 1: Select / Drop Option to Staff (WCAG 2.2 AA Alternative) */}
      {/* =================================================================== */}
      <Dialog open={reassignModalOpen} onClose={() => setReassignModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontFamily: BRAND_FONTS.heading, color: BRAND_COLORS.navy }}>
          Reassign Shift
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: BRAND_COLORS.body, mb: 2 }}>
            Select the team member who will work this shift, or move it to open shifts.
          </Typography>

          <FormControl fullWidth size="small">
            <InputLabel>Assigned Team Member</InputLabel>
            <Select
              value={targetWorkerId}
              label="Assigned Team Member"
              onChange={(e) => setTargetWorkerId(e.target.value as any)}
            >
              <MenuItem value="">
                <em>Unassigned (Move to Open Shifts)</em>
              </MenuItem>
              {staffViewData.map((staff) => (
                <MenuItem key={staff.worker_id} value={staff.worker_id}>
                  {staff.worker_name} ({staff.role || 'Staff'}) — {staff.total_hours.toFixed(1)}h
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setReassignModalOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleConfirmReassign}
            disabled={isActionLoading}
            sx={{ bgcolor: BRAND_COLORS.purple, '&:hover': { bgcolor: BRAND_COLORS.purpleHover } }}
          >
            {isActionLoading ? <CircularProgress size={20} color="inherit" /> : 'Confirm Reassignment'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* =================================================================== */}
      {/* MODAL 2: Move Shift to Another Day */}
      {/* =================================================================== */}
      <Dialog open={moveDayModalOpen} onClose={() => setMoveDayModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontFamily: BRAND_FONTS.heading, color: BRAND_COLORS.navy }}>
          Move Shift to Day
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: BRAND_COLORS.body, mb: 2 }}>
            Choose which day of the week to reschedule this shift to:
          </Typography>

          <FormControl fullWidth size="small">
            <InputLabel>Target Day</InputLabel>
            <Select
              value={targetDayDate}
              label="Target Day"
              onChange={(e) => setTargetDayDate(e.target.value)}
            >
              {weekDays.map((day) => (
                <MenuItem key={day.dateStr} value={day.dateStr}>
                  {day.dayShort} • {day.dayMonth} {day.isToday ? '(Today)' : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setMoveDayModalOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleConfirmMoveDay}
            disabled={isActionLoading || !targetDayDate}
            sx={{ bgcolor: BRAND_COLORS.purple, '&:hover': { bgcolor: BRAND_COLORS.purpleHover } }}
          >
            {isActionLoading ? <CircularProgress size={20} color="inherit" /> : 'Move Shift'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* =================================================================== */}
      {/* MODAL 3: Quick Add Shift (Click on Empty Cell) */}
      {/* =================================================================== */}
      <Dialog open={quickAddModalOpen} onClose={() => setQuickAddModalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontFamily: BRAND_FONTS.heading, color: BRAND_COLORS.navy }}>
          Quick Add Shift
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Date"
              type="date"
              size="small"
              value={quickAddDate}
              onChange={(e) => setQuickAddDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />

            <FormControl fullWidth size="small">
              <InputLabel>Team Member</InputLabel>
              <Select
                value={quickAddWorkerId}
                label="Team Member"
                onChange={(e) => setQuickAddWorkerId(e.target.value as any)}
              >
                <MenuItem value="">
                  <em>Leave Unassigned (Open Shift)</em>
                </MenuItem>
                {staffViewData.map((staff) => (
                  <MenuItem key={staff.worker_id} value={staff.worker_id}>
                    {staff.worker_name} ({staff.role})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>Role Needed</InputLabel>
              <Select
                value={quickAddRole}
                label="Role Needed"
                onChange={(e) => setQuickAddRole(e.target.value)}
              >
                <MenuItem value="PHARMACIST">Pharmacist</MenuItem>
                <MenuItem value="INTERN">Intern</MenuItem>
                <MenuItem value="TECHNICIAN">Technician</MenuItem>
                <MenuItem value="ASSISTANT">Assistant</MenuItem>
              </Select>
            </FormControl>

            <Stack direction="row" spacing={2}>
              <TextField
                label="Start Time"
                type="time"
                size="small"
                value={quickAddStartTime}
                onChange={(e) => setQuickAddStartTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="End Time"
                type="time"
                size="small"
                value={quickAddEndTime}
                onChange={(e) => setQuickAddEndTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setQuickAddModalOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={executeQuickAddShift}
            disabled={isActionLoading}
            sx={{ bgcolor: BRAND_COLORS.purple, '&:hover': { bgcolor: BRAND_COLORS.purpleHover } }}
          >
            {isActionLoading ? <CircularProgress size={20} color="inherit" /> : 'Create Shift'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar Feedback */}
      {feedback && (
        <Snackbar
          open={Boolean(feedback)}
          autoHideDuration={4000}
          onClose={() => setFeedback(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert severity={feedback.type} onClose={() => setFeedback(null)} sx={{ borderRadius: '8px' }}>
            {feedback.text}
          </Alert>
        </Snackbar>
      )}
    </Box>
  );
}
