import { Activity, ArrowRight, CheckCircle2, ChevronRight, Circle, Plus } from 'lucide-react';
import { type Lane, type Task, type View } from '../model';
import { formatDate, LANE_LABEL, longToday } from '../lib/display';
import { EmptyState } from '../components/EmptyState';
import { STATUS_LABEL } from '../lib/progress';

interface Props {
  todayTasks: Task[]; doneToday: number; day: string;
  navigate: (view: View) => void; showEditor: (task: Task | null, lane?: Lane) => void;
  toggleTask: (id: string) => void;
}

export function TodayView({ todayTasks, doneToday, day, navigate, showEditor, toggleTask }: Props) {
  const overdue = todayTasks.filter(t => t.dueDate && t.dueDate < day);
  return <>
          <div className="page-title-row"><div><span className="eyebrow">ONE THING AT A TIME</span><h1>Your focus today <span className="heading-sparkle">☀️</span></h1><p>{longToday(day)} · Daily habits, urgent matters and due tasks.</p></div><button className="button button-primary" onClick={() => showEditor(null, 'daily')}><Plus size={18}/> Add task</button></div>
          <div className="focus-summary"><span className="focus-summary-icon"><Activity size={22}/></span><div><strong>{todayTasks.length} tasks to focus on</strong><p>It's about making progress, not doing everything at once.</p></div>{overdue.length > 0 && <span className="overdue-counter">{overdue.length} overdue</span>}</div>
          <div className="today-layout"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">TO DO</span><h2>Ready when you are</h2></div></div>{todayTasks.length ? <div className="today-task-list">{[...todayTasks].sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1)).map(t => <div className="today-task-row" key={t.id}><button className="focus-check" aria-label={`Complete ${t.title}`} onClick={() => toggleTask(t.id)}><Circle size={22}/></button><button className="focus-content" onClick={() => showEditor(t)}><strong>{t.title}</strong><small>{t.category} · {LANE_LABEL[t.lane]} {t.dueDate ? `· Due ${formatDate(t.dueDate)}` : ''} · {STATUS_LABEL[t.status]}</small></button>{t.priority === 'high' && <span className="priority-mark">High</span>}<button className="icon-button small" aria-label={`Edit ${t.title}`} onClick={() => showEditor(t)}><ChevronRight size={17}/></button></div>)}</div> : <EmptyState icon={CheckCircle2} title="Nothing waiting for you" caption="All caught up for today. Enjoy the breathing room."/>}</section><section className="panel today-accomplished"><div className="panel-heading"><div><span className="eyebrow">SMALL WINS</span><h2>Today's progress</h2></div></div><div className="done-circle"><CheckCircle2 size={32}/><strong>{doneToday}</strong><span>done today</span></div><p>It's the consistency that adds up.</p><button className="button button-secondary" onClick={() => navigate('completed')}>View completed tasks <ArrowRight size={16}/></button></section></div>
        </>;
}
