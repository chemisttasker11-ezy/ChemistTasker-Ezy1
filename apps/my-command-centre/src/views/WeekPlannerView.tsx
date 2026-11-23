import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Circle, ClipboardList, Flag, Plus, Target, TrendingUp } from 'lucide-react';
import { type BoardState, type Lane, type Task, type View, type WeekReview } from '../model';
import { addDays, calendarOccurrences, dateTitle, mondayOf } from '../lib/calendar';
import { formatDate } from '../lib/display';
import { STATUS_LABEL, visibleStatus } from '../lib/progress';
import { PRIORITY_WEIGHTS, scoreWeek, STATUS_POINTS } from '../lib/scoring';
import { WeeklyScoreMeter } from '../components/WeeklyScoreMeter';

type ReviewNotes = Pick<WeekReview, 'wins' | 'blockers' | 'adjustment'>;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface Props {
  board: BoardState;
  today: string;
  navigate: (view: View) => void;
  onEdit: (task: Task | null, lane?: Lane, defaultDate?: string) => void;
  onInclude: (weekStart: string, id: string, include: boolean) => void;
  onFocus: (date: string, id: string) => void;
  onReview: (weekStart: string, notes: ReviewNotes) => void;
}

/** Visual planning composes the shared calendar projector and pure score model. */
export function WeekPlannerView({ board, today, navigate, onEdit, onInclude, onFocus, onReview }: Props) {
  const [anchor, setAnchor] = useState(today);
  const weekStart = mondayOf(anchor);
  const weekEnd = addDays(weekStart, 6);
  const isPastWeek = weekEnd < today;
  const plan = board.weekPlans?.[weekStart];
  const summary = useMemo(() => scoreWeek(plan, board, weekStart, today), [plan, board, weekStart, today]);
  const shownPercent = isPastWeek && plan?.review?.savedAt ? plan.review.scoreSnapshot : summary.percent;
  const [notes, setNotes] = useState<ReviewNotes>({ wins: '', blockers: '', adjustment: '' });
  useEffect(() => {
    setNotes({
      wins: board.weekPlans?.[weekStart]?.review?.wins ?? '',
      blockers: board.weekPlans?.[weekStart]?.review?.blockers ?? '',
      adjustment: board.weekPlans?.[weekStart]?.review?.adjustment ?? ''
    });
  // Deliberately reset the draft only when changing weeks, not on every status update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);
  const scheduled = useMemo(
    () => calendarOccurrences(board.tasks, board.completions, weekStart, weekEnd),
    [board.tasks, board.completions, weekStart, weekEnd]
  );
  const byDay = useMemo(() => {
    const grouped = new Map<string, typeof scheduled>();
    for (const item of scheduled) grouped.set(item.date, [...(grouped.get(item.date) ?? []), item]);
    return grouped;
  }, [scheduled]);
  const plannedIds = new Set(plan?.commitments.map(item => item.taskId) ?? []);
  const candidates = [...new Map(scheduled.filter(item => !plannedIds.has(item.task.id)).map(item => [item.task.id, item.task])).values()];
  const backlog = board.tasks.filter(task => !task.archivedAt && !task.dueDate &&
    !task.completedAt && !plannedIds.has(task.id) && task.lane !== 'goals').slice(0, 8);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return <div className="week-planner">
    <header className="week-page-heading">
      <div><h1>Plan your week</h1><p>Commit to a realistic week, choose three priorities each day and learn from the results.</p></div>
      <button className="button button-secondary" type="button" onClick={() => navigate('calendar')}><CalendarDays size={18}/> Full calendar <ArrowRight size={16}/></button>
    </header>
    <div className="week-navigation panel">
      <div className="week-navigation-controls">
        <button className="icon-button" type="button" onClick={() => setAnchor(addDays(weekStart, -7))} aria-label="Previous week"><ChevronLeft size={20}/></button>
        <button className="button button-secondary" type="button" onClick={() => setAnchor(today)}>This week</button>
        <button className="icon-button" type="button" onClick={() => setAnchor(addDays(weekStart, 7))} aria-label="Next week"><ChevronRight size={20}/></button>
        <h2>{dateTitle(weekStart, 'week')}</h2>
      </div>
      <span className="week-phase">{weekStart === mondayOf(today) ? 'Current week' : isPastWeek ? 'Past week' : 'Coming up'}</span>
    </div>

    <section className="week-overview panel" aria-label="Weekly progress and scoring">
      <div className="week-score-main">
        <span className="week-overline">Your weekly progress</span>
        <WeeklyScoreMeter percent={shownPercent} label="Weighted week score"/>
        <p>{summary.planned
          ? 'Based on work you committed to, not work moved elsewhere. High-priority work carries more weight.'
          : 'Select the work you actually intend to complete. A score appears once you commit to tasks.'}</p>
      </div>
      <div className="week-numbers">
        <div><ClipboardList size={20}/><strong>{summary.planned}</strong><span>Committed</span></div>
        <div><CheckCircle2 size={20}/><strong>{summary.finished}</strong><span>Finished</span></div>
        <div><Target size={20}/><strong>{summary.postponed}</strong><span>Postponed</span></div>
      </div>
    </section>

    <section className="week-days-section" aria-label="Plan by day">
      <div className="week-section-title"><h2>Seven days, one clear plan</h2><p>Choose up to three priorities for each day. Open any task to edit it, or use Calendar to move its date.</p></div>
      <div className="week-days-grid">
        {days.map((date, index) => {
          const focusIds = board.dailyFocus?.[date] ?? [];
          const events = byDay.get(date) ?? [];
          return <section key={date} className={`week-day ${date === today ? 'is-today' : ''}`} aria-label={`${DAYS[index]}, ${formatDate(date)}`}>
            <div className="week-day-head">
              <span>{DAYS[index].slice(0, 3)}</span><strong>{Number(date.slice(-2))}</strong>
              <button type="button" aria-label={`Add task on ${formatDate(date)}`} title="Add task" onClick={() => onEdit(null, 'daily', date)}><Plus size={17}/></button>
            </div>
            <div className="week-day-focus"><Target size={14}/><span>{focusIds.length}/3 focused</span></div>
            <div className="week-day-events">
              {events.length ? events.map(item => {
                const status = visibleStatus(item.task, item.completed);
                const pinned = focusIds.includes(item.task.id);
                return <article className={`week-task status-${status}`} key={`${item.task.id}-${item.date}`}>
                  <button type="button" className="week-task-title" onClick={() => onEdit(item.task)}>
                    <strong>{item.task.title}</strong>
                    <small>{item.task.scheduledTime ? `${item.task.scheduledTime} · ` : ''}{STATUS_LABEL[status]} · {STATUS_POINTS[status]} pts</small>
                  </button>
                  <div className="week-task-controls">
                    <button type="button" className={`week-focus-toggle ${pinned ? 'is-selected' : ''}`}
                      aria-pressed={pinned} aria-label={`${pinned ? 'Remove' : 'Select'} ${item.task.title} ${pinned ? 'from' : 'for'} top three on ${formatDate(date)}`}
                      disabled={!pinned && focusIds.length >= 3}
                      onClick={() => onFocus(date, item.task.id)}><Target size={15}/></button>
                    <button type="button" className={`week-commit-toggle ${plannedIds.has(item.task.id) ? 'is-selected' : ''}`}
                      aria-pressed={plannedIds.has(item.task.id)}
                      onClick={() => onInclude(weekStart, item.task.id, !plannedIds.has(item.task.id))}>
                      {plannedIds.has(item.task.id) ? 'Planned' : '+ Plan'}
                    </button>
                  </div>
                </article>;
              }) : <p className="week-day-empty">Space for what matters.</p>}
            </div>
          </section>;
        })}
      </div>
    </section>

    <div className="week-bottom-grid">
      <section className="panel week-commitments" aria-label="Committed tasks">
        <header className="week-panel-head"><div><h2>My commitments</h2><p>{summary.planned} selected · Postponed work still counts in this week's score.</p></div><Flag size={19}/></header>
        {summary.items.length ? <div className="week-commit-list">{summary.items.map(item => <div className="week-commit-row" key={item.commitment.taskId}>
          <span className={`week-status-mark status-${item.status}`} aria-hidden="true"><Circle size={12}/></span>
          <div className="week-commit-details">
            <strong>{item.commitment.title}</strong>
            <span>{STATUS_LABEL[item.status]} · {item.points} pts · {PRIORITY_WEIGHTS[item.commitment.priority]}× weight{item.commitment.plannedDate ? ` · Planned ${formatDate(item.commitment.plannedDate)}` : ''}</span>
            {item.task && item.commitment.plannedDate && item.task.dueDate !== item.commitment.plannedDate && <small>Now scheduled {item.task.dueDate ? formatDate(item.task.dueDate) : 'without a date'} — still in this plan.</small>}
          </div>
          <strong className="week-earned-points">{item.earned}/{item.possible}</strong>
          {item.task && <button type="button" className="week-remove" onClick={() => onInclude(weekStart, item.commitment.taskId, false)} aria-label={`Remove ${item.commitment.title} from weekly plan`}>Remove</button>}
        </div>)}</div> : <div className="week-empty-commit"><ClipboardList size={26}/><h3>Your plan starts here</h3><p>Scheduled tasks appear below. Add only what you realistically expect to finish.</p></div>}
        <div className="week-pick-list"><h3>Available this week</h3>
          {candidates.slice(0, 12).map(task => <div className="week-pick-row" key={task.id}><span>{task.title}</span><button type="button" onClick={() => onInclude(weekStart, task.id, true)}>Add to plan</button></div>)}
          {!candidates.length && <p className="week-muted">No unplanned scheduled tasks. Use Calendar to schedule more.</p>}
        </div>
        {backlog.length > 0 && <div className="week-pick-list week-backlog"><h3>From your unscheduled board</h3>
          {backlog.map(task => <div className="week-pick-row" key={task.id}><span>{task.title}</span><button type="button" onClick={() => onEdit(task, task.lane, weekStart)}>Schedule</button></div>)}
        </div>}
      </section>

      <section className="panel week-review" aria-label="Weekly review">
        <header className="week-panel-head"><div><h2>Close the loop</h2><p>A short review makes your next plan more realistic.</p></div><TrendingUp size={20}/></header>
        <form onSubmit={event => { event.preventDefault(); if (summary.planned) onReview(weekStart, notes); }}>
          <label>What went well?<textarea maxLength={1400} rows={3} value={notes.wins} onChange={event => setNotes(s => ({ ...s, wins: event.target.value }))} placeholder="A few wins worth repeating…"/></label>
          <label>What got in the way?<textarea maxLength={1400} rows={3} value={notes.blockers} onChange={event => setNotes(s => ({ ...s, blockers: event.target.value }))} placeholder="Limited time, waiting for a reply…"/></label>
          <label>What will you adjust next week?<textarea maxLength={1400} rows={3} value={notes.adjustment} onChange={event => setNotes(s => ({ ...s, adjustment: event.target.value }))} placeholder="One practical change…"/></label>
          <button className="button button-primary" type="submit" disabled={!summary.planned}>Save weekly review</button>
          <p className="week-review-footnote">{plan?.review?.savedAt ? 'Review saved. Past weeks show the score captured when you last saved it.' : 'Saving records the current score for future reference.'}</p>
        </form>
      </section>
    </div>

    <details className="week-scoring-guide panel">
      <summary>How the score works <ChevronRight size={17}/></summary>
      <p>Your weekly score is the weighted average of the status scores for tasks you deliberately committed to. High priority counts 3×, medium 2× and low 1×. Moving or postponing a task does not remove it automatically.</p>
      <div className="week-score-legend"><span>Not started <strong>0</strong></span><span>Started <strong>25</strong></span><span>Progressing <strong>60</strong></span><span>Finished <strong>100</strong></span><span>Postponed <strong>0</strong></span></div>
      <p>Checklist ticks are deliberately separate from status scoring. Finishing any occurrence of a recurring task during the week counts as finished for that weekly commitment.</p>
    </details>
  </div>;
}
