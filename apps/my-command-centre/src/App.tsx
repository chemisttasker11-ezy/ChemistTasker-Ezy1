import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, CalendarDays, Check, CheckCircle2, ChevronRight, LayoutDashboard, ListTodo, Menu, Moon, Plus, Settings2, Sparkles, Sun, Target, X } from 'lucide-react';
import { type BoardState, type Category, type Lane, type Priority, type Task, type View, STORAGE_KEY, brisbaneToday, initialState, isCompleted, moveInBoard, readState, toggleCompletion, validateImported } from './model';
import { activeItem, downloadable, LANE_LABEL, longToday } from './lib/display';
import { TaskModal } from './components/TaskModal';
import { OverviewView } from './views/OverviewView';
import { BoardView } from './views/BoardView';
import { TodayView } from './views/TodayView';
import { UpcomingView } from './views/UpcomingView';
import { GoalsView } from './views/GoalsView';
import { CompletedView } from './views/CompletedView';
import { SettingsView } from './views/SettingsView';
import { ArchivedView } from './views/ArchivedView';

const ICONS = { overview: LayoutDashboard, board: ListTodo, today: Sun, upcoming: CalendarDays, goals: Target, completed: CheckCircle2, archived: Archive, settings: Settings2 };
const NAV: { id: View; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'board', label: 'My task board' },
  { id: 'today', label: 'Today' }, { id: 'upcoming', label: 'Upcoming' },
  { id: 'goals', label: 'Long-term goals' }, { id: 'completed', label: 'Completed' },
  { id: 'archived', label: 'Archived tasks' }
];

export default function App() {
  const [board, setBoard] = useState<BoardState>(readState);
  const [view, setView] = useState<View>('overview');
  const [selectedLane, setSelectedLane] = useState<Lane>('urgent');
  const [editor, setEditor] = useState<{ task: Task | null; lane: Lane } | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'All'>('All');
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
  const doneToday = board.completions.filter(c => brisbaneToday(new Date(c.completedAt)) === day).length;
  const goals = active.filter(t => t.lane === 'goals');

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
    setBoard(state => moveInBoard(state, id, lane, overId));
    alertNotice(`Moved to ${LANE_LABEL[lane]}`);
  }
  function archiveTask(id: string) {
    const task = board.tasks.find(t => t.id === id);
    if (!task || !window.confirm(`Archive “${task.title}”? You can restore it from Archived tasks.`)) return;
    setBoard(s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, archivedAt: new Date().toISOString() } : t) }));
    alertNotice('Task archived');
  }
  function restoreArchived(id: string) {
    setBoard(s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, archivedAt: '' } : t) }));
    alertNotice('Task restored');
  }
  function deleteArchived(id: string) {
    const task = board.tasks.find(t => t.id === id);
    if (!task?.archivedAt || !window.confirm(`Permanently delete “${task.title}” and its completion history? This cannot be undone.`)) return;
    setBoard(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== id), completions: s.completions.filter(c => c.taskId !== id) }));
    alertNotice('Archived task deleted');
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
        {view === 'overview' && <OverviewView active={active} todayTasks={todayTasks} doneToday={doneToday} goals={goals} navigate={navigate} showEditor={showEditor} toggleTask={toggleTask} setSelectedLane={setSelectedLane}/>}
        {view === 'board' && <BoardView visible={visible} search={search} setSearch={setSearch} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} selectedLane={selectedLane} setSelectedLane={setSelectedLane} day={day} completed={completed} showEditor={showEditor} toggleTask={toggleTask} moveTask={moveTask} archiveTask={archiveTask} toggleSubtask={toggleSubtask}/>}
        {view === 'today' && <TodayView todayTasks={todayTasks} doneToday={doneToday} navigate={navigate} showEditor={showEditor} toggleTask={toggleTask}/>}
        {view === 'upcoming' && <UpcomingView active={active} day={day} completed={completed} showEditor={showEditor} toggleTask={toggleTask}/>}
        {view === 'goals' && <GoalsView goals={goals} showEditor={showEditor}/>}
        {view === 'completed' && <CompletedView board={board} day={day} showEditor={showEditor} navigate={navigate} toggleTask={toggleTask}/>}
        {view === 'archived' && <ArchivedView tasks={board.tasks.filter(t => Boolean(t.archivedAt))} restore={restoreArchived} remove={deleteArchived}/> }
        {view === 'settings' && <SettingsView board={board} setBoard={setBoard} exportData={exportData} importData={importData} reset={reset} fileInputRef={fileInputRef} navigate={navigate} alertNotice={alertNotice}/>}
        <footer className="site-footer"><span>Built for your real life <span>✳</span></span><span>Local-first · Australia/Brisbane · Version 1.0</span></footer>
      </main>
    </div>
    {editor && <TaskModal key={editor.task?.id ?? `new-${editor.lane}`} task={editor.task} defaultLane={editor.lane} onDismiss={() => setEditor(null)} onSave={saveTask}/>}
    {notice && <div className="toast" role="status"><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={15}/></button></div>}
  </div>;
}
