import { useState } from 'react';
import { CalendarClock, Check, X } from 'lucide-react';
import { brisbaneToday, type TaskStatus } from '../model';
import { addDays } from '../lib/calendar';
import { STATUS_LABEL, STATUS_ORDER } from '../lib/progress';

interface Props {
  title: string;
  value: TaskStatus;
  dueDate: string;
  onChange: (status: TaskStatus, postponedTo?: string) => void;
  compact?: boolean;
}

/** The same five statuses work in the board and calendar; postponing requires a date. */
export function TaskStatusPicker({ title, value, dueDate, onChange, compact = false }: Props) {
  const [postponing, setPostponing] = useState(false);
  const earliest = dueDate > brisbaneToday() ? dueDate : brisbaneToday();
  const [target, setTarget] = useState(addDays(earliest, 1));
  function change(next: TaskStatus) {
    if (next === 'postponed') { setTarget(addDays(earliest, 1)); setPostponing(true); return; }
    onChange(next);
    setPostponing(false);
  }
  return <div className={`task-status-wrapper ${compact ? 'compact' : ''}`} onClick={e => e.stopPropagation()}>
    <label className={`task-status status-${value}`}>
      <span className="sr-only">Status for {title}</span>
      <select value={value} aria-label={`Status for ${title}`} onChange={e => change(e.target.value as TaskStatus)}>
        {STATUS_ORDER.map(status => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
      </select>
    </label>
    {value === 'postponed' && <button type="button" className="status-replan" onClick={() => { setTarget(addDays(earliest, 1)); setPostponing(true); }} title="Move to another date" aria-label={`Change postponed date for ${title}`}><CalendarClock size={14}/></button>}
    {postponing && <div className="postpone-popup" role="group" aria-label={`Postpone ${title}`}>
      <label>Move to another date<input aria-label={`New date for ${title}`} type="date" min={addDays(earliest, 1)} value={target} onChange={e => setTarget(e.target.value)}/></label>
      <div className="postpone-actions">
        <button type="button" className="button button-primary" disabled={!target || target <= earliest} onClick={() => { onChange('postponed', target); setPostponing(false); }}><Check size={14}/> Move</button>
        <button type="button" className="button button-ghost" onClick={() => setPostponing(false)}><X size={14}/> Cancel</button>
      </div>
    </div>}
  </div>;
}
