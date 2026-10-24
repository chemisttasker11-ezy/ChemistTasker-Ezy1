import { ArchiveRestore, Trash2 } from 'lucide-react';
import type { Task } from '../model';
import { formatDate } from '../lib/display';

interface Props {
  tasks: Task[];
  restore: (id: string) => void;
  remove: (id: string) => void;
}

export function ArchivedView({ tasks, restore, remove }: Props) {
  return <>
    <div className="page-title-row">
      <div>
        <span className="eyebrow">OUT OF SIGHT, NEVER LOST</span>
        <h1>Archived tasks</h1>
        <p>Move tasks out of your active board. Restore or permanently delete them here.</p>
      </div>
    </div>
    {tasks.length === 0 ? (
      <div className="panel empty-state"><ArchiveRestore size={32}/><h3>No archived tasks</h3><p>Archived tasks will appear here when you need them.</p></div>
    ) : (
      <section className="panel archive-list" aria-label="Archived task list">
        {tasks.map(task => <div className="archive-row" key={task.id}>
          <div className="archive-entry">
            <strong>{task.title}</strong>
            <small>{task.category} · Archived {task.archivedAt ? formatDate(task.archivedAt.slice(0, 10)) : 'previously'}</small>
          </div>
          <button className="button button-secondary button-small" type="button" onClick={() => restore(task.id)}><ArchiveRestore size={16}/> Restore</button>
          <button className="icon-button small" type="button" aria-label={`Permanently delete ${task.title}`} title="Permanently delete" onClick={() => remove(task.id)}><Trash2 size={16}/></button>
        </div>)}
      </section>
    )}
  </>;
}
