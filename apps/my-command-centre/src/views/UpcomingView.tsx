import { CalendarDays, Check, Plus } from 'lucide-react';
import { type Lane, type Task } from '../model';
import { formatDate, LANE_LABEL } from '../lib/display';
import { EmptyState } from '../components/EmptyState';

interface Props {
  active: Task[]; day: string; completed: (task: Task) => boolean;
  showEditor: (task: Task | null, lane?: Lane) => void; toggleTask: (id: string) => void;
}

export function UpcomingView({ active, day, completed, showEditor, toggleTask }: Props) {
  return <>
          <div className="page-title-row"><div><span className="eyebrow">LOOK AHEAD</span><h1>Upcoming <span className="heading-sparkle">✳</span></h1><p>Only tasks with dates appear here. No made-up deadlines.</p></div><button className="button button-primary" onClick={() => showEditor(null, 'urgent')}><Plus size={18}/> Add a due date</button></div>
          {active.filter(t => t.dueDate).length ? <div className="panel upcoming-panel">{[...active].filter(t => t.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(t => <div className="upcoming-row" key={t.id}><div className={`upcoming-date ${t.dueDate < day && !completed(t) ? 'is-overdue' : ''}`}><strong>{t.dueDate.slice(8,10)}</strong><span>{formatDate(t.dueDate).split(' ')[1]}</span></div><div className="upcoming-item"><button onClick={() => showEditor(t)}><strong>{t.title}</strong><small>{t.category} · {LANE_LABEL[t.lane]} · {completed(t) ? 'Complete this period' : t.dueDate < day ? 'Overdue' : t.dueDate === day ? 'Due today' : 'Upcoming'}</small></button></div><button className={`round-check ${completed(t) ? 'checked' : ''}`} aria-label={`Toggle ${t.title}`} onClick={() => toggleTask(t.id)}>{completed(t) ? <Check size={14}/> : null}</button></div>)}</div> : <EmptyState icon={CalendarDays} title="No deadlines set yet" caption="Add a due date to any task and it will show up here." action={<button className="button button-primary" onClick={() => showEditor(null, 'urgent')}>Create a dated task</button>}/>}
        </>;
}
