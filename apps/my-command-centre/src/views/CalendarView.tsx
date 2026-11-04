import { useMemo, useState, type DragEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Search, X } from 'lucide-react';
import { CATEGORIES, type Category, type Completion, type Lane, type Task, type TaskStatus } from '../model';
import { addDays, calendarOccurrences, dateTitle, dateUTC, monthDates, shiftCalendar, visibleRange, type CalendarScale, type CalendarOccurrence } from '../lib/calendar';
import { formatDate } from '../lib/display';
import { CalendarEntry } from '../components/CalendarEntry';
import { STATUS_LABEL, STATUS_ORDER, visibleStatus } from '../lib/progress';

const SCALES: { id: CalendarScale; label: string }[] = [
  { id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }, { id: 'year', label: 'Year' }
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);

interface Props {
  tasks: Task[];
  completions: Completion[];
  today: string;
  onEdit: (task: Task | null, lane?: Lane, defaultDate?: string) => void;
  onDuplicate: (task: Task) => void;
  onStatus: (id: string, status: TaskStatus, postponedTo?: string) => void;
  onReschedule: (id: string, date: string) => void;
}

/** Task data lives in the domain model. The calendar only renders occurrences. */
export function CalendarView({ tasks, completions, today, onEdit, onDuplicate, onStatus, onReschedule }: Props) {
  const [scale, setScale] = useState<CalendarScale>('month');
  const [anchor, setAnchor] = useState(today);
  const [category, setCategory] = useState<Category | 'All'>('All');
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => tasks.filter(t => !t.archivedAt &&
    (category === 'All' || t.category === category) &&
    (!search.trim() || `${t.title} ${t.description} ${t.category}`.toLowerCase().includes(search.trim().toLowerCase()))
  ), [tasks, category, search]);
  const range = visibleRange(anchor, scale);
  const occurrences = useMemo(() => calendarOccurrences(filtered, completions, range.start, range.end), [filtered, completions, range.start, range.end]);
  const byDay = useMemo(() => {
    const result = new Map<string, CalendarOccurrence[]>();
    for (const occurrence of occurrences) result.set(occurrence.date, [...result.get(occurrence.date) ?? [], occurrence]);
    return result;
  }, [occurrences]);
  const unscheduled = filtered.filter(task => !task.dueDate && !task.completedAt);
  const addAt = (date: string) => onEdit(null, 'urgent', date);
  const edit = (task: Task) => onEdit(task);
  const unschedule = (task: Task) => onReschedule(task.id, '');
  const entry = (occurrence: CalendarOccurrence, compact = false) => <CalendarEntry key={`${occurrence.task.id}-${occurrence.date}`} occurrence={occurrence} compact={compact}
    onEdit={edit} onDuplicate={onDuplicate} onStatus={onStatus} onUnschedule={unschedule}/>;
  function dropTask(event: DragEvent<HTMLElement>, date: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    if (filtered.some(task => task.id === id)) onReschedule(id, date);
  }
  function dropProps(date: string) {
    return { onDragOver: (event: DragEvent<HTMLElement>) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; },
      onDrop: (event: DragEvent<HTMLElement>) => dropTask(event, date) };
  }
  function openDay(date: string) { setAnchor(date); setScale('day'); }
  const dayEntries = byDay.get(anchor) ?? [];
  const withTime = dayEntries.filter(item => item.task.scheduledTime);
  const anytime = dayEntries.filter(item => !item.task.scheduledTime);
  const otherHours = withTime.filter(item => { const h = Number(item.task.scheduledTime.slice(0, 2)); return h < 6 || h > 22; });

  return <>
    <div className="page-title-row calendar-page-title"><div><span className="eyebrow">MAKE TIME FOR WHAT MATTERS</span><h1>Calendar <span className="heading-sparkle">✳</span></h1><p>Your tasks and appointments, on the dates you choose. Undated tasks stay unscheduled.</p></div><button className="button button-primary" onClick={() => addAt(anchor)}><Plus size={17}/> Add on {formatDate(anchor)}</button></div>
    <section className="calendar-toolbar panel" aria-label="Calendar controls">
      <div className="calendar-navigation">
        <button className="icon-button" aria-label="Previous period" onClick={() => setAnchor(value => shiftCalendar(value, scale, -1))}><ChevronLeft size={20}/></button>
        <button className="button button-secondary calendar-today-button" onClick={() => setAnchor(today)}>Today</button>
        <button className="icon-button" aria-label="Next period" onClick={() => setAnchor(value => shiftCalendar(value, scale, 1))}><ChevronRight size={20}/></button>
        <h2>{dateTitle(anchor, scale)}</h2>
      </div>
      <div className="calendar-scale-switch" role="group" aria-label="Calendar view">
        {SCALES.map(item => <button key={item.id} type="button" aria-pressed={scale === item.id} className={scale === item.id ? 'selected' : ''} onClick={() => setScale(item.id)}>{item.label}</button>)}
      </div>
    </section>
    <div className="calendar-filter-row">
      <label className="calendar-filter"><Search size={16}/><input aria-label="Search calendar tasks" placeholder="Find a scheduled task" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button aria-label="Clear calendar search" onClick={() => setSearch('')}><X size={15}/></button>}</label>
      <label className="calendar-filter-select">Area <select aria-label="Calendar category" value={category} onChange={e => setCategory(e.target.value as Category | 'All')}><option value="All">All areas</option>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}</select></label>
      <span className="calendar-count">{occurrences.length} scheduled {occurrences.length === 1 ? 'occurrence' : 'occurrences'} shown</span>
    </div>
    <div className="calendar-legend" aria-label="Task status legend">{STATUS_ORDER.map(status => <span key={status}><span className={`calendar-status-dot status-${status}`}/>{STATUS_LABEL[status]}</span>)}</div>
    <div className="calendar-layout">
      <div className="calendar-main">
        {scale === 'day' && <section className="panel calendar-day">
          <div className="calendar-day-heading"><CalendarDays size={19}/><h3>{dateTitle(anchor, 'day')}</h3><button type="button" className="button button-secondary" onClick={() => addAt(anchor)}><Plus size={15}/> Add task</button></div>
          <div className="calendar-anytime" {...dropProps(anchor)}><h3>Anytime</h3>{anytime.length ? anytime.map(item => entry(item)) : <p>Nothing scheduled without a time. Add a task or drag one here.</p>}</div>
          <div className="calendar-hours">{HOURS.map(hour => <div key={hour} className="calendar-hour" {...dropProps(anchor)}>
            <div className="calendar-hour-label">{String(hour).padStart(2, '0')}:00</div>
            <div className="calendar-hour-body">{withTime.filter(item => Number(item.task.scheduledTime.slice(0, 2)) === hour).map(item => entry(item))}</div>
          </div>)}{otherHours.length > 0 && <div className="calendar-hour"><div className="calendar-hour-label">Other</div><div className="calendar-hour-body">{otherHours.map(item => entry(item))}</div></div>}</div>
        </section>}
        {scale === 'week' && <div className="calendar-week-scroller"><div className="calendar-week" role="grid" aria-label="Weekly calendar">
          {Array.from({ length: 7 }, (_, i) => addDays(range.start, i)).map(date => <section className={`calendar-week-day ${date === today ? 'is-today' : ''}`} key={date} data-testid={`calendar-date-${date}`} {...dropProps(date)}>
            <div className="calendar-week-heading"><button onClick={() => openDay(date)}><span>{WEEKDAYS[(dateUTC(date).getUTCDay() + 6) % 7]}</span><strong>{date.slice(-2)}</strong></button><button aria-label={`Add task on ${date}`} onClick={() => addAt(date)}><Plus size={15}/></button></div>
            <div className="calendar-week-items">{(byDay.get(date) ?? []).map(item => entry(item))}{!(byDay.get(date)?.length) && <p className="calendar-week-empty">Drop a task or add one</p>}</div>
          </section>)}
        </div></div>}
        {scale === 'month' && <div className="panel calendar-month" role="grid" aria-label="Monthly calendar">
          <div className="calendar-weekdays">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>
          <div className="calendar-month-grid">{monthDates(anchor).map(date => {
            const tasksOnDate = byDay.get(date) ?? [];
            return <div key={date} className={`calendar-cell ${date.slice(0, 7) !== anchor.slice(0, 7) ? 'outside' : ''} ${date === today ? 'is-today' : ''}`} data-testid={`calendar-date-${date}`} {...dropProps(date)}>
              <div className="calendar-cell-head"><button className="calendar-day-number" onClick={() => openDay(date)} title={`View ${formatDate(date)}`}>{Number(date.slice(-2))}</button><button className="calendar-cell-add" aria-label={`Add task on ${date}`} title="Add on this date" onClick={() => addAt(date)}><Plus size={15}/></button></div>
              <div className="calendar-cell-entries">{tasksOnDate.slice(0, 3).map(item => entry(item, true))}{tasksOnDate.length > 3 && <button className="calendar-more" onClick={() => openDay(date)}>+{tasksOnDate.length - 3} more</button>}</div>
            </div>;
          })}</div>
        </div>}
        {scale === 'year' && <div className="calendar-year" aria-label="Yearly calendar">{Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
          const monthAnchor = `${anchor.slice(0, 4)}-${String(month).padStart(2, '0')}-01`;
          const days = monthDates(monthAnchor);
          const count = occurrences.filter(item => item.date.slice(0, 7) === monthAnchor.slice(0, 7)).length;
          return <button type="button" className="panel calendar-year-month" key={month} onClick={() => { setAnchor(monthAnchor); setScale('month'); }} aria-label={`Open ${dateTitle(monthAnchor, 'month')}, ${count} tasks`}>
            <div className="year-month-heading"><strong>{dateTitle(monthAnchor, 'month').split(' ')[0]}</strong><span>{count} tasks</span></div>
            <div className="year-mini-grid">{WEEKDAYS.map(day => <small key={day}>{day[0]}</small>)}{days.map(date => {
              const occurrences = byDay.get(date) ?? [];
              const labels = occurrences.map(item => visibleStatus(item.task, item.completed));
              const important = (['postponed', 'progressing', 'started', 'not-started', 'finished'] as TaskStatus[]).find(status => labels.includes(status));
              const summary = [...new Set(labels)].map(status => STATUS_LABEL[status]).join(', ');
              return <span key={date} title={occurrences.length ? `${date}: ${occurrences.length} task(s) — ${summary}` : date}
                className={`${date.slice(0, 7) === monthAnchor.slice(0, 7) ? '' : 'outside'} ${date === today ? 'today' : ''} ${occurrences.length ? 'scheduled' : ''} ${important ? `status-${important}` : ''}`}>
                {date.slice(0, 7) === monthAnchor.slice(0, 7) ? Number(date.slice(-2)) : ''}
              </span>;
            })}</div>
          </button>;
        })}</div>}
        <p className="calendar-footnote">Drag tasks between dates on desktop or edit a task's date on mobile. Moving a repeating task moves its whole series, not an individual occurrence. Removing it from the calendar keeps it on the task board.</p>
      </div>
      <aside className="calendar-unscheduled panel" aria-label="Unscheduled tasks">
        <div className="calendar-unscheduled-head"><div><span className="eyebrow">YOUR BACKLOG</span><h3>Unscheduled <span>{unscheduled.length}</span></h3></div><button className="icon-button" title="Add an unscheduled task" aria-label="Add unscheduled task" onClick={() => onEdit(null, 'urgent')}><Plus size={17}/></button></div>
        <p>These tasks have no due date. Schedule them only when you know the date.</p>
        <div className="calendar-unscheduled-list">{unscheduled.slice(0, 35).map(task => <div className="calendar-unscheduled-item" key={task.id}><button onClick={() => onEdit(task)}><strong>{task.title}</strong><small>{task.category}</small></button><button className="text-link" aria-label={`Schedule ${task.title}`} onClick={() => onEdit(task, task.lane, anchor)}>Schedule</button></div>)}</div>
        {unscheduled.length > 35 && <p>{unscheduled.length - 35} more unscheduled tasks. Narrow by area or search to find them.</p>}
      </aside>
    </div>
  </>;
}
