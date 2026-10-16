import { type DragEvent } from 'react';
import { CalendarX2, Copy, GripVertical, Pencil } from 'lucide-react';
import { type Task, type TaskStatus } from '../model';
import { type CalendarOccurrence } from '../lib/calendar';
import { checklistTally, STATUS_LABEL, visibleStatus } from '../lib/progress';
import { TaskStatusPicker } from './TaskStatusPicker';

interface Props {
  occurrence: CalendarOccurrence;
  compact?: boolean;
  onEdit: (task: Task) => void;
  onDuplicate: (task: Task) => void;
  onStatus: (id: string, status: TaskStatus, date?: string) => void;
  onUnschedule: (task: Task) => void;
}

/** A calendar occurrence is one visible date; the task is the saved series. */
export function CalendarEntry({ occurrence, compact = false, onEdit, onDuplicate, onStatus, onUnschedule }: Props) {
  const { task, completed } = occurrence;
  const status = visibleStatus(task, completed);
  const steps = checklistTally(task);
  function drag(event: DragEvent<HTMLElement>) {
    event.dataTransfer.setData('text/plain', task.id);
    event.dataTransfer.effectAllowed = 'move';
  }
  if (compact) return <button type="button" draggable onDragStart={drag}
    className={`calendar-chip category-${task.category.toLowerCase()} status-${status}`}
    title={`${task.title} — ${STATUS_LABEL[status]}. Drag onto another date or open to edit.`}
    onClick={() => onEdit(task)}>
      <span className={`calendar-status-dot status-${status}`} aria-hidden="true"/>
      {task.scheduledTime && <small>{task.scheduledTime}</small>}
      <span className="calendar-chip-title">{task.title}</span>
      {steps && <span className="calendar-chip-steps">{steps.done}/{steps.total}</span>}
    </button>;

  return <article className={`calendar-entry category-${task.category.toLowerCase()}`} data-testid={`calendar-task-${task.id}`}>
    <div className="calendar-entry-head">
      <button type="button" className="calendar-entry-title" onClick={() => onEdit(task)}><strong>{task.title}</strong><small>{task.category}{task.scheduledTime ? ` · ${task.scheduledTime}` : ''}</small></button>
      <button type="button" className="icon-button small" draggable onDragStart={drag} title="Drag to another day" aria-label={`Drag ${task.title} to another date`}><GripVertical size={16}/></button>
    </div>
    <div className="calendar-entry-bottom">
      <TaskStatusPicker title={task.title} dueDate={task.dueDate} value={status} onChange={(next, date) => onStatus(task.id, next, date)} compact />
      {steps && <span className="calendar-entry-steps">{steps.done}/{steps.total} steps</span>}
      <div className="calendar-entry-actions">
        <button type="button" onClick={() => onEdit(task)} aria-label={`Edit ${task.title}`} title="Edit"><Pencil size={15}/></button>
        <button type="button" onClick={() => onDuplicate(task)} aria-label={`Duplicate ${task.title}`} title="Duplicate"><Copy size={15}/></button>
        <button type="button" onClick={() => onUnschedule(task)} aria-label={`Remove ${task.title} from calendar`} title="Remove from calendar (task remains on board)"><CalendarX2 size={15}/></button>
      </div>
    </div>
  </article>;
}
