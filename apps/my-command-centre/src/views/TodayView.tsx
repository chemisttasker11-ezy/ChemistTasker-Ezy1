import { Activity, ArrowRight, Check, CheckCircle2, ChevronRight, Circle, Plus, Target } from 'lucide-react';
import { type Lane, type Task, type View } from '../model';
import { formatDate, LANE_LABEL, longToday } from '../lib/display';
import { EmptyState } from '../components/EmptyState';
import { STATUS_LABEL, visibleStatus } from '../lib/progress';
import { STATUS_POINTS } from '../lib/scoring';

interface Props {
  todayTasks: Task[]; doneToday: number; day: string; allTasks: Task[];
  focusIds: string[]; completed: (task: Task) => boolean;
  onFocus: (date: string, id: string) => void;
  navigate: (view: View) => void; showEditor: (task: Task | null, lane?: Lane) => void;
  toggleTask: (id: string) => void;
}
export function TodayView({ todayTasks, doneToday, day, allTasks, focusIds, completed, onFocus, navigate, showEditor, toggleTask }: Props) {
  const focusTasks = focusIds.map(id => allTasks.find(task => task.id === id && !task.archivedAt)).filter((task): task is Task => Boolean(task));
  const rest = todayTasks.filter(task => !focusIds.includes(task.id)).sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1));
  const overdue = todayTasks.filter(task => task.dueDate && task.dueDate < day);
  function taskRow(task: Task, pinned: boolean) {
    const done = completed(task);
    const status = visibleStatus(task, done);
    return <div className={`today-task-row ${pinned ? 'is-focus' : ''}`} key={task.id}>
      <button type="button" className={`focus-check ${done ? 'checked' : ''}`} aria-label={`${done ? 'Undo completion of' : 'Complete'} ${task.title}`} onClick={() => toggleTask(task.id)}>
        {done ? <Check size={18}/> : <Circle size={22}/>}
      </button>
      <button type="button" className="focus-content" onClick={() => showEditor(task)}>
        <strong>{task.title}</strong>
        <small>{task.category} · {LANE_LABEL[task.lane]}{task.dueDate ? ` · ${formatDate(task.dueDate)}` : ''} · {STATUS_LABEL[status]} ({STATUS_POINTS[status]} pts)</small>
      </button>
      <button type="button" aria-pressed={pinned} disabled={!pinned && focusIds.length >= 3}
        className={`today-focus-button ${pinned ? 'selected' : ''}`} onClick={() => onFocus(day, task.id)}
        aria-label={`${pinned ? 'Remove' : 'Add'} ${task.title} ${pinned ? 'from' : 'to'} today's top three`}
        title={pinned ? 'Remove from top three' : 'Add to top three'}><Target size={17}/></button>
      <button type="button" className="icon-button small today-edit-button" aria-label={`Edit ${task.title}`} onClick={() => showEditor(task)}><ChevronRight size={17}/></button>
    </div>;
  }
  return <>
    <div className="page-title-row"><div><h1>Your focus today</h1><p>{longToday(day)} · Make the important work manageable.</p></div><button className="button button-primary" onClick={() => showEditor(null, 'daily')}><Plus size={18}/> Add task</button></div>
    <div className="focus-summary"><span className="focus-summary-icon"><Activity size={22}/></span><div><strong>{todayTasks.length} tasks on today's list</strong><p>Pick up to three priorities, then work through the rest at your pace.</p></div>{overdue.length > 0 && <span className="overdue-counter">{overdue.length} overdue</span>}</div>
    <section className="panel today-top-three">
      <div className="panel-heading"><div><h2>My three priorities</h2><p>{focusTasks.length}/3 selected. These remain here even when finished.</p></div><button type="button" className="text-link" onClick={() => navigate('week')}>Plan the week <ArrowRight size={16}/></button></div>
      {focusTasks.length
        ? <div className="today-task-list">{focusTasks.map(task => taskRow(task, true))}</div>
        : <EmptyState icon={Target} title="Choose your top three" caption="Use the target icon beside any task below to make it a priority."/>}
    </section>
    <div className="today-layout">
      <section className="panel"><div className="panel-heading"><div><h2>The rest of today</h2><p>Everything else due or in your daily and urgent lanes.</p></div></div>
        {rest.length ? <div className="today-task-list">{rest.map(task => taskRow(task, false))}</div> : <EmptyState icon={CheckCircle2} title="You're up to date" caption="No other unfinished tasks waiting here."/>}
      </section>
      <section className="panel today-accomplished"><div className="panel-heading"><div><h2>Today's progress</h2></div></div><div className="done-circle"><CheckCircle2 size={32}/><strong>{doneToday}</strong><span>done today</span></div><p>Progress comes from following through, not filling every hour.</p><button className="button button-secondary" onClick={() => navigate('completed')}>View completed tasks <ArrowRight size={16}/></button></section>
    </div>
  </>;
}
