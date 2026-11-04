import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, CalendarDays, CalendarRange, BarChart3, Check, CheckCircle2, ChevronRight, LayoutDashboard, ListTodo, Menu, Moon, Plus, Settings2, Sparkles, Sun, Target, X } from 'lucide-react';
import { type BoardState, type Category, type Lane, type Priority, type Task, type TaskStatus, type View, STORAGE_KEY, brisbaneToday, duplicateTask as cloneTask, initialState, isCompleted, moveInBoard, readState, rescheduleTask, saveTaskChanges, saveWeekReview, setTaskStatus, setWeekCommitment, toggleCompletion, toggleDailyFocus, validateImported } from './model';
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
import { CalendarView } from './views/CalendarView';
import { visibleStatus } from './lib/progress';
import { mondayOf } from './lib/calendar';
import { scoreWeek } from './lib/scoring';
import { WeekPlannerView } from './views/WeekPlannerView';

const ICONS = { overview: LayoutDashboard, board: ListTodo, today: Sun, week: BarChart3, calendar: CalendarRange, upcoming: CalendarDays, goals: Target, completed: CheckCircle2, archived: Archive, settings: Settings2 };
const NAV: { id: View; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'board', label: 'My task board' },
  { id: 'today', label: 'Today' }, { id: 'week', label: 'Week planner' }, { id: 'calendar', label: 'Calendar' }, { id: 'upcoming', label: 'Upcoming' },
  { id: 'goals', label: 'Long-term goals' }, { id: 'completed', label: 'Completed' },
  { id: 'archived', label: 'Archived tasks' }
];

export default function App() {
  const [board, setBoard] = useState<BoardState>(readState);
  const [view, setView] = useState<View>('overview');
  const [selectedLane, setSelectedLane] = useState<Lane>('urgent');
  const [editor, setEditor] = useState<{ task: Task | null; lane: Lane; date?: string; isCopy?: boolean } | null>(null);
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
  const todayTasks = outstanding.filter(t => t.status !== 'postponed' && (t.lane === 'daily' || t.lane === 'urgent' || (t.dueDate && t.dueDate <= day)));
  const doneToday = board.completions.filter(c => brisbaneToday(new Date(c.completedAt)) === day).length;
  const goals = active.filter(t => t.lane === 'goals');
  const currentWeekStart = mondayOf(day);
  const currentWeekScore = useMemo(() => scoreWeek(board.weekPlans?.[currentWeekStart], board, currentWeekStart, day), [board, currentWeekStart, day]);

  useEffect(() => {
    document.documentElement.dataset.theme = board.theme;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(board)); setSaveError(false); }
    catch { setSaveError(true); }
  }, [board]);

  function alertNotice(message: string) { setNotice(message); }
  function navigate(next: View) { setView(next); setMobileNav(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function showEditor(task: Task | null, lane: Lane = 'urgent', date = '') { setEditor({ task, lane, date }); }
  function duplicateTask(task: Task) { setEditor({ task: cloneTask(task), lane: task.lane, isCopy: true }); }
  function saveTask(task: Task) {
    setBoard(s => saveTaskChanges(s, task));
    setEditor(null); alertNotice('Task saved');
  }
  function changeStatus(id: string, status: TaskStatus, postponedTo?: string) {
    setBoard(s => setTaskStatus(s, id, status, postponedTo));
    alertNotice(status === 'postponed' ? 'Task postponed to its new date' : `Status updated`);
  }
  function includeInWeek(weekStart: string, id: string, include: boolean) {
    const task = board.tasks.find(item => item.id === id);
    if (!task) return;
    setBoard(state => setWeekCommitment(state, weekStart, task, include));
    alertNotice(include ? 'Added to weekly commitments' : 'Removed from weekly commitments');
  }
  function chooseDailyFocus(date: string, id: string) {
    const selected = board.dailyFocus?.[date] ?? [];
    if (!selected.includes(id) && selected.length >= 3) {
      alertNotice('Choose no more than three priorities per day');
      return;
    }
    setBoard(state => toggleDailyFocus(state, date, id));
    alertNotice(selected.includes(id) ? 'Removed from daily priorities' : 'Added to daily priorities');
  }
  function saveReview(weekStart: string, notes: { wins: string; blockers: string; adjustment: string }) {
    setBoard(state => {
      const percent = scoreWeek(state.weekPlans?.[weekStart], state, weekStart, brisbaneToday()).percent;
      return saveWeekReview(state, weekStart, notes, percent);
    });
    alertNotice('Weekly review saved');
  }
  function rescheduleCalendarTask(id: string, date: string) {
    setBoard(s => rescheduleTask(s, id, date));
    alertNotice(date ? 'Calendar date updated' : 'Removed from calendar; still on task board');
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
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Check size={21} strokeWidth={3}/></div><div className="brand-name">my<span>command</span><strong>centre</strong></div><button className="icon-button mobile-close" type="button" aria-label="Close menu" onClick={() => setMobileNav(false)}><X size={20}/></button></div>
      <div className="workspace-label">YOUR WORKSPACE <span className="workspace-dot" /></div>
      <nav id="main-navigation" className="side-nav" aria-label="Main navigation">
        <p className="nav-section">WORKSPACE</p>
        {NAV.map(n => {
          const Icon = ICONS[n.id];
          const count = n.id === 'today' ? todayTasks.length : n.id === 'goals' ? goals.length : undefined;
          return <button key={n.id} className={`nav-link ${view === n.id ? 'selected' : ''}`} aria-current={view === n.id ? 'page' : undefined} onClick={() => navigate(n.id)}><Icon size={19} strokeWidth={1.9}/><span>{n.label}</span>{typeof count === 'number' && <span className="nav-count">{count}</span>}</button>;
        })}
        <p className="nav-section">PREFERENCES</p>
        <button className={`nav-link ${view === 'settings' ? 'selected' : ''}`} onClick={() => navigate('settings')}><Settings2 size={19}/><span>Settings & backup</span></button>
      </nav>
      <div className="sidebar-bottom"><div className="side-note-icon"><Sparkles size={18}/></div><p><strong>Little steps. Big progress.</strong><br/>Stay focused on what matters, one task at a time.</p><div className="sidebar-avatar"><div className="avatar">MC</div><div><strong>My workspace</strong><span>Private to this browser</span></div><span className="online-dot"/></div></div>
    </aside>
    {mobileNav && <button className="mobile-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <div className="main-shell">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open menu" aria-controls="main-navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(true)}><Menu size={23}/></button><div className="breadcrumb">Workspace <ChevronRight size={14}/> <strong>{view === 'board' ? 'Task board' : view === 'settings' ? 'Settings' : selectedNav?.label}</strong></div></div><div className="topbar-right"><span className="date-chip"><CalendarDays size={16}/>{longToday(day)}</span><button className="icon-button theme-toggle" aria-label="Toggle light or dark theme" onClick={() => setBoard(s => ({ ...s, theme: s.theme === 'light' ? 'dark' : 'light' }))}>{board.theme === 'light' ? <Moon size={19}/> : <Sun size={19}/>}</button><button className="top-add" onClick={() => showEditor(null, 'urgent')}><Plus size={18}/> <span>New task</span></button></div></header>
      <main className="content" id="main-content" tabIndex={-1}>
        {saveError && <div className="save-warning" role="alert">Browser storage is unavailable or full. Export your work before leaving this page.</div>}
        {view === 'overview' && <OverviewView active={active} todayTasks={todayTasks} doneToday={doneToday} goals={goals} navigate={navigate} showEditor={showEditor} toggleTask={toggleTask} setSelectedLane={setSelectedLane} weekScore={currentWeekScore}/>}
        {view === 'board' && <BoardView visible={visible} search={search} setSearch={setSearch} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} selectedLane={selectedLane} setSelectedLane={setSelectedLane} day={day} completed={completed} showEditor={showEditor} toggleTask={toggleTask} moveTask={moveTask} archiveTask={archiveTask} duplicateTask={duplicateTask} changeStatus={changeStatus} toggleSubtask={toggleSubtask}/>}
        {view === 'today' && <TodayView day={day} todayTasks={todayTasks} doneToday={doneToday} navigate={navigate} showEditor={showEditor} toggleTask={toggleTask} allTasks={board.tasks} completed={completed} focusIds={board.dailyFocus?.[day] ?? []} onFocus={chooseDailyFocus}/>}
        {view === 'week' && <WeekPlannerView board={board} today={day} navigate={navigate} onEdit={showEditor} onInclude={includeInWeek} onFocus={chooseDailyFocus} onReview={saveReview}/>}
        {view === 'calendar' && <CalendarView tasks={board.tasks} completions={board.completions} today={day} onEdit={showEditor} onDuplicate={duplicateTask} onStatus={changeStatus} onReschedule={rescheduleCalendarTask}/>}
        {view === 'upcoming' && <UpcomingView active={active} day={day} completed={completed} showEditor={showEditor} toggleTask={toggleTask}/>}
        {view === 'goals' && <GoalsView goals={goals} showEditor={showEditor}/>}
        {view === 'completed' && <CompletedView board={board} day={day} showEditor={showEditor} navigate={navigate} toggleTask={toggleTask}/>}
        {view === 'archived' && <ArchivedView tasks={board.tasks.filter(t => Boolean(t.archivedAt))} restore={restoreArchived} remove={deleteArchived}/> }
        {view === 'settings' && <SettingsView board={board} setBoard={setBoard} exportData={exportData} importData={importData} reset={reset} fileInputRef={fileInputRef} navigate={navigate} alertNotice={alertNotice}/>}
        <footer className="site-footer"><span>Built for your real life <span>✳</span></span><span>Local-first · Australia/Brisbane · Version 1.0</span></footer>
      </main>
    </div>
    {editor && <TaskModal key={`${editor.task?.id ?? `new-${editor.lane}`}-${editor.date ?? ''}`} task={editor.task} defaultLane={editor.lane} defaultDate={editor.date ?? ''} effectiveStatus={editor.task ? visibleStatus(editor.task, isCompleted(editor.task, board.completions, day)) : undefined} isCopy={editor.isCopy} onDismiss={() => setEditor(null)} onSave={saveTask}/>}
    {notice && <div className="toast" role="status"><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={15}/></button></div>}
  </div>;
}
