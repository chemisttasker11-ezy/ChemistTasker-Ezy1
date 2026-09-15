import { Box, Typography } from '@mui/material';
import moment from 'moment';
import { navigate as navigateConstants } from 'react-big-calendar/lib/utils/constants';
import TimeGridImport from 'react-big-calendar/lib/TimeGrid';
import type { CSSProperties, MouseEvent } from 'react';

type CalendarViewKey = 'month' | 'week' | 'fortnight' | 'day';

const TimeGrid = (TimeGridImport as any)?.default ?? TimeGridImport;

// Ensure all moment-based calculations start the week on Monday.
moment.updateLocale('en', {
  week: {
    dow: 1,
    doy: 4
  }
});

const clampPercentage = (value: number) => Math.min(100, Math.max(0, value));

const getEventStyle = (
  event: any,
  start: Date,
  end: Date,
  isSelected: boolean,
  eventPropGetter?: (event: any, start: Date, end: Date, isSelected: boolean) => { style?: CSSProperties; className?: string }
) => {
  const eventProps = eventPropGetter ? eventPropGetter(event, start, end, isSelected) : undefined;
  return {
    style: eventProps?.style ?? {},
    className: eventProps?.className
  };
};

const resolveGroupForEvent = (event: any) => {
  const resource = event.resource ?? {};

  if (resource.isOpenShift) {
    return { key: 'open-shifts', label: 'Open Shifts' };
  }

  if (resource.isCoverRequest) {
    const requester = resource.originalRequest?.requester_name;
    return { key: `cover-${requester ?? 'unknown'}`, label: requester ? `${requester} (Cover Request)` : 'Cover Requests' };
  }

  const userDetails = resource.user_detail ?? resource.user_details;
  if (userDetails) {
    const key = `user-${userDetails.id ?? resource.user ?? userDetails.email ?? userDetails.first_name ?? 'unknown'}`;
    const label = [userDetails.first_name, userDetails.last_name].filter(Boolean).join(' ') || userDetails.email || 'Unnamed Team Member';
    return { key, label };
  }

  if (resource.shift_detail?.role_needed) {
    return { key: `role-${resource.shift_detail.role_needed}`, label: `${resource.shift_detail.role_needed} (Unassigned)` };
  }

  return { key: 'unassigned', label: 'Unassigned' };
};

const buildTimeline = (events: any[], date: Date, accessors: any, step: number, minProp?: Date, maxProp?: Date) => {
  const dayStart = moment(date).startOf('day');
  const dayEnd = moment(date).endOf('day');

  const filteredEvents = events.filter(event => {
    const start = moment(accessors.start(event));
    const end = moment(accessors.end(event));
    return end.isAfter(dayStart) && start.isBefore(dayEnd);
  });

  let minTime = minProp ? moment(minProp) : undefined;
  let maxTime = maxProp ? moment(maxProp) : undefined;

  if (!minTime || !maxTime) {
    if (filteredEvents.length) {
      const eventStarts = filteredEvents.map(event => moment(accessors.start(event)));
      const eventEnds = filteredEvents.map(event => moment(accessors.end(event)));
      const earliestEvent = moment.min(eventStarts);
      const latestEvent = moment.max(eventEnds);
      minTime = minTime ? moment.min(minTime, earliestEvent) : earliestEvent.clone();
      maxTime = maxTime ? moment.max(maxTime, latestEvent) : latestEvent.clone();
    } else {
      const fallbackStart = dayStart.clone().hour(6).minute(0);
      const fallbackEnd = dayStart.clone().hour(18).minute(0);
      minTime = minTime ?? fallbackStart;
      maxTime = maxTime ?? fallbackEnd;
    }
  }

  if (!minTime || !maxTime) {
    minTime = dayStart.clone();
    maxTime = dayStart.clone().add(8, 'hours');
  }

  const alignToStep = (value: moment.Moment, direction: 'floor' | 'ceil') => {
    const minutes = value.minute();
    const remainder = minutes % step;
    if (remainder === 0) {
      return value.clone().second(0);
    }
    return direction === 'floor'
      ? value.clone().subtract(remainder, 'minutes').second(0)
      : value.clone().add(step - remainder, 'minutes').second(0);
  };

  const alignedStart = alignToStep(minTime, 'floor');
  let alignedEnd = alignToStep(maxTime, 'ceil');
  if (alignedEnd.isSameOrBefore(alignedStart)) {
    alignedEnd = alignedStart.clone().add(Math.max(step, 60), 'minutes');
  }

  const totalMinutes = Math.max(alignedEnd.diff(alignedStart, 'minutes'), step);

  const hourMarks: moment.Moment[] = [];
  const hoursCursor = alignedStart.clone().minute(0).second(0);
  if (hoursCursor.isAfter(alignedStart)) {
    hoursCursor.subtract(1, 'hour');
  }
  const limit = alignedEnd.clone().minute(0).second(0);
  for (let cursor = hoursCursor.clone(); cursor.isSameOrBefore(limit); cursor.add(1, 'hour')) {
    if (cursor.isSameOrAfter(alignedStart) && cursor.isSameOrBefore(alignedEnd)) {
      hourMarks.push(cursor.clone());
    }
  }

  return {
    filteredEvents,
    start: alignedStart,
    end: alignedEnd,
    totalMinutes,
    hourMarks
  };
};

const WorkerDayView: any = (props: any) => {
  const {
    accessors,
    components,
    date,
    eventPropGetter,
    events,
    getters,
    localizer,
    min,
    max,
    onDoubleClickEvent,
    onSelectEvent,
    onSelectSlot,
    selected,
    selectable,
    step = 30
  } = props;

  void getters;
  void localizer;
  const timeline = buildTimeline(events, date, accessors, step, min, max);
  const { filteredEvents, start, end, totalMinutes, hourMarks } = timeline;

  const groupsMap = new Map<string, { key: string; label: string; events: any[] }>();
  filteredEvents.forEach(event => {
    const group = resolveGroupForEvent(event);
    if (!groupsMap.has(group.key)) {
      groupsMap.set(group.key, { ...group, events: [] });
    }
    groupsMap.get(group.key)!.events.push(event);
  });

  const groups = Array.from(groupsMap.values()).sort((a, b) => a.label.localeCompare(b.label));

  const renderEventLabel = (event: any) => {
    const EventComponent = components?.event;
    if (EventComponent) {
      return <EventComponent event={event} title={accessors.title(event)} />;
    }
    return (
      <Typography variant="caption" sx={{ fontWeight: 600, color: 'inherit', lineHeight: 1.2 }}>
        {accessors.title(event)}
      </Typography>
    );
  };

  const handleSlotSelection = (mouseEvent: MouseEvent<HTMLDivElement>, groupKey: string) => {
    if (!selectable || !onSelectSlot) {
      return;
    }

    const bounds = mouseEvent.currentTarget.getBoundingClientRect();
    const offset = mouseEvent.clientX - bounds.left;
    const ratio = clampPercentage((offset / bounds.width) * 100) / 100;
    const minutesFromStart = Math.round((ratio * totalMinutes) / step) * step;
    const slotsStart = start.clone().add(minutesFromStart, 'minutes');
    const slotsEnd = slotsStart.clone().add(step, 'minutes');

    onSelectSlot({
      action: 'click',
      slots: [slotsStart.toDate()],
      start: slotsStart.toDate(),
      end: slotsEnd.toDate(),
      resourceId: groupKey
    });
  };

  const isToday = moment().isSame(moment(date), 'day');
  const nowOffset = clampPercentage((moment().diff(start, 'minutes') / totalMinutes) * 100);

  return (
    <Box sx={{ overflowX: 'auto', border: 1, borderColor: 'divider', borderRadius: 2, minWidth: 720, bgcolor: 'background.paper', color: 'text.primary' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '220px 1fr', borderBottom: 1, borderColor: 'divider', backgroundColor: 'background.paper', position: 'sticky', top: 0, zIndex: 2 }}>
        <Box sx={{ p: 1.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', color: 'text.secondary' }}>
            Team Member
          </Typography>
        </Box>
        <Box sx={{ position: 'relative', p: 1.5, borderLeft: 1, borderColor: 'divider' }}>
          <Box sx={{ position: 'absolute', inset: 0, borderBottom: 1, borderColor: 'divider' }} />
          {hourMarks.map((mark, index) => {
            const offset = clampPercentage((mark.diff(start, 'minutes') / totalMinutes) * 100);
            return (
              <Box
                key={`${mark.valueOf()}-${index}`}
                sx={{
                  position: 'absolute',
                  left: `${offset}%`,
                  top: 0,
                  bottom: 0,
                  width: '1px',
                  backgroundColor: 'divider'
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    position: 'absolute',
                    top: 4,
                    left: 4,
                    transform: 'translateX(-50%)',
                    whiteSpace: 'nowrap',
                    color: 'text.secondary',
                    fontWeight: 500
                  }}
                >
                  {mark.format('HH:mm')}
                </Typography>
              </Box>
            );
          })}
          {isToday && nowOffset >= 0 && nowOffset <= 100 && (
            <Box
              sx={{
                position: 'absolute',
                left: `${nowOffset}%`,
                top: 0,
                bottom: 0,
                width: '2px',
                backgroundColor: 'error.main',
                zIndex: 1
              }}
            />
          )}
        </Box>
      </Box>

      {groups.length === 0 && (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No shifts scheduled for this day.
          </Typography>
        </Box>
      )}

      {groups.map(group => (
        <Box key={group.key} sx={{ display: 'grid', gridTemplateColumns: '220px 1fr', borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
          <Box sx={{ p: 1.5, borderRight: 1, borderColor: 'divider', display: 'flex', alignItems: 'center' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {group.label}
            </Typography>
          </Box>
          <Box
            sx={{ position: 'relative', minHeight: 68, cursor: selectable ? 'pointer' : 'default' }}
            onClick={event => handleSlotSelection(event, group.key)}
          >
            {hourMarks.map((mark, index) => {
              const offset = clampPercentage((mark.diff(start, 'minutes') / totalMinutes) * 100);
              return (
                <Box
                  key={`grid-${mark.valueOf()}-${index}`}
                  sx={{
                    position: 'absolute',
                    left: `${offset}%`,
                    top: 0,
                    bottom: 0,
                    width: '1px',
                    backgroundColor: 'divider'
                  }}
                />
              );
            })}

            {group.events.map(event => {
              const eventStart = moment(accessors.start(event));
              const eventEnd = moment(accessors.end(event));
              const clampedStart = moment.max(eventStart, start);
              const clampedEnd = moment.min(eventEnd, end);
              const offsetMinutes = clampedStart.diff(start, 'minutes');
              const durationMinutes = Math.max(clampedEnd.diff(clampedStart, 'minutes'), step);
              const leftPercent = clampPercentage((offsetMinutes / totalMinutes) * 100);
              const widthPercent = clampPercentage((durationMinutes / totalMinutes) * 100);
              const { style } = getEventStyle(event, accessors.start(event), accessors.end(event), selected === event, eventPropGetter);

              return (
                <Box
                  key={event.id ?? `${group.key}-${eventStart.valueOf()}`}
                  onClick={mouseEvent => {
                    mouseEvent.stopPropagation();
                    onSelectEvent?.(event);
                  }}
                  onDoubleClick={mouseEvent => {
                    mouseEvent.stopPropagation();
                    onDoubleClickEvent?.(event);
                  }}
                  sx={{
                    position: 'absolute',
                    left: `${leftPercent}%`,
                    width: `${Math.max(widthPercent, 2)}%`,
                    top: 12,
                    bottom: 12,
                    borderRadius: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    px: 1,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    boxShadow: 1,
                    cursor: onSelectEvent ? 'pointer' : 'default',
                    ...style
                  }}
                >
                  {renderEventLabel(event)}
                </Box>
              );
            })}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

WorkerDayView.range = (date: Date, { localizer }: any) => [localizer.startOf(date, 'day')];
WorkerDayView.navigate = (date: Date, action: string, { localizer }: any) => {
  switch (action) {
    case navigateConstants.PREVIOUS:
      return localizer.add(date, -1, 'day');
    case navigateConstants.NEXT:
      return localizer.add(date, 1, 'day');
    default:
      return date;
  }
};
WorkerDayView.title = (date: Date, { localizer }: any) => localizer.format(date, 'dayHeaderFormat');

const FortnightView: any = (props: any) => {
  const {
    date,
    localizer,
    min = localizer.startOf(new Date(), 'day'),
    max = localizer.endOf(new Date(), 'day'),
    scrollToTime = localizer.startOf(new Date(), 'day'),
    enableAutoScroll = true,
    dayPropGetter,
    ...rest
  } = props;

  const range = FortnightView.range(date, props);
  const fortnightStart = range[0];

  const mergedDayGetter = (day: Date) => {
    const original = dayPropGetter ? dayPropGetter(day) : {};
    const isSecondWeek = moment(day).diff(moment(fortnightStart), 'days') >= 7;
    const className = [original?.className, isSecondWeek ? 'rbc-fortnight-second-week' : null]
      .filter(Boolean)
      .join(' ');
    const style = {
      ...(original?.style ?? {}),
      backgroundColor: isSecondWeek ? 'rgba(148, 163, 184, 0.08)' : original?.style?.backgroundColor
    };
    return { ...original, className: className || undefined, style };
  };

  return (
    <TimeGrid
      {...rest}
      eventOffset={15}
      range={range}
      localizer={localizer}
      min={min}
      max={max}
      scrollToTime={scrollToTime}
      enableAutoScroll={enableAutoScroll}
      dayPropGetter={mergedDayGetter}
    />
  );
};

FortnightView.range = (date: Date, { localizer }: any) => {
  const firstOfWeek = localizer.startOfWeek();
  const start = localizer.startOf(date, 'week', firstOfWeek);
  const end = localizer.add(start, 13, 'day');
  return localizer.range(start, end);
};

FortnightView.navigate = (date: Date, action: string, { localizer }: any) => {
  switch (action) {
    case navigateConstants.PREVIOUS:
      return localizer.add(date, -2, 'week');
    case navigateConstants.NEXT:
      return localizer.add(date, 2, 'week');
    default:
      return date;
  }
};

FortnightView.title = (date: Date, { localizer }: any) => {
  const [start, ...rest] = FortnightView.range(date, { localizer });
  const end = rest.pop() ?? start;
  return localizer.format({ start, end }, 'dayRangeHeaderFormat');
};


export const calendarViews = {
  month: true,
  week: true,
  fortnight: FortnightView,
  day: WorkerDayView
};

export const calendarMessages = {
  month: 'Month',
  week: 'Week',
  fortnight: 'Fortnight',
  day: 'Day'
};

export const getDateRangeForView = (date: Date, view: CalendarViewKey) => {
  const base = moment(date);
  switch (view) {
    case 'month':
      return {
        start: base.clone().startOf('month'),
        end: base.clone().endOf('month')
      };
    case 'fortnight': {
      const start = base.clone().startOf('week');
      const end = start.clone().add(13, 'days').endOf('day');
      return { start, end };
    }
    case 'week':
      return {
        start: base.clone().startOf('week'),
        end: base.clone().endOf('week')
      };
    case 'day':
    default:
      return {
        start: base.clone().startOf('day'),
        end: base.clone().endOf('day')
      };
  }
};

export type { CalendarViewKey };
export { FortnightView, WorkerDayView };
