import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor,
  closestCorners, pointerWithin, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Activity, Archive, ArrowDownToLine, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check,
  CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle, ClipboardCheck, Clock3,
  Download, FileText, Flag, GripVertical, Heart, Home, Inbox, LayoutDashboard, ListTodo,
  Menu, Moon, MoreHorizontal, Plus, RotateCcw, Search, Settings2, SlidersHorizontal,
  Sparkles, Sun, Target, Trash2, Upload, WandSparkles, X
} from 'lucide-react';
import {
  CATEGORIES, LANES, STORAGE_KEY, SUGGESTIONS, brisbaneToday, createTask, generateId,
  initialState, isCompleted, readState, toggleCompletion, validateImported,
  type BoardState, type Category, type Lane, type Priority, type Recurrence, type Subtask, type Task, type View
} from './model';

type IconType = typeof Home;
const ICONS: Record<View, IconType> = {
  overview: LayoutDashboard, board: ListTodo, today: Sun, upcoming: CalendarDays,
  goals: Target, completed: CheckCircle2, settings: Settings2
};
const NAV: { id: View; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'board', label: 'My task board' },
  { id: 'today', label: 'Today' }, { id: 'upcoming', label: 'Upcoming' },
  { id: 'goals', label: 'Long-term goals' }, { id: 'completed', label: 'Completed' }
];
const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const RECUR_LABEL: Record<Recurrence, string> = {
  none: 'One-time', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly'
};
const LANE_LABEL: Record<Lane, string> = Object.fromEntries(LANES.map(l => [l.id, l.title])) as Record<Lane, string>;

function formatDate(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  const date = new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}
function longToday(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
}
function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-AU', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Australia/Brisbane' }).format(new Date()));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}
function categoryInfo(category: Category) { return CATEGORIES.find(c => c.id === category)!; }
function activeItem(task: Task) { return !task.archivedAt && !(task.recurrence === 'none' && task.completedAt); }
function taskDue(task: Task, day: string, done: boolean) { return Boolean(task.dueDate && task.dueDate <= day && !done); }
function downloadable(filename: string, value: string) {
  const objectURL = URL.createObjectURL(new Blob([value], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a'); a.href = objectURL; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
}

interface CardProps {
  task: Task; done: boolean; day: string; onComplete: (id: string) => void;
  onEdit: (t: Task) => void; onMove: (id: string, lane: Lane) => void; onArchive: (id: string) => void;
  onSubtask: (taskId: string, subtaskId: string) => void; ghost?: boolean; dragHandle?: React.HTMLAttributes<HTMLButtonElement>;
}
function CardPresentation({ task, done, day, onComplete, onEdit, onMove, onArchive, onSubtask, ghost, dragHandle }: CardProps) {
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
function BoardLane({ lane, tasks, completed, day, onAdd, onComplete, onEdit, onMove, onArchive, onSubtask }: LaneProps) {
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

function TaskModal({ task, defaultLane, onDismiss, onSave }: {
  task: Task | null; defaultLane: Lane; onDismiss: () => void; onSave: (task: Task) => void;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [lane, setLane] = useState<Lane>(task?.lane ?? defaultLane);
  const [category, setCategory] = useState<Category>(task?.category ?? 'Personal');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium');
  const [date, setDate] = useState(task?.dueDate ?? '');
  const [recurrence, setRecurrence] = useState<Recurrence>(task?.recurrence ?? ({ urgent: 'none', daily: 'daily', weekly: 'weekly', monthly: 'monthly', quarterly: 'quarterly', goals: 'none' } as Record<Lane, Recurrence>)[defaultLane]);
  const [estimate, setEstimate] = useState(task?.estimateMinutes ? String(task.estimateMinutes) : '');
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks ?? []);
  const [newSubtask, setNewSubtask] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
    const listener = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [onDismiss]);
  function addSubtask() {
    if (!newSubtask.trim()) return;
    setSubtasks(old => [...old, { id: generateId(), title: newSubtask.trim(), done: false }]);
    setNewSubtask('');
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    onSave(createTask({ ...(task ?? {}), id: task?.id, title, description, lane, category, priority, dueDate: date, recurrence,
      estimateMinutes: Math.max(0, Number(estimate) || 0), subtasks, origin: task?.origin ?? 'personal' }));
  }
  return <div className="modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onDismiss(); }}>
    <section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-head"><div><span className="eyebrow">MAKE IT HAPPEN</span><h2 id="modal-title">{task ? 'Edit task' : 'Create a task'}</h2></div><button aria-label="Close editor" type="button" className="icon-button" onClick={onDismiss}><X size={20}/></button></div>
      <form onSubmit={submit}>
        <div className="form-scroll">
          <label className="field full">Task name <input ref={titleRef} maxLength={250} required value={title} placeholder="What needs to get done?" onChange={e => setTitle(e.target.value)}/></label>
          <label className="field full">Notes <textarea rows={3} maxLength={10000} value={description} placeholder="Add context, a next step, or a reminder…" onChange={e => setDescription(e.target.value)}/></label>
          <div className="field-grid">
            <label className="field">Column <select value={lane} onChange={e => {
              const newLane = e.target.value as Lane; setLane(newLane);
            }}>{LANES.map(l => <option value={l.id} key={l.id}>{l.title}</option>)}</select></label>
            <label className="field">Area of life <select value={category} onChange={e => setCategory(e.target.value as Category)}>{CATEGORIES.map(c => <option value={c.id} key={c.id}>{c.id}</option>)}</select></label>
            <label className="field">Priority <select value={priority} onChange={e => setPriority(e.target.value as Priority)}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
            <label className="field">Repeat <select value={recurrence} onChange={e => setRecurrence(e.target.value as Recurrence)}>{(Object.keys(RECUR_LABEL) as Recurrence[]).map(r => <option key={r} value={r}>{RECUR_LABEL[r]}</option>)}</select></label>
            <label className="field">Due date <input type="date" value={date} onChange={e => setDate(e.target.value)}/></label>
            <label className="field">Time estimate (min) <input type="number" min="0" max="100000" placeholder="Optional" value={estimate} onChange={e => setEstimate(e.target.value)}/></label>
          </div>
          <div className="checklist-editor"><h3><ClipboardCheck size={17}/> Checklist</h3>
            {subtasks.map(s => <div className="checklist-editor-row" key={s.id}><input type="checkbox" checked={s.done} aria-label={`Mark ${s.title} complete`} onChange={e => setSubtasks(old => old.map(v => v.id === s.id ? { ...v, done: e.target.checked } : v))}/><span>{s.title}</span><button className="icon-button small" type="button" aria-label={`Remove ${s.title}`} onClick={() => setSubtasks(old => old.filter(v => v.id !== s.id))}><X size={16}/></button></div>)}
            <div className="checklist-add"><input value={newSubtask} maxLength={250} placeholder="Add a small step" onChange={e => setNewSubtask(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } }}/><button type="button" aria-label="Add checklist item" onClick={addSubtask}><Plus size={18}/></button></div>
          </div>
        </div>
        <div className="modal-footer"><button type="button" className="button button-ghost" onClick={onDismiss}>Cancel</button><button type="submit" className="button button-primary"><Check size={17}/>{task ? 'Save changes' : 'Create task'}</button></div>
      </form>
    </section>
  </div>;
}

function EmptyState({ icon: Icon, title, caption, action }: { icon: IconType; title: string; caption: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={24}/></div><h3>{title}</h3><p>{caption}</p>{action}</div>;
}

export default function App() {
  const [board, setBoard] = useState<BoardState>(readState);
  const [view, setView] = useState<View>('overview');
  const [selectedLane, setSelectedLane] = useState<Lane>('urgent');
  const [editor, setEditor] = useState<{ task: Task | null; lane: Lane } | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'All'>('All');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [notice, setNotice] = useState('');
  const [saveError, setSaveError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const day = brisbaneToday();
  const active = useMemo(() => board.tasks.filter(activeItem), [board.tasks]);
  const completed = (task: Task) => isCompleted(task, board.completions, day);
  const visible = useMemo(() => active.filter(t =>
    (categoryFilter === 'All' || t.category === categoryFilter) &&
    (priorityFilter === 'All' || t.priority === priorityFilter) &&
    (!search.trim() || `${t.title} ${t.description} ${t.category}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()))
  ), [active, categoryFilter, priorityFilter, search]);
  const outstanding = active.filter(t => !completed(t));
  const todayTasks = outstanding.filter(t => t.lane === 'daily' || t.lane === 'urgent' || (t.dueDate && t.dueDate <= day));
  const overdue = outstanding.filter(t => t.dueDate && t.dueDate < day);
  const doneToday = board.completions.filter(c => brisbaneToday(new Date(c.completedAt)) === day).length;
  const goals = active.filter(t => t.lane === 'goals');
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 7 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const collisionDetection: CollisionDetection = args => {
    const pointers = pointerWithin(args);
    if (pointers.length) {
      const tasks = pointers.filter(c => !LANES.some(l => l.id === c.id));
      return tasks.length ? tasks : pointers;
    }
    return closestCorners(args);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = board.theme;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(board)); setSaveError(false); }
    catch { setSaveError(true); }
  }, [board]);

  function alertNotice(message: string) { setNotice(message); }
  function navigate(next: View) { setView(next); setMobileNav(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function showEditor(task: Task | null, lane: Lane = 'urgent') { setEditor({ task, lane }); }
  function saveTask(task: Task) {
    setBoard(s => ({ ...s, tasks: s.tasks.some(t => t.id === task.id) ? s.tasks.map(t => t.id === task.id ? task : t) : [...s.tasks, task] }));
    setEditor(null); alertNotice('Task saved');
  }
  function moveTask(id: string, lane: Lane, overId?: string) {
    setBoard(s => {
      const task = s.tasks.find(t => t.id === id);
      if (!task) return s;
      const rest = s.tasks.filter(t => t.id !== id);
      const to = rest.findIndex(t => t.id === overId);
      if (to >= 0 && id === overId) return s;
      const insertion = to >= 0 ? to : rest.length;
      const updated = { ...task, lane, updatedAt: new Date().toISOString() };
      rest.splice(insertion, 0, updated);
      return { ...s, tasks: rest };
    });
    alertNotice(`Moved to ${LANE_LABEL[lane]}`);
  }
  function onDragStart({ active: item }: DragStartEvent) { setDraggingId(String(item.id)); }
  function onDragEnd({ active: item, over }: DragEndEvent) {
    setDraggingId(null);
    if (!over || item.id === over.id) return;
    const id = String(item.id);
    const destination = String(over.id);
    const target = board.tasks.find(t => t.id === destination);
    const lane = target?.lane ?? LANES.find(l => l.id === destination)?.id;
    if (lane) moveTask(id, lane, target?.id);
  }
  function archiveTask(id: string) {
    const task = board.tasks.find(t => t.id === id);
    if (!task || !window.confirm(`Archive “${task.title}”? You can restore it from Settings by importing a previous backup.`)) return;
    setBoard(s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, archivedAt: new Date().toISOString() } : t) }));
    alertNotice('Task archived');
  }
  function toggleTask(id: string) {
    setBoard(s => toggleCompletion(s, id));
    alertNotice('Progress updated');
  }
  function toggleSubtask(taskId: string, subtaskId: string) {
    setBoard(s => ({ ...s, tasks: s.tasks.map(t => t.id !== taskId ? t : { ...t, updatedAt: new Date().toISOString(), subtasks: t.subtasks.map(st => st.id === subtaskId ? { ...st, done: !st.done } : st) }) }));
  }
  function exportData() { downloadable(`my-command-centre-${day}.json`, JSON.stringify(board, null, 2)); alertNotice('Backup downloaded'); }
  async function importData(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alertNotice('Backup file is too large (10 MB limit)'); return; }
    try {
      const incoming = validateImported(JSON.parse(await file.text()));
      if (!window.confirm('Replace all current tasks with this backup? Export a backup first if you want to keep what you have.')) return;
      setBoard(incoming); alertNotice('Backup restored');
    } catch (err) { alertNotice(err instanceof Error ? err.message : 'Could not import backup'); }
    finally { if (fileInputRef.current) fileInputRef.current.value = ''; }
  }
  function reset() {
    if (!window.confirm('Replace ALL your tasks and history with the original notebook tasks? This cannot be undone unless you exported a backup.')) return;
    setBoard(initialState()); navigate('overview'); alertNotice('Original notebook tasks restored');
  }
  const draggingTask = board.tasks.find(t => t.id === draggingId);
  const selectedNav = NAV.find(n => n.id === view);

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Check size={21} strokeWidth={3}/></div><div className="brand-name">my<span>command</span><strong>centre</strong></div><button className="icon-button mobile-close" type="button" aria-label="Close menu" onClick={() => setMobileNav(false)}><X size={20}/></button></div>
      <div className="workspace-label">YOUR WORKSPACE <span className="workspace-dot" /></div>
      <nav className="side-nav" aria-label="Main navigation">
        <p className="nav-section">WORKSPACE</p>
        {NAV.map(n => {
          const Icon = ICONS[n.id];
          const count = n.id === 'today' ? todayTasks.length : n.id === 'goals' ? goals.length : undefined;
          return <button key={n.id} className={`nav-link ${view === n.id ? 'selected' : ''}`} onClick={() => navigate(n.id)}><Icon size={19} strokeWidth={1.9}/><span>{n.label}</span>{typeof count === 'number' && <span className="nav-count">{count}</span>}</button>;
        })}
        <p className="nav-section">PREFERENCES</p>
        <button className={`nav-link ${view === 'settings' ? 'selected' : ''}`} onClick={() => navigate('settings')}><Settings2 size={19}/><span>Settings & backup</span></button>
      </nav>
      <div className="sidebar-bottom"><div className="side-note-icon"><Sparkles size={18}/></div><p><strong>Little steps. Big progress.</strong><br/>Stay focused on what matters, one task at a time.</p><div className="sidebar-avatar"><div className="avatar">MC</div><div><strong>My workspace</strong><span>Private to this browser</span></div><span className="online-dot"/></div></div>
    </aside>
    {mobileNav && <button className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <div className="main-shell">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open menu" onClick={() => setMobileNav(true)}><Menu size={23}/></button><div className="breadcrumb">Workspace <ChevronRight size={14}/> <strong>{view === 'board' ? 'Task board' : view === 'settings' ? 'Settings' : selectedNav?.label}</strong></div></div><div className="topbar-right"><span className="date-chip"><CalendarDays size={16}/>{longToday(day)}</span><button className="icon-button theme-toggle" aria-label="Toggle light or dark theme" onClick={() => setBoard(s => ({ ...s, theme: s.theme === 'light' ? 'dark' : 'light' }))}>{board.theme === 'light' ? <Moon size={19}/> : <Sun size={19}/>}</button><button className="top-add" onClick={() => showEditor(null, 'urgent')}><Plus size={18}/> <span>New task</span></button></div></header>
      <main className="content">
        {saveError && <div className="save-warning" role="alert">Browser storage is unavailable or full. Export your work before leaving this page.</div>}
        {view === 'overview' && <>
          <div className="overview-hero"><div className="hero-text"><div className="eyebrow hero-eyebrow"><span className="live-pulse"/> YOUR PERSONAL SPACE</div><h1>{greeting()} <span className="wave">✳</span></h1><p>One clear place for your work, your family, and everything in between.</p><div className="hero-actions"><button className="button button-white" onClick={() => navigate('today')}>See today's focus <ArrowRight size={17}/></button><button className="button button-glass" onClick={() => navigate('board')}>Open my board <ArrowUpRight size={17}/></button></div></div><div className="hero-art" aria-hidden="true"><div className="art-circle art-a"/><div className="art-circle art-b"/><div className="hero-floating-card"><span className="float-check"><Check size={20}/></span><div><b>Keep moving forward</b><small>One good thing at a time</small></div><Sparkles size={18}/></div><div className="art-sparkle s1">✳</div><div className="art-sparkle s2">✦</div></div></div>
          <div className="stats-row"><div className="stat-card"><div className="stat-icon violet"><ListTodo size={22}/></div><div><span>Open tasks</span><strong>{active.length}</strong><small>Across your workspace</small></div></div><div className="stat-card"><div className="stat-icon coral"><Flag size={22}/></div><div><span>Focus today</span><strong>{todayTasks.length}</strong><small>Ready for your attention</small></div></div><div className="stat-card"><div className="stat-icon mint"><CheckCircle2 size={22}/></div><div><span>Completed today</span><strong>{doneToday}</strong><small>Every step counts</small></div></div><div className="stat-card"><div className="stat-icon amber"><Target size={22}/></div><div><span>Long-term goals</span><strong>{goals.length}</strong><small>Keep the big picture</small></div></div></div>
          <div className="dashboard-grid">
            <section className="panel todays-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR FOCUS</span><h2>Today's priorities <span className="section-emoji">☀️</span></h2><p>Start with what matters most.</p></div><button className="text-link" onClick={() => navigate('today')}>View all <ArrowRight size={16}/></button></div>
              {todayTasks.length ? <div className="focus-list">{[...todayTasks].sort((a, b) => (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1)).slice(0, 6).map(task => <div className="focus-row" key={task.id}><button className="focus-check" aria-label={`Complete ${task.title}`} onClick={() => toggleTask(task.id)}><Circle size={22}/></button><button className="focus-content" onClick={() => showEditor(task)}><strong>{task.title}</strong><small>{task.category} · {LANE_LABEL[task.lane]}</small></button>{task.priority === 'high' && <span className="priority-mark">Priority</span>}<ChevronRight size={16} className="focus-chevron"/></div>)}</div> : <EmptyState icon={CheckCircle2} title="Your day is all clear" caption="Lovely work — or add a new task when you're ready." action={<button className="button button-secondary" onClick={() => showEditor(null, 'daily')}>Add a task</button>}/>}
              <button className="focus-add" onClick={() => showEditor(null, 'daily')}><Plus size={16}/> Add something to today</button>
            </section>
            <div className="dashboard-side"><section className="panel rhythm-panel"><div className="panel-heading"><div><span className="eyebrow">AT A GLANCE</span><h2>Your rhythm</h2></div><button className="icon-button small" onClick={() => navigate('board')} aria-label="Open task board"><ArrowUpRight size={18}/></button></div><div className="rhythm-list">{LANES.slice(0, 5).map(l => { const count = active.filter(t => t.lane === l.id).length; const max = Math.max(1, ...LANES.map(v => active.filter(t => t.lane === v.id).length)); return <button className="rhythm-row" key={l.id} onClick={() => { setSelectedLane(l.id); navigate('board'); }}><span>{l.emoji}</span><span className="rhythm-name">{l.title}</span><span className="rhythm-bar"><span className={`bar-${l.tone}`} style={{ width: `${Math.max(count ? 10 : 0, count / max * 100)}%` }}/></span><strong>{count}</strong></button>; })}</div></section>
              <section className="gentle-reminder"><div className="reminder-art"><Heart size={22} fill="currentColor"/></div><div><span className="eyebrow">A GENTLE REMINDER</span><h3>Make room for life, too.</h3><p>Family time and personal goals belong on the plan, not on the sidelines.</p><button onClick={() => navigate('goals')}>See your goals <ArrowRight size={15}/></button></div></section>
            </div>
          </div>
          <section className="overview-lanes"><div className="panel-heading"><div><span className="eyebrow">STAY ORGANISED</span><h2>Explore your task board</h2><p>Everything in its place. Drag it wherever it belongs.</p></div><button className="text-link" onClick={() => navigate('board')}>Open board <ArrowRight size={16}/></button></div><div className="lane-tiles">{LANES.map(l => <button key={l.id} className={`lane-tile tile-${l.tone}`} onClick={() => { setSelectedLane(l.id); navigate('board'); }}><span>{l.emoji}</span><strong>{l.title}</strong><small>{active.filter(t => t.lane === l.id).length} tasks</small><ArrowUpRight size={16}/></button>)}</div></section>
        </>}
        {view === 'board' && <>
          <div className="page-title-row"><div><span className="eyebrow">MAKE IT HAPPEN</span><h1>My task board <span className="heading-sparkle">✦</span></h1><p>Six spaces for your priorities. Drag tasks between columns, or use each card's menu.</p></div><button className="button button-primary desktop-action" onClick={() => showEditor(null, selectedLane)}><Plus size={18}/> Add task</button></div>
          <div className="board-toolbar"><div className="board-search"><Search size={17}/><input aria-label="Search tasks" placeholder="Search your tasks..." value={search} onChange={e => setSearch(e.target.value)}/>{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={16}/></button>}</div><label className="filter-select"><SlidersHorizontal size={16}/><select aria-label="Filter by category" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as Category | 'All')}><option value="All">All areas</option>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}</select><ChevronDown size={14}/></label><label className="filter-select"><Flag size={16}/><select aria-label="Filter by priority" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as Priority | 'All')}><option value="All">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><ChevronDown size={14}/></label><span className="board-total">{visible.length} tasks</span></div>
          <div className="mobile-lane-picker"><label>Choose a column<select value={selectedLane} onChange={e => setSelectedLane(e.target.value as Lane)}>{LANES.map(l => <option key={l.id} value={l.id}>{l.emoji} {l.title}</option>)}</select></label><span>Use ⋯ on a card to move it.</span></div>
          <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragCancel={() => setDraggingId(null)} onDragEnd={onDragEnd}>
            <div className="board-scroller"><div className="kanban-board">{LANES.map(lane => <div key={lane.id} className={selectedLane === lane.id ? 'mobile-lane-visible' : 'mobile-lane-hidden'}><BoardLane lane={lane} tasks={visible.filter(t => t.lane === lane.id)} completed={completed} day={day} onAdd={l => showEditor(null, l)} onComplete={toggleTask} onEdit={showEditor} onMove={moveTask} onArchive={archiveTask} onSubtask={toggleSubtask}/></div>)}</div></div>
            <DragOverlay>{draggingTask ? <div className="drag-overlay"><CardPresentation task={draggingTask} done={completed(draggingTask)} day={day} onComplete={() => {}} onEdit={() => {}} onMove={() => {}} onArchive={() => {}} onSubtask={() => {}} ghost/></div> : null}</DragOverlay>
          </DndContext><p className="board-help"><GripVertical size={14}/> Drag by the handle to reorder or move. On touch screens, press and hold. The ⋯ menu works everywhere.</p>
        </>}
        {view === 'today' && <>
          <div className="page-title-row"><div><span className="eyebrow">ONE THING AT A TIME</span><h1>Your focus today <span className="heading-sparkle">☀️</span></h1><p>{longToday(day)} · Daily habits, urgent matters and due tasks.</p></div><button className="button button-primary" onClick={() => showEditor(null, 'daily')}><Plus size={18}/> Add task</button></div>
          <div className="focus-summary"><span className="focus-summary-icon"><Activity size={22}/></span><div><strong>{todayTasks.length} tasks to focus on</strong><p>It's about making progress, not doing everything at once.</p></div>{overdue.length > 0 && <span className="overdue-counter">{overdue.length} overdue</span>}</div>
          <div className="today-layout"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">TO DO</span><h2>Ready when you are</h2></div></div>{todayTasks.length ? <div className="today-task-list">{[...todayTasks].sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1)).map(t => <div className="today-task-row" key={t.id}><button className="focus-check" aria-label={`Complete ${t.title}`} onClick={() => toggleTask(t.id)}><Circle size={22}/></button><button className="focus-content" onClick={() => showEditor(t)}><strong>{t.title}</strong><small>{t.category} · {LANE_LABEL[t.lane]} {t.dueDate ? `· Due ${formatDate(t.dueDate)}` : ''}</small></button>{t.priority === 'high' && <span className="priority-mark">High</span>}<button className="icon-button small" aria-label={`Edit ${t.title}`} onClick={() => showEditor(t)}><ChevronRight size={17}/></button></div>)}</div> : <EmptyState icon={CheckCircle2} title="Nothing waiting for you" caption="All caught up for today. Enjoy the breathing room."/>}</section><section className="panel today-accomplished"><div className="panel-heading"><div><span className="eyebrow">SMALL WINS</span><h2>Today's progress</h2></div></div><div className="done-circle"><CheckCircle2 size={32}/><strong>{doneToday}</strong><span>done today</span></div><p>It's the consistency that adds up.</p><button className="button button-secondary" onClick={() => navigate('completed')}>View completed tasks <ArrowRight size={16}/></button></section></div>
        </>}
        {view === 'upcoming' && <>
          <div className="page-title-row"><div><span className="eyebrow">LOOK AHEAD</span><h1>Upcoming <span className="heading-sparkle">✳</span></h1><p>Only tasks with dates appear here. No made-up deadlines.</p></div><button className="button button-primary" onClick={() => showEditor(null, 'urgent')}><Plus size={18}/> Add a due date</button></div>
          {active.filter(t => t.dueDate).length ? <div className="panel upcoming-panel">{[...active].filter(t => t.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(t => <div className="upcoming-row" key={t.id}><div className={`upcoming-date ${t.dueDate < day && !completed(t) ? 'is-overdue' : ''}`}><strong>{t.dueDate.slice(8,10)}</strong><span>{formatDate(t.dueDate).split(' ')[1]}</span></div><div className="upcoming-item"><button onClick={() => showEditor(t)}><strong>{t.title}</strong><small>{t.category} · {LANE_LABEL[t.lane]} · {completed(t) ? 'Complete this period' : t.dueDate < day ? 'Overdue' : t.dueDate === day ? 'Due today' : 'Upcoming'}</small></button></div><button className={`round-check ${completed(t) ? 'checked' : ''}`} aria-label={`Toggle ${t.title}`} onClick={() => toggleTask(t.id)}>{completed(t) ? <Check size={14}/> : null}</button></div>)}</div> : <EmptyState icon={CalendarDays} title="No deadlines set yet" caption="Add a due date to any task and it will show up here." action={<button className="button button-primary" onClick={() => showEditor(null, 'urgent')}>Create a dated task</button>}/>}
        </>}
        {view === 'goals' && <>
          <div className="page-title-row"><div><span className="eyebrow">THE BIG PICTURE</span><h1>Grow into your goals <span className="heading-sparkle">✨</span></h1><p>Progress isn't always urgent. Make space for what you're building.</p></div><button className="button button-primary" onClick={() => showEditor(null, 'goals')}><Plus size={18}/> New goal</button></div>
          <div className="goals-intro"><span>✦</span><div><strong>Keep the dream. Make the next step small.</strong><p>Open a goal to add milestone checklists, notes and an optional target date.</p></div></div><div className="goals-grid">{goals.map((goal, index) => { const done = goal.subtasks.filter(s => s.done).length; return <button key={goal.id} className={`goal-card goal-colour-${index % 5}`} onClick={() => showEditor(goal)}><div className="goal-upper"><span className="goal-symbol">{['✦', '◈', '✳', '♡', '✺'][index % 5]}</span><ArrowUpRight size={18}/></div><span className="goal-category">{goal.category}</span><h3>{goal.title}</h3><p>{goal.description || 'A goal worth making time for.'}</p><div className="goal-progress"><div className="mini-progress"><span style={{ width: `${goal.subtasks.length ? (done / goal.subtasks.length) * 100 : 0}%` }}/></div><span>{goal.subtasks.length ? `${done} of ${goal.subtasks.length} steps` : 'Add your first milestone'}</span></div></button>; })}{<button className="goal-card new-goal-card" onClick={() => showEditor(null, 'goals')}><span className="new-goal-plus"><Plus size={28}/></span><strong>Add a new goal</strong><p>Your next chapter starts here.</p></button>}</div>
        </>}
        {view === 'completed' && <>
          <div className="page-title-row"><div><span className="eyebrow">LOOK HOW FAR YOU'VE COME</span><h1>Completed tasks <span className="heading-sparkle">✓</span></h1><p>Your completion history, including individual recurring-task check-ins.</p></div></div>
          <div className="completed-banner"><CheckCircle2 size={25}/><div><strong>{board.completions.length} recorded completions</strong><p>Consistency counts, even when a task repeats.</p></div></div>
          {board.completions.length ? <div className="panel completion-list">{[...board.completions].sort((a,b) => b.completedAt.localeCompare(a.completedAt)).map(c => <div className="history-row" key={c.id}><span className="history-check"><Check size={17}/></span><div><strong>{c.title}</strong><small>{c.category} · {new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeZone: 'Australia/Brisbane' }).format(new Date(c.completedAt))}</small></div>{board.tasks.some(t => t.id === c.taskId) && <button className="text-link" onClick={() => { const task = board.tasks.find(t => t.id === c.taskId)!; if (isCompleted(task, board.completions, day) && (task.recurrence === 'none' || c.periodKey === (task.recurrence === 'daily' ? day : c.periodKey))) { if (task.recurrence === 'none' || board.completions.filter(v => v.taskId === task.id).sort((a,b)=>b.completedAt.localeCompare(a.completedAt))[0]?.id === c.id) toggleTask(task.id); else showEditor(task); } else showEditor(task); }}>Open <ChevronRight size={15}/></button>}</div>)}</div> : <EmptyState icon={CheckCircle2} title="Your wins will appear here" caption="Mark a task complete to start building your progress history." action={<button className="button button-primary" onClick={() => navigate('today')}>Go to today</button>}/>}
        </>}
        {view === 'settings' && <>
          <div className="page-title-row"><div><span className="eyebrow">MAKE IT YOURS</span><h1>Settings & backups <span className="heading-sparkle">⚙</span></h1><p>Your tasks stay in this browser unless you export a backup.</p></div></div>
          <div className="settings-grid"><section className="panel settings-panel"><div className="settings-icon blue"><Download size={22}/></div><h2>Back up your tasks</h2><p>Download every task, milestone, schedule and completion record as a JSON file. Keep it somewhere safe.</p><button className="button button-primary" onClick={exportData}><ArrowDownToLine size={17}/> Download backup</button></section>
          <section className="panel settings-panel"><div className="settings-icon green"><Upload size={22}/></div><h2>Restore a backup</h2><p>Import a previously exported file. This replaces your current task list after confirmation.</p><input ref={fileInputRef} hidden type="file" accept=".json,application/json" onChange={e => void importData(e.target.files?.[0])}/><button className="button button-secondary" onClick={() => fileInputRef.current?.click()}><Upload size={17}/> Import backup</button></section>
          <section className="panel settings-panel"><div className="settings-icon orange"><RotateCcw size={22}/></div><h2>Start fresh from your notebook</h2><p>Reset to the tasks from the handwritten page you shared. Export first if you want to preserve current work.</p><button className="button button-secondary" onClick={reset}><RotateCcw size={17}/> Reset notebook tasks</button></section>
          <section className="panel settings-panel"><div className="settings-icon purple"><Moon size={22}/></div><h2>Appearance</h2><p>Choose a comfortable colour theme for your workspace.</p><div className="segmented-theme"><button className={board.theme === 'light' ? 'active' : ''} onClick={() => setBoard(s => ({...s,theme:'light'}))}><Sun size={17}/> Light</button><button className={board.theme === 'dark' ? 'active' : ''} onClick={() => setBoard(s => ({...s,theme:'dark'}))}><Moon size={17}/> Dark</button></div></section></div>
          <section className="panel suggested-panel"><div className="panel-heading"><div><span className="eyebrow">OPTIONAL IDEAS</span><h2>Ideas from your work</h2><p>These are suggestions, not obligations — add only the ones you want.</p></div><WandSparkles size={24}/></div><div className="suggestions-grid">{SUGGESTIONS.map(s => <div className="suggestion-row" key={s.title}><span className="suggestion-icon"><Sparkles size={18}/></span><div><strong>{s.title}</strong><small>{s.category}</small></div><button aria-label={`Add ${s.title}`} className="button button-secondary button-small" onClick={() => { const t = createTask({...s, origin: 'idea'}); setBoard(old => ({...old, tasks:[...old.tasks,t]})); alertNotice('Idea added to your board'); }}><Plus size={15}/> Add</button></div>)}</div></section>
          <div className="privacy-note"><Bell size={19}/><p><strong>Privacy & syncing:</strong> This version saves locally on your device. It has no user accounts or cloud sync. Publishing the site will not sync tasks between devices automatically. Don't enter patient-identifiable or sensitive clinical information.</p></div>
          <button className="text-link settings-nav" onClick={() => navigate('board')}>Back to task board <ArrowRight size={16}/></button>
        </>}
        <footer className="site-footer"><span>Built for your real life <span>✳</span></span><span>Local-first · Australia/Brisbane · Version 1.0</span></footer>
      </main>
    </div>
    {editor && <TaskModal key={editor.task?.id ?? `new-${editor.lane}`} task={editor.task} defaultLane={editor.lane} onDismiss={() => setEditor(null)} onSave={saveTask}/>}
    {notice && <div className="toast" role="status"><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={15}/></button></div>}
  </div>;
}