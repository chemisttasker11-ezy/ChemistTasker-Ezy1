import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Card,
  Chip,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ViewTimelineIcon from '@mui/icons-material/ViewTimeline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import StorefrontIcon from '@mui/icons-material/Storefront';
import moment from 'moment';
import { BRAND_COLORS, BRAND_FONTS, BRAND_SHADOWS } from '../../constants/brandTheme';

export interface CalendarEventItem {
  id: string | number;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource: any;
}

export interface HorizontalCalendarGridProps {
  events: CalendarEventItem[];
  currentDate: Date;
  onNavigate: (newDate: Date) => void;
  onSelectSlot: (slotInfo: { start: Date; end: Date }) => void;
  onSelectEvent: (event: { resource: any }) => void;
  onDuplicateShift?: (event: CalendarEventItem) => void;
  eventStyleGetter?: (event: any) => { style: React.CSSProperties };
  roleFilters?: string[];
  isLoading?: boolean;
  pharmacy?: any;
}

export interface DayOperatingHours {
  openMinutes: number | null;
  closeMinutes: number | null;
  isClosed: boolean;
  openLabel: string;
  closeLabel: string;
}

export const parseTimeToMinutes = (timeStr?: string | null): number | null => {
  if (!timeStr) return null;
  const parts = String(timeStr).trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
};

export const formatMinutesToTime = (m: number | null): string => {
  if (m == null) return '';
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
};

export const getPharmacyDayHours = (pharmacy: any, dayShort: string): DayOperatingHours => {
  if (!pharmacy) {
    return { openMinutes: 8 * 60, closeMinutes: 19 * 60, isClosed: false, openLabel: '08:00', closeLabel: '19:00' };
  }

  const p = pharmacy;
  const fallbackStart = p.weekdaysStart ?? p.weekdays_start ?? '08:00';
  const fallbackEnd = p.weekdaysEnd ?? p.weekdays_end ?? '19:00';

  let startRaw: string | null = null;
  let endRaw: string | null = null;
  let closed = false;

  switch (dayShort.toUpperCase()) {
    case 'MON':
      startRaw = p.mondayStart ?? p.monday_start ?? fallbackStart;
      endRaw = p.mondayEnd ?? p.monday_end ?? fallbackEnd;
      closed = Boolean(p.mondayClosed ?? p.monday_closed);
      break;
    case 'TUE':
      startRaw = p.tuesdayStart ?? p.tuesday_start ?? fallbackStart;
      endRaw = p.tuesdayEnd ?? p.tuesday_end ?? fallbackEnd;
      closed = Boolean(p.tuesdayClosed ?? p.tuesday_closed);
      break;
    case 'WED':
      startRaw = p.wednesdayStart ?? p.wednesday_start ?? fallbackStart;
      endRaw = p.wednesdayEnd ?? p.wednesday_end ?? fallbackEnd;
      closed = Boolean(p.wednesdayClosed ?? p.wednesday_closed);
      break;
    case 'THU':
      startRaw = p.thursdayStart ?? p.thursday_start ?? fallbackStart;
      endRaw = p.thursdayEnd ?? p.thursday_end ?? fallbackEnd;
      closed = Boolean(p.thursdayClosed ?? p.thursday_closed);
      break;
    case 'FRI':
      startRaw = p.fridayStart ?? p.friday_start ?? fallbackStart;
      endRaw = p.fridayEnd ?? p.friday_end ?? fallbackEnd;
      closed = Boolean(p.fridayClosed ?? p.friday_closed);
      break;
    case 'SAT':
      startRaw = p.saturdaysStart ?? p.saturdays_start ?? '09:00';
      endRaw = p.saturdaysEnd ?? p.saturdays_end ?? '17:00';
      closed = Boolean(p.saturdaysClosed ?? p.saturdays_closed);
      break;
    case 'SUN':
      startRaw = p.sundaysStart ?? p.sundays_start ?? '10:00';
      endRaw = p.sundaysEnd ?? p.sundays_end ?? '16:00';
      closed = Boolean(p.sundaysClosed ?? p.sundays_closed);
      break;
    default:
      startRaw = fallbackStart;
      endRaw = fallbackEnd;
  }

  const openMinutes = closed ? null : parseTimeToMinutes(startRaw);
  const closeMinutes = closed ? null : parseTimeToMinutes(endRaw);

  return {
    openMinutes,
    closeMinutes,
    isClosed: closed || (openMinutes == null && closeMinutes == null),
    openLabel: formatMinutesToTime(openMinutes),
    closeLabel: formatMinutesToTime(closeMinutes),
  };
};

// Role badge styling map
const ROLE_THEME: Record<string, { bg: string; text: string; border: string; bar: string }> = {
  PHARMACIST: {
    bg: '#F3EEFF',
    text: BRAND_COLORS.purple,
    border: '#D8B4FE',
    bar: BRAND_COLORS.purple,
  },
  INTERN: {
    bg: '#E0F7FA',
    text: '#00838F',
    border: '#80DEEA',
    bar: BRAND_COLORS.cyan,
  },
  TECHNICIAN: {
    bg: '#E0F2FE',
    text: '#0369A1',
    border: '#7DD3FC',
    bar: BRAND_COLORS.blue,
  },
  ASSISTANT: {
    bg: '#FEF3C7',
    text: '#92400E',
    border: '#FCD34D',
    bar: '#F59E0B',
  },
  STUDENT: {
    bg: '#ECFDF5',
    text: '#047857',
    border: '#A7F3D0',
    bar: '#10B981',
  },
  DEFAULT: {
    bg: '#F8FAFC',
    text: '#475569',
    border: '#CBD5E1',
    bar: '#94A3B8',
  },
};

const getRoleTheme = (role?: string) => {
  const normalized = (role || '').toUpperCase();
  return ROLE_THEME[normalized] || ROLE_THEME.DEFAULT;
};

export default function HorizontalCalendarGrid({
  events,
  currentDate,
  onNavigate,
  onSelectSlot,
  onSelectEvent,
  onDuplicateShift,
  roleFilters = [],
  isLoading = false,
  pharmacy,
}: HorizontalCalendarGridProps) {
  // Compute operating hours for all 7 days and week restricted range
  const weekOperatingHours = useMemo(() => {
    const dayHoursMap: Record<string, DayOperatingHours> = {};
    const openMinsList: number[] = [];
    const closeMinsList: number[] = [];

    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((dayShort) => {
      const hours = getPharmacyDayHours(pharmacy, dayShort);
      dayHoursMap[dayShort] = hours;
      if (!hours.isClosed) {
        if (hours.openMinutes != null) openMinsList.push(hours.openMinutes);
        if (hours.closeMinutes != null) closeMinsList.push(hours.closeMinutes);
      }
    });

    // Default if no configured hours: 08:00 (480m) to 19:00 (1140m)
    const earliestOpenMin = openMinsList.length > 0 ? Math.min(...openMinsList) : 8 * 60;
    const latestCloseMin = closeMinsList.length > 0 ? Math.max(...closeMinsList) : 19 * 60;

    // Restricted hours rule: 1 hour before opening, +1 hour after closing
    let calculatedMinHour = Math.max(0, Math.floor((earliestOpenMin - 60) / 60));
    let calculatedMaxHour = Math.min(24, Math.ceil((latestCloseMin + 60) / 60));

    // Dynamic safety check: Ensure all scheduled shifts in this week are within visible bounds
    events.forEach((ev) => {
      const evStart = moment(ev.start);
      const evEnd = moment(ev.end);
      const startH = evStart.hours();
      let endH = evEnd.hours() + (evEnd.minutes() > 0 ? 1 : 0);
      if (endH <= startH) endH = 24;

      calculatedMinHour = Math.min(calculatedMinHour, Math.max(0, startH));
      calculatedMaxHour = Math.max(calculatedMaxHour, Math.min(24, endH));
    });

    // Guarantee a comfortable grid width (at least 8 hours range)
    if (calculatedMaxHour - calculatedMinHour < 8) {
      calculatedMaxHour = Math.min(24, calculatedMinHour + 8);
    }

    return {
      dayHoursMap,
      earliestOpenMin,
      latestCloseMin,
      restrictedMinHour: calculatedMinHour,
      restrictedMaxHour: calculatedMaxHour,
    };
  }, [pharmacy, events]);

  // View options: 'STORE_HOURS' (Restricted to Open -1h to Close +1h) or 'FULL' (24 hours)
  const [timeRangeMode, setTimeRangeMode] = useState<'STORE_HOURS' | 'FULL'>('STORE_HOURS');

  const minHour = timeRangeMode === 'STORE_HOURS' ? weekOperatingHours.restrictedMinHour : 0;
  const maxHour = timeRangeMode === 'STORE_HOURS' ? weekOperatingHours.restrictedMaxHour : 24;
  const totalHours = maxHour - minHour;
  const minMinutes = minHour * 60;
  const maxMinutes = maxHour * 60;
  const totalMinutes = totalHours * 60;

  // Drag-to-select shift time range state
  const [dragSelection, setDragSelection] = useState<{
    dayStr: string;
    startMin: number;
    currentMin: number;
  } | null>(null);

  const dragRef = useRef<{
    active: boolean;
    dayStr: string;
    startMin: number;
    currentMin: number;
    trackElem: HTMLDivElement | null;
  }>({
    active: false,
    dayStr: '',
    startMin: 0,
    currentMin: 0,
    trackElem: null,
  });

  // Global mouse move and up listeners for fluid drag-selection
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.active || !dragRef.current.trackElem) return;
      const rect = dragRef.current.trackElem.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      const rawMin = minMinutes + ratio * totalMinutes;
      // Snap to 15 minute increments
      const snappedMin = Math.max(minMinutes, Math.min(maxMinutes, Math.round(rawMin / 15) * 15));

      dragRef.current.currentMin = snappedMin;
      setDragSelection((prev) => (prev ? { ...prev, currentMin: snappedMin } : null));
    };

    const handleMouseUp = () => {
      if (!dragRef.current.active) return;
      const { dayStr, startMin, currentMin } = dragRef.current;
      dragRef.current.active = false;
      dragRef.current.trackElem = null;
      setDragSelection(null);

      const fromMin = Math.min(startMin, currentMin);
      let toMin = Math.max(startMin, currentMin);

      // If user clicked without dragging (or dragged < 30 mins), default to 8-hour shift or up to maxMinutes
      if (toMin - fromMin < 30) {
        toMin = Math.min(maxMinutes, fromMin + 8 * 60);
      }

      const startDate = moment(dayStr)
        .startOf('day')
        .add(fromMin, 'minutes')
        .toDate();
      const endDate = moment(dayStr)
        .startOf('day')
        .add(toMin, 'minutes')
        .toDate();

      onSelectSlot({ start: startDate, end: endDate });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [minMinutes, maxMinutes, totalMinutes, onSelectSlot]);

  // Monday of the current week
  const weekStart = useMemo(() => moment(currentDate).startOf('isoWeek'), [currentDate]);
  const weekEnd = useMemo(() => moment(currentDate).endOf('isoWeek'), [currentDate]);

  // Array of 7 days: Monday .. Sunday
  const days = useMemo(() => {
    const list = [];
    for (let i = 0; i < 7; i++) {
      const d = moment(weekStart).add(i, 'days');
      list.push({
        date: d.toDate(),
        dateStr: d.format('YYYY-MM-DD'),
        dayName: d.format('dddd'),
        dayShort: d.format('ddd'),
        dateFormatted: d.format('D MMM'),
        isToday: d.isSame(moment(), 'day'),
      });
    }
    return list;
  }, [weekStart]);

  // Generate hour tick labels
  const hourTicks = useMemo(() => {
    const ticks = [];
    for (let h = minHour; h < maxHour; h++) {
      ticks.push({
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        percent: ((h - minHour) / totalHours) * 100,
      });
    }
    return ticks;
  }, [minHour, maxHour, totalHours]);

  // Group events by day and compute non-overlapping lanes
  const dayLanesMap = useMemo(() => {
    const map: Record<
      string,
      Array<{
        event: CalendarEventItem;
        lane: number;
        leftPct: number;
        widthPct: number;
        startTimeStr: string;
        endTimeStr: string;
        durationHours: number;
        role: string;
        isLeave: boolean;
        isCover: boolean;
        isOpen: boolean;
        workerName: string;
      }>
    > = {};

    days.forEach((d) => {
      map[d.dateStr] = [];
    });

    // Filter events belonging to this week
    events.forEach((ev) => {
      const evStart = moment(ev.start);
      const evEnd = moment(ev.end);
      const dateKey = evStart.format('YYYY-MM-DD');

      if (!map[dateKey]) return;

      const res = ev.resource || {};
      const role = (res.shiftDetail?.roleNeeded || res.role || '').toUpperCase();

      // Check role filters
      if (
        roleFilters.length > 0 &&
        !roleFilters.includes('ALL') &&
        !roleFilters.includes(role)
      ) {
        return;
      }

      const startMin = evStart.hours() * 60 + evStart.minutes();
      let endMin = evEnd.hours() * 60 + evEnd.minutes();
      if (endMin <= startMin) {
        endMin = 24 * 60; // clamps to midnight
      }

      // Clip to grid view range
      const clampedStart = Math.max(minMinutes, Math.min(maxMinutes, startMin));
      const clampedEnd = Math.max(minMinutes, Math.min(maxMinutes, endMin));

      if (clampedEnd <= clampedStart) return;

      const leftPct = ((clampedStart - minMinutes) / totalMinutes) * 100;
      const widthPct = Math.max(2, ((clampedEnd - clampedStart) / totalMinutes) * 100);

      const durationHours = Math.round(((endMin - startMin) / 60) * 10) / 10;
      const isLeave = Boolean(res.leaveRequest);
      const isCover = Boolean(res.isCoverRequest);
      const isOpen = Boolean(res.isOpenShift);
      const workerName = res.userDetail?.firstName
        ? `${res.userDetail.firstName} ${res.userDetail.lastName || ''}`.trim()
        : res.originalRequest?.requesterName || res.requesterName || (isOpen ? 'Open Shift' : (ev.title || 'Unassigned'));

      map[dateKey].push({
        event: ev,
        lane: 0, // computed below
        leftPct,
        widthPct,
        startTimeStr: evStart.format('HH:mm'),
        endTimeStr: evEnd.format('HH:mm'),
        durationHours,
        role,
        isLeave,
        isCover,
        isOpen,
        workerName,
      });
    });

    // For each day, assign lane index using greedy interval scheduling
    Object.keys(map).forEach((dateKey) => {
      const items = map[dateKey];
      // Sort by start time then duration
      items.sort((a, b) => a.leftPct - b.leftPct || b.widthPct - a.widthPct);

      const laneEnds: number[] = []; // tracks right edge % of each lane
      items.forEach((item) => {
        let assignedLane = -1;
        for (let l = 0; l < laneEnds.length; l++) {
          if (item.leftPct >= laneEnds[l] - 0.2) {
            assignedLane = l;
            laneEnds[l] = item.leftPct + item.widthPct;
            break;
          }
        }
        if (assignedLane === -1) {
          assignedLane = laneEnds.length;
          laneEnds.push(item.leftPct + item.widthPct);
        }
        item.lane = assignedLane;
      });
    });

    return map;
  }, [events, days, roleFilters, minMinutes, maxMinutes, totalMinutes]);

  // Summary statistics
  const weeklyStats = useMemo(() => {
    let totalShifts = 0;
    let totalHours = 0;
    let openShifts = 0;

    Object.values(dayLanesMap).forEach((list) => {
      list.forEach((item) => {
        totalShifts += 1;
        totalHours += item.durationHours;
        if (item.isOpen) openShifts += 1;
      });
    });

    return {
      totalShifts,
      totalHours: Math.round(totalHours * 10) / 10,
      openShifts,
    };
  }, [dayLanesMap]);

  // Timeline track mouse down handler for drag-to-select
  const handleTrackMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    dayDateStr: string
  ) => {
    if (e.button !== 0) return; // Only primary mouse button

    // If click was on a shift card or its children, ignore track click
    if ((e.target as HTMLElement).closest('.roster-shift-card')) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const rawMinutes = minMinutes + ratio * totalMinutes;
    // Snap to 15-minute intervals
    const snappedMinutes = Math.round(rawMinutes / 15) * 15;

    dragRef.current = {
      active: true,
      dayStr: dayDateStr,
      startMin: snappedMinutes,
      currentMin: snappedMinutes,
      trackElem: e.currentTarget,
    };

    setDragSelection({
      dayStr: dayDateStr,
      startMin: snappedMinutes,
      currentMin: snappedMinutes,
    });
  };

  // Week navigation
  const handlePrevWeek = () => {
    onNavigate(moment(currentDate).subtract(1, 'week').toDate());
  };

  const handleNextWeek = () => {
    onNavigate(moment(currentDate).add(1, 'week').toDate());
  };

  const handleToday = () => {
    onNavigate(new Date());
  };

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: '16px',
        border: `1px solid ${BRAND_COLORS.border}`,
        boxShadow: BRAND_SHADOWS.card,
        overflow: 'hidden',
        bgcolor: 'white',
        mb: 3,
      }}
    >
      {/* =================================================================== */}
      {/* 1. TOP TOOLBAR: Navigation & Summary Indicators                     */}
      {/* =================================================================== */}
      <Box
        sx={{
          p: 2,
          borderBottom: `1px solid ${BRAND_COLORS.border}`,
          bgcolor: BRAND_COLORS.mist,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        {/* Left: Navigation Controls & Date Range */}
        <Stack direction="row" spacing={1.5} alignItems="center">
          <ButtonGroup size="small" variant="outlined" sx={{ bgcolor: 'white', borderRadius: '8px' }}>
            <Tooltip title="Previous Week">
              <IconButton size="small" onClick={handlePrevWeek} sx={{ color: BRAND_COLORS.navy }}>
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button
              onClick={handleToday}
              startIcon={<TodayIcon fontSize="small" />}
              sx={{
                fontWeight: 600,
                fontSize: 12,
                color: BRAND_COLORS.navy,
                borderColor: BRAND_COLORS.border,
                textTransform: 'none',
                px: 1.5,
              }}
            >
              Today
            </Button>
            <Tooltip title="Next Week">
              <IconButton size="small" onClick={handleNextWeek} sx={{ color: BRAND_COLORS.navy }}>
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </ButtonGroup>

          {/* Date Range Badge */}
          <Typography
            variant="h6"
            sx={{
              fontFamily: BRAND_FONTS.heading,
              fontWeight: 700,
              fontSize: { xs: 15, sm: 17 },
              color: BRAND_COLORS.navy,
              letterSpacing: '-0.01em',
            }}
          >
            {weekStart.format('D MMM')} – {weekEnd.format('D MMM YYYY')}
          </Typography>
        </Stack>

        {/* Center: Weekly KPI Pills */}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Chip
            size="small"
            icon={<AccessTimeIcon sx={{ fontSize: 14 }} />}
            label={`${weeklyStats.totalHours} Total Hours`}
            sx={{
              bgcolor: BRAND_COLORS.purpleLight,
              color: BRAND_COLORS.purple,
              fontWeight: 700,
              fontSize: 12,
              borderRadius: '8px',
            }}
          />
          <Chip
            size="small"
            label={`${weeklyStats.totalShifts} Shifts`}
            sx={{
              bgcolor: 'white',
              border: `1px solid ${BRAND_COLORS.border}`,
              color: BRAND_COLORS.navy,
              fontWeight: 600,
              fontSize: 12,
              borderRadius: '8px',
            }}
          />
          {weeklyStats.openShifts > 0 && (
            <Chip
              size="small"
              icon={<WarningAmberIcon sx={{ fontSize: 14, color: '#B45309' }} />}
              label={`${weeklyStats.openShifts} Open`}
              sx={{
                bgcolor: '#FEF3C7',
                color: '#92400E',
                fontWeight: 700,
                fontSize: 12,
                borderRadius: '8px',
              }}
            />
          )}
        </Stack>

        {/* Right: Time Range Mode Switcher */}
        <ButtonGroup
          size="small"
          variant="outlined"
          sx={{
            bgcolor: 'white',
            borderRadius: '8px',
            '& .MuiButton-root': {
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'none',
              px: 1.5,
              borderColor: BRAND_COLORS.border,
            },
          }}
        >
          <Button
            variant={timeRangeMode === 'STORE_HOURS' ? 'contained' : 'outlined'}
            onClick={() => setTimeRangeMode('STORE_HOURS')}
            startIcon={<StorefrontIcon sx={{ fontSize: 14 }} />}
            sx={{
              bgcolor: timeRangeMode === 'STORE_HOURS' ? BRAND_COLORS.purple : 'white',
              color: timeRangeMode === 'STORE_HOURS' ? 'white' : BRAND_COLORS.navy,
              '&:hover': {
                bgcolor: timeRangeMode === 'STORE_HOURS' ? BRAND_COLORS.purpleHover : 'rgba(0,0,0,0.04)',
              },
            }}
          >
            Store Hours ({String(weekOperatingHours.restrictedMinHour).padStart(2, '0')}:00 – {String(weekOperatingHours.restrictedMaxHour).padStart(2, '0')}:00)
          </Button>
          <Button
            variant={timeRangeMode === 'FULL' ? 'contained' : 'outlined'}
            onClick={() => setTimeRangeMode('FULL')}
            sx={{
              bgcolor: timeRangeMode === 'FULL' ? BRAND_COLORS.purple : 'white',
              color: timeRangeMode === 'FULL' ? 'white' : BRAND_COLORS.navy,
              '&:hover': {
                bgcolor: timeRangeMode === 'FULL' ? BRAND_COLORS.purpleHover : 'rgba(0,0,0,0.04)',
              },
            }}
          >
            Full 24 Hours
          </Button>
        </ButtonGroup>
      </Box>

      {/* =================================================================== */}
      {/* 2. HORIZONTAL TIMELINE GRID TABLE                                  */}
      {/* =================================================================== */}
      <Box
        sx={{
          width: '100%',
          overflowX: 'auto',
          minWidth: 0,
          position: 'relative',
        }}
      >
        <Box sx={{ minWidth: 1050, width: '100%' }}>
          {/* HEADER ROW: Day Column (left) + Hour Ruler (right) */}
          <Box
            sx={{
              display: 'flex',
              borderBottom: `2px solid ${BRAND_COLORS.border}`,
              bgcolor: '#F8FAFC',
              position: 'sticky',
              top: 0,
              zIndex: 5,
            }}
          >
            {/* Sticky Day Column Header */}
            <Box
              sx={{
                width: 190,
                minWidth: 190,
                p: 1.5,
                borderRight: `2px solid ${BRAND_COLORS.border}`,
                fontWeight: 700,
                fontSize: 12,
                fontFamily: BRAND_FONTS.heading,
                color: BRAND_COLORS.navy,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                bgcolor: '#F8FAFC',
                position: 'sticky',
                left: 0,
                zIndex: 6,
              }}
            >
              Day / Date
            </Box>

            {/* Timeline Hour Ticks */}
            <Box
              sx={{
                flex: 1,
                position: 'relative',
                height: 42,
                display: 'flex',
              }}
            >
              {hourTicks.map((tick, idx) => (
                <Box
                  key={tick.hour}
                  sx={{
                    flex: 1,
                    position: 'relative',
                    borderRight:
                      idx === hourTicks.length - 1
                        ? 'none'
                        : `1px solid rgba(230, 234, 242, 0.8)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    pl: 0.75,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: BRAND_COLORS.body,
                      fontFamily: BRAND_FONTS.body,
                    }}
                  >
                    {tick.label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* =============================================================== */}
          {/* 3. 7 DAY ROWS (VERTICAL)                                        */}
          {/* =============================================================== */}
          {days.map((day) => {
            const laneItems = dayLanesMap[day.dateStr] || [];
            // Maximum lanes required for this day
            const maxLanes =
              laneItems.length > 0 ? Math.max(...laneItems.map((i) => i.lane)) + 1 : 0;
            const rowHeight = Math.max(76, maxLanes * 60 + 16);

            // Daily sum of hours
            const dayTotalHours = laneItems.reduce(
              (acc, curr) => acc + curr.durationHours,
              0
            );

            return (
              <Box
                key={day.dateStr}
                sx={{
                  display: 'flex',
                  borderBottom: `1px solid ${BRAND_COLORS.border}`,
                  bgcolor: day.isToday ? 'rgba(82, 34, 184, 0.02)' : 'white',
                  transition: 'background-color 0.15s ease',
                  '&:hover': {
                    bgcolor: day.isToday
                      ? 'rgba(82, 34, 184, 0.04)'
                      : 'rgba(245, 248, 252, 0.6)',
                  },
                }}
              >
                {/* 3.1 Pinned Day Header Column */}
                <Box
                  sx={{
                    width: 190,
                    minWidth: 190,
                    p: 1.5,
                    borderRight: `2px solid ${BRAND_COLORS.border}`,
                    bgcolor: day.isToday ? '#F6F2FF' : 'white',
                    position: 'sticky',
                    left: 0,
                    zIndex: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    boxShadow: '2px 0 8px rgba(6, 33, 74, 0.03)',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 700,
                        fontSize: 14,
                        fontFamily: BRAND_FONTS.heading,
                        color: day.isToday ? BRAND_COLORS.purple : BRAND_COLORS.navy,
                      }}
                    >
                      {day.dayShort}
                    </Typography>

                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        fontSize: 12,
                        color: BRAND_COLORS.body,
                      }}
                    >
                      {day.dateFormatted}
                    </Typography>

                    {day.isToday && (
                      <Chip
                        label="Today"
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: 10,
                          fontWeight: 700,
                          bgcolor: BRAND_COLORS.purple,
                          color: 'white',
                          borderRadius: '4px',
                        }}
                      />
                    )}
                  </Stack>

                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: 11,
                        color: BRAND_COLORS.body,
                        fontWeight: 500,
                      }}
                    >
                      {laneItems.length} {laneItems.length === 1 ? 'shift' : 'shifts'}
                    </Typography>
                    {dayTotalHours > 0 && (
                      <>
                        <Typography variant="caption" sx={{ color: BRAND_COLORS.border }}>
                          •
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: BRAND_COLORS.navy,
                          }}
                        >
                          {Math.round(dayTotalHours * 10) / 10}h
                        </Typography>
                      </>
                    )}
                  </Stack>

                  {/* Day Operating Hours Badge */}
                  {(() => {
                    const dayHours = weekOperatingHours.dayHoursMap[day.dayShort];
                    if (!dayHours) return null;
                    return (
                      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
                        <AccessTimeIcon sx={{ fontSize: 11, color: dayHours.isClosed ? '#EF4444' : BRAND_COLORS.purple }} />
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: dayHours.isClosed ? '#DC2626' : BRAND_COLORS.body,
                          }}
                        >
                          {dayHours.isClosed ? 'Closed' : `Open ${dayHours.openLabel} – ${dayHours.closeLabel}`}
                        </Typography>
                      </Stack>
                    );
                  })()}
                </Box>

                {/* 3.2 Horizontal Timeline Day Track */}
                <Box
                  onMouseDown={(e) => handleTrackMouseDown(e, day.dateStr)}
                  sx={{
                    flex: 1,
                    position: 'relative',
                    height: rowHeight,
                    cursor: 'crosshair',
                    overflow: 'hidden',
                    userSelect: 'none',
                  }}
                >
                  {/* Vertical Hour Grid Guidelines */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      display: 'flex',
                      pointerEvents: 'none',
                    }}
                  >
                    {hourTicks.map((tick, idx) => (
                      <Box
                        key={tick.hour}
                        sx={{
                          flex: 1,
                          borderRight:
                            idx === hourTicks.length - 1
                              ? 'none'
                              : `1px solid rgba(230, 234, 242, 0.6)`,
                        }}
                      />
                    ))}
                  </Box>

                  {/* Pre-opening (-1h margin) shaded zone */}
                  {(() => {
                    const dayHours = weekOperatingHours.dayHoursMap[day.dayShort];
                    if (!dayHours || dayHours.isClosed || dayHours.openMinutes == null) return null;
                    if (dayHours.openMinutes <= minMinutes) return null;
                    const widthPct = Math.min(100, ((dayHours.openMinutes - minMinutes) / totalMinutes) * 100);
                    return (
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: `${widthPct}%`,
                          bottom: 0,
                          bgcolor: 'rgba(241, 245, 249, 0.65)',
                          borderRight: '1.5px dashed rgba(82, 34, 184, 0.35)',
                          pointerEvents: 'none',
                          zIndex: 1,
                          display: 'flex',
                          alignItems: 'flex-start',
                          p: 0.5,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: 9,
                            fontWeight: 600,
                            color: '#64748B',
                            lineHeight: 1,
                          }}
                        >
                          Pre-open
                        </Typography>
                      </Box>
                    );
                  })()}

                  {/* Post-closing (+1h margin) shaded zone */}
                  {(() => {
                    const dayHours = weekOperatingHours.dayHoursMap[day.dayShort];
                    if (!dayHours || dayHours.isClosed || dayHours.closeMinutes == null) return null;
                    if (dayHours.closeMinutes >= maxMinutes) return null;
                    const leftPct = ((dayHours.closeMinutes - minMinutes) / totalMinutes) * 100;
                    const widthPct = Math.max(0, 100 - leftPct);
                    return (
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          bottom: 0,
                          bgcolor: 'rgba(241, 245, 249, 0.65)',
                          borderLeft: '1.5px dashed rgba(82, 34, 184, 0.35)',
                          pointerEvents: 'none',
                          zIndex: 1,
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'flex-end',
                          p: 0.5,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: 9,
                            fontWeight: 600,
                            color: '#64748B',
                            lineHeight: 1,
                          }}
                        >
                          Post-close
                        </Typography>
                      </Box>
                    );
                  })()}

                  {/* Drag Selection Marquee */}
                  {dragSelection && dragSelection.dayStr === day.dateStr && (
                    <Box
                      sx={{
                        position: 'absolute',
                        left: `${((Math.min(dragSelection.startMin, dragSelection.currentMin) - minMinutes) / totalMinutes) * 100}%`,
                        width: `${Math.max(1.5, (Math.abs(dragSelection.currentMin - dragSelection.startMin) / totalMinutes) * 100)}%`,
                        top: 4,
                        bottom: 4,
                        background: 'linear-gradient(135deg, rgba(82, 34, 184, 0.22) 0%, rgba(99, 102, 241, 0.22) 100%)',
                        border: `2px dashed ${BRAND_COLORS.purple}`,
                        borderRadius: '8px',
                        boxShadow: '0 4px 14px rgba(82, 34, 184, 0.25)',
                        pointerEvents: 'none',
                        zIndex: 25,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        px: 1,
                      }}
                    >
                      <Box
                        sx={{
                          bgcolor: BRAND_COLORS.purple,
                          color: 'white',
                          px: 1,
                          py: 0.25,
                          borderRadius: '4px',
                          fontSize: 11,
                          fontWeight: 700,
                          boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                        }}
                      >
                        <AddIcon sx={{ fontSize: 13 }} />
                        {formatMinutesToTime(Math.min(dragSelection.startMin, dragSelection.currentMin))} –{' '}
                        {formatMinutesToTime(Math.max(dragSelection.startMin, dragSelection.currentMin))} (
                        {Math.round((Math.max(15, Math.abs(dragSelection.currentMin - dragSelection.startMin)) / 60) * 10) / 10}h)
                      </Box>
                    </Box>
                  )}

                  {/* Empty state prompt on hover */}
                  {laneItems.length === 0 && !dragSelection && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        opacity: 0.35,
                        transition: 'opacity 0.2s ease',
                        pointerEvents: 'none',
                        '&:hover': { opacity: 0.8 },
                      }}
                    >
                      <AddIcon fontSize="small" sx={{ color: BRAND_COLORS.purple }} />
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 600, color: BRAND_COLORS.body }}
                      >
                        Drag or click to schedule shift (e.g. 9:30 - 17:30)
                      </Typography>
                    </Box>
                  )}

                  {/* 3.3 Shift Blocks positioned along the horizontal timeline */}
                  {laneItems.map((item) => {
                    const styleTheme = getRoleTheme(item.role);

                    // Determine background & borders
                    let cardBg = styleTheme.bg;
                    let cardBorder = `1px solid ${styleTheme.border}`;
                    let cardTextColor = styleTheme.text;
                    let barColor = styleTheme.bar;

                    if (item.isOpen) {
                      cardBg = '#FFFBEB';
                      cardBorder = '1px dashed #F59E0B';
                      cardTextColor = '#92400E';
                      barColor = '#F59E0B';
                    } else if (item.isLeave) {
                      cardBg = '#F1F5F9';
                      cardBorder = '1px solid #CBD5E1';
                      cardTextColor = '#475569';
                      barColor = '#94A3B8';
                    } else if (item.isCover) {
                      cardBg = '#FDF2F8';
                      cardBorder = '1px solid #F472B6';
                      cardTextColor = '#BE185D';
                      barColor = '#D600C8';
                    }

                    const topPosition = item.lane * 58 + 8;

                    return (
                      <Tooltip
                        key={item.event.id}
                        arrow
                        placement="top"
                        title={
                          <Box sx={{ p: 0.5 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              {item.workerName}
                            </Typography>
                            <Typography variant="caption" sx={{ display: 'block' }}>
                              Role: {item.role || 'Unspecified'}
                            </Typography>
                            <Typography variant="caption" sx={{ display: 'block' }}>
                              Time: {item.startTimeStr} – {item.endTimeStr} ({item.durationHours}h)
                            </Typography>
                            {item.isLeave && (
                              <Typography variant="caption" sx={{ color: '#E2E8F0', display: 'block' }}>
                                Leave Request Attached
                              </Typography>
                            )}
                            {item.isCover && (
                              <Typography variant="caption" sx={{ color: '#FBCFE8', display: 'block' }}>
                                Cover Request Pending
                              </Typography>
                            )}
                            <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mt: 0.5 }}>
                              Click to manage shift
                            </Typography>
                          </Box>
                        }
                      >
                        <Box
                          className="roster-shift-card"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectEvent(item.event);
                          }}
                          sx={{
                            position: 'absolute',
                            left: `${item.leftPct}%`,
                            width: `${item.widthPct}%`,
                            top: topPosition,
                            height: 50,
                            bgcolor: cardBg,
                            border: cardBorder,
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            boxShadow: '0 2px 6px rgba(6, 33, 74, 0.06)',
                            overflow: 'hidden',
                            transition: 'all 0.15s ease-in-out',
                            zIndex: 2,
                            '&:hover': {
                              transform: 'translateY(-2px)',
                              boxShadow: '0 6px 16px rgba(6, 33, 74, 0.12)',
                              zIndex: 10,
                            },
                          }}
                        >
                          {/* Left role accent bar */}
                          <Box
                            sx={{
                              width: 4,
                              alignSelf: 'stretch',
                              bgcolor: barColor,
                              flexShrink: 0,
                            }}
                          />

                          {/* Content Container */}
                          <Box
                            sx={{
                              p: 0.75,
                              flex: 1,
                              minWidth: 0,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                            }}
                          >
                            <Stack
                              direction="row"
                              spacing={0.5}
                              alignItems="center"
                              sx={{ minWidth: 0, justifyContent: 'space-between' }}
                            >
                              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                                <Typography
                                  variant="caption"
                                  noWrap
                                  sx={{
                                    fontWeight: 700,
                                    fontSize: 12,
                                    color: BRAND_COLORS.navy,
                                    fontFamily: BRAND_FONTS.body,
                                    minWidth: 0,
                                  }}
                                >
                                  {item.workerName}
                                </Typography>

                                {item.role && (
                                  <Chip
                                    label={item.role.substring(0, 3)}
                                    size="small"
                                    sx={{
                                      height: 16,
                                      fontSize: 9,
                                      fontWeight: 700,
                                      bgcolor: 'white',
                                      color: cardTextColor,
                                      border: `1px solid ${styleTheme.border}`,
                                      borderRadius: '3px',
                                      px: 0.25,
                                    }}
                                  />
                                )}
                              </Stack>

                              {onDuplicateShift && (
                                <Tooltip title="Duplicate shift slot to another date">
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDuplicateShift(item.event);
                                    }}
                                    sx={{
                                      p: 0.25,
                                      ml: 0.5,
                                      color: BRAND_COLORS.purple,
                                      bgcolor: 'white',
                                      border: `1px solid ${styleTheme.border}`,
                                      borderRadius: '4px',
                                      flexShrink: 0,
                                      '&:hover': {
                                        bgcolor: BRAND_COLORS.purpleLight,
                                      },
                                    }}
                                  >
                                    <ContentCopyIcon sx={{ fontSize: 11 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>

                            <Stack
                              direction="row"
                              spacing={0.5}
                              alignItems="center"
                              sx={{ mt: 0.25 }}
                            >
                              <Typography
                                variant="caption"
                                noWrap
                                sx={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: cardTextColor,
                                }}
                              >
                                {item.startTimeStr} - {item.endTimeStr}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{
                                  fontSize: 10,
                                  color: BRAND_COLORS.body,
                                  fontWeight: 500,
                                }}
                              >
                                ({item.durationHours}h)
                              </Typography>
                            </Stack>
                          </Box>
                        </Box>
                      </Tooltip>
                    );
                  })}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* =================================================================== */}
      {/* 4. FOOTER: Legend & Instructions                                   */}
      {/* =================================================================== */}
      <Box
        sx={{
          p: 1.5,
          borderTop: `1px solid ${BRAND_COLORS.border}`,
          bgcolor: BRAND_COLORS.mist,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '3px',
                bgcolor: BRAND_COLORS.purple,
              }}
            />
            <Typography variant="caption" sx={{ fontWeight: 600, color: BRAND_COLORS.navy }}>
              Pharmacist
            </Typography>
          </Stack>

          <Stack direction="row" spacing={0.75} alignItems="center">
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '3px',
                bgcolor: BRAND_COLORS.cyan,
              }}
            />
            <Typography variant="caption" sx={{ fontWeight: 600, color: BRAND_COLORS.navy }}>
              Intern
            </Typography>
          </Stack>

          <Stack direction="row" spacing={0.75} alignItems="center">
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '3px',
                bgcolor: BRAND_COLORS.blue,
              }}
            />
            <Typography variant="caption" sx={{ fontWeight: 600, color: BRAND_COLORS.navy }}>
              Technician
            </Typography>
          </Stack>

          <Stack direction="row" spacing={0.75} alignItems="center">
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '3px',
                bgcolor: '#F59E0B',
              }}
            />
            <Typography variant="caption" sx={{ fontWeight: 600, color: BRAND_COLORS.navy }}>
              Assistant
            </Typography>
          </Stack>

          <Stack direction="row" spacing={0.75} alignItems="center">
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '3px',
                bgcolor: '#FFFBEB',
                border: '1px dashed #F59E0B',
              }}
            />
            <Typography variant="caption" sx={{ fontWeight: 600, color: BRAND_COLORS.navy }}>
              Open Shift
            </Typography>
          </Stack>

          <Stack direction="row" spacing={0.75} alignItems="center">
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '3px',
                bgcolor: '#F1F5F9',
                border: '1px solid #CBD5E1',
              }}
            />
            <Typography variant="caption" sx={{ fontWeight: 600, color: BRAND_COLORS.navy }}>
              Leave
            </Typography>
          </Stack>
        </Stack>

        <Typography variant="caption" sx={{ color: BRAND_COLORS.body }}>
          Tip: Click any empty timeline cell to create a shift. Click an existing shift to edit or delete.
        </Typography>
      </Box>
    </Card>
  );
}
