import { useState, type HTMLAttributes } from 'react';
import { Archive, ArrowRight, CalendarDays, Check, Clock3, Flag, GripVertical, MoreHorizontal, Plus, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LANES, type Lane, type Task } from '../model';
import { categoryInfo, formatDate, RECUR_LABEL, taskDue } from '../lib/display';

interface CardProps {
  task: Task; done: boolean; day: string; onComplete: (id: string) => void;
  onEdit: (t: Task) => void; onMove: (id: string, lane: Lane) => void; onArchive: (id: string) => void;
  onSubtask: (taskId: string, subtaskId: string) => void; ghost?: boolean; dragHandle?: HTMLAttributes<HTMLButtonElement>;
}
export function CardPresentation({ task, done, day, onComplete, onEdit, onMove, onArchive, onSubtask, ghost, dragHandle }: CardProps) {
  const [menu, setMenu] = useState(false);
  const due = taskDue(task, day, done);
  const tally = task.subtasks.filter(s => s.done).length;
  return (
    <div className={`task-card ${done ? 'is-done' : ''} ${ghost ? 'is-ghost' : ''}`} data-testid={`task-${task.id}`}>
      <div className="task-top">
        <span className={`category-pill tone-${categoryInfo(task.category).tone}`}>
          <span aria-hidden="true">{categoryInfo(task.category).emoji}</span> {task.category}
        </span>
        <div className="card-actions">
          {!ghost && (
            <>
              <button type="button" className="icon-button small subtle" aria-label={`More options for ${task.title}`} onClick={() => setMenu(!menu)}><MoreHorizontal size={17} /></button>
              <button type="button" className="drag-handle" aria-label={`Drag ${task.title}`} title="Drag to move task" {...dragHandle}><GripVertical size={18} /></button>
            </>
          )}
          {menu && !ghost && <div className="card-popover">
            <button type="button" onClick={() => { setMenu(false); onEdit(task); }}><SlidersHorizontal size={15}/> Edit task</button>
            <div className="popover-label">Move to</div>
            {LANES.filter(l => l.id !== task.lane).map(l => <button type="button" key={l.id} onClick={() => { setMenu(false); onMove(task.id, l.id); }}><ArrowRight size={14}/> {l.title}</button>)}
            <button type="button" className="danger" onClick={() => { setMenu(false); onArchive(task.id); }}><Archive size={15}/> Archive task</button>
          </div>}
        </div>
      </div>
      <div className="task-heading">
        <button className={`round-check ${done ? 'checked' : ''}`} title={done ? 'Undo completion' : 'Mark complete'} aria-label={`${done ? 'Undo completion of' : 'Complete'} ${task.title}`} onClick={() => !ghost && onComplete(task.id)} type="button">
          {done ? <Check size={15} strokeWidth={3}/> : null}
        </button>
        <button type="button" className="task-title" onClick={() => !ghost && onEdit(task)}>{task.title}</button>
      </div>
      {task.description && <p className="task-description">{task.description}</p>}
      {task.subtasks.length > 0 && <div className="subtasks-snippet">
        <div className="mini-progress"><span style={{ width: `${(tally / task.subtasks.length) * 100}%` }}/></div>
        <span>{tally}/{task.subtasks.length}</span>
        {!ghost && task.subtasks.length <= 2 && <div className="subtask-quick">{task.subtasks.map(s =>
          <label key={s.id} onClick={e => e.stopPropagation()}><input type="checkbox" checked={s.done} onChange={() => onSubtask(task.id, s.id)}/><span>{s.title}</span></label>
        )}</div>}
      </div>}
      <div className="task-footer">
        <div className="task-meta">
          {task.priority === 'high' && <span className="meta urgency"><Flag size={12} /> High</span>}
          {task.dueDate && <span className={`meta ${due ? 'overdue' : ''}`}><CalendarDays size={13}/> {formatDate(task.dueDate)}</span>}
          {task.recurrence !== 'none' && <span className="meta"><RotateCcw size={12}/>{RECUR_LABEL[task.recurrence]}</span>}
          {task.estimateMinutes > 0 && <span className="meta"><Clock3 size={12}/>{task.estimateMinutes}m</span>}
        </div>
        {task.origin === 'notebook' && <span className="notebook-dot" title="From your notebook" aria-label="From notebook"/>}
      </div>
    </div>
  );
}

function SortableCard(props: Omit<CardProps, 'dragHandle' | 'ghost'>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.task.id, data: { lane: props.task.lane, type: 'task' } });
  return (
    <div ref={setNodeRef} className={isDragging ? 'sortable-placeholder' : ''} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <CardPresentation {...props} dragHandle={{ ...attributes, ...listeners }}/>
    </div>
  );
}
interface LaneProps {
  lane: (typeof LANES)[number]; tasks: Task[]; completed: (task: Task) => boolean;
  day: string; onAdd: (lane: Lane) => void; onComplete: (id: string) => void;
  onEdit: (t: Task) => void; onMove: (id: string, lane: Lane) => void; onArchive: (id: string) => void;
  onSubtask: (taskId: string, subtaskId: string) => void;
}
export function BoardLane({ lane, tasks, completed, day, onAdd, onComplete, onEdit, onMove, onArchive, onSubtask }: LaneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: lane.id, data: { type: 'lane', lane: lane.id } });
  return <section className={`board-lane lane-${lane.tone} ${isOver ? 'lane-over' : ''}`} aria-label={`${lane.title} tasks`}>
    <header className="lane-header">
      <div className="lane-heading"><span className="lane-emoji">{lane.emoji}</span><div><h3>{lane.title} <span className="lane-count">{tasks.length}</span></h3><p>{lane.description}</p></div></div>
      <button className="icon-button lane-add" onClick={() => onAdd(lane.id)} aria-label={`Add task to ${lane.title}`} title="Add task"><Plus size={18}/></button>
    </header>
    <div ref={setNodeRef} className="lane-dropzone" data-testid={`lane-${lane.id}`}>
      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        {tasks.map(task => <SortableCard key={task.id} task={task} day={day} done={completed(task)} onComplete={onComplete} onEdit={onEdit} onMove={onMove} onArchive={onArchive} onSubtask={onSubtask}/>)}
      </SortableContext>
      {tasks.length === 0 && <div className="lane-empty"><span>✦</span><p>Drop a task here</p><button onClick={() => onAdd(lane.id)}>+ Add a task</button></div>}
      <button className="lane-new" type="button" onClick={() => onAdd(lane.id)}><Plus size={15}/> Add task</button>
    </div>
  </section>;
}

