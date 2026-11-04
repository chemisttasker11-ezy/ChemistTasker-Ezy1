import { Check, CheckCircle2, ChevronRight } from 'lucide-react';
import { periodKey, isCompleted, type BoardState, type Lane, type Task, type View } from '../model';
import { EmptyState } from '../components/EmptyState';

interface Props {
  board: BoardState; day: string; showEditor: (task: Task | null, lane?: Lane) => void;
  navigate: (view: View) => void; toggleTask: (id: string) => void;
}

export function CompletedView({ board, day, showEditor, navigate, toggleTask }: Props) {
  return <>
          <div className="page-title-row"><div><span className="eyebrow">LOOK HOW FAR YOU'VE COME</span><h1>Completed tasks <span className="heading-sparkle">✓</span></h1><p>Your completion history, including individual recurring-task check-ins.</p></div></div>
          <div className="completed-banner"><CheckCircle2 size={25}/><div><strong>{board.completions.length} recorded completions</strong><p>Consistency counts, even when a task repeats.</p></div></div>
          {board.completions.length ? <div className="panel completion-list">{[...board.completions].sort((a,b) => b.completedAt.localeCompare(a.completedAt)).map(c => <div className="history-row" key={c.id}><span className="history-check"><Check size={17}/></span><div><strong>{c.title}</strong><small>{c.category} · {new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeZone: 'Australia/Brisbane' }).format(new Date(c.completedAt))}</small></div>{board.tasks.some(t => t.id === c.taskId && isCompleted(t, board.completions, day) && (t.recurrence === 'none' || c.periodKey === periodKey(t.recurrence, day))) && <button className="text-link" type="button" onClick={() => toggleTask(c.taskId)}>Undo</button>}{board.tasks.some(t => t.id === c.taskId) && <button className="text-link" onClick={() => { const task = board.tasks.find(t => t.id === c.taskId); if (task) showEditor(task); }}>Open <ChevronRight size={15}/></button>}</div>)}</div> : <EmptyState icon={CheckCircle2} title="Your wins will appear here" caption="Mark a task complete to start building your progress history." action={<button className="button button-primary" onClick={() => navigate('today')}>Go to today</button>}/>}
        </>;
}
