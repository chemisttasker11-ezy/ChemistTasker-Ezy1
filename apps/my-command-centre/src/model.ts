export type Lane = 'urgent' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'goals';
export type Category = 'ChemistTasker' | 'Pharmacy' | 'Family' | 'Finance' | 'Personal';
export type Priority = 'high' | 'medium' | 'low';
export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type View = 'overview' | 'board' | 'today' | 'upcoming' | 'goals' | 'completed' | 'archived' | 'settings';

export interface Subtask { id: string; title: string; done: boolean }
export interface Task {
  id: string;
  title: string;
  description: string;
  lane: Lane;
  category: Category;
  priority: Priority;
  dueDate: string;
  recurrence: Recurrence;
  estimateMinutes: number;
  subtasks: Subtask[];
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  archivedAt: string;
  origin: 'notebook' | 'personal' | 'idea';
}
export interface Completion {
  id: string;
  taskId: string;
  title: string;
  category: Category;
  completedAt: string;
  periodKey: string;
  previousDueDate?: string;
}
export interface BoardState {
  version: 1;
  tasks: Task[];
  completions: Completion[];
  theme: 'light' | 'dark';
}

export const LANES: { id: Lane; title: string; description: string; emoji: string; tone: string }[] = [
  { id: 'urgent', title: 'Urgent', description: 'Needs my attention', emoji: '🔥', tone: 'coral' },
  { id: 'daily', title: 'Daily', description: 'The everyday rhythm', emoji: '☀️', tone: 'sky' },
  { id: 'weekly', title: 'Weekly', description: 'Keep the momentum', emoji: '🌿', tone: 'mint' },
  { id: 'monthly', title: 'Monthly', description: 'Stay on top of things', emoji: '🗓️', tone: 'lavender' },
  { id: 'quarterly', title: 'Quarterly / Annual', description: 'Bigger picture admin', emoji: '📊', tone: 'amber' },
  { id: 'goals', title: 'Long-term goals', description: 'Life beyond the checklist', emoji: '✨', tone: 'rose' }
];

export const CATEGORIES: { id: Category; emoji: string; tone: string }[] = [
  { id: 'ChemistTasker', emoji: '✦', tone: 'indigo' },
  { id: 'Pharmacy', emoji: '✚', tone: 'violet' },
  { id: 'Family', emoji: '♥', tone: 'pink' },
  { id: 'Finance', emoji: '$', tone: 'orange' },
  { id: 'Personal', emoji: '◉', tone: 'teal' }
];

const DEFAULT_RECURRENCE: Record<Lane, Recurrence> = {
  urgent: 'none', daily: 'daily', weekly: 'weekly', monthly: 'monthly', quarterly: 'quarterly', goals: 'none'
};

export function generateId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function brisbaneToday(now = new Date()): string {
  const p = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Brisbane', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => p.find(i => i.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function periodKey(recurrence: Recurrence, dateISO: string): string {
  if (recurrence === 'none') return 'once';
  if (recurrence === 'daily') return dateISO;
  const [y, m, d] = dateISO.split('-').map(Number);
  if (recurrence === 'monthly') return `${y}-${String(m).padStart(2, '0')}`;
  if (recurrence === 'quarterly') return `${y}-Q${Math.ceil(m / 3)}`;
  if (recurrence === 'yearly') return `${y}`;
  const day = new Date(Date.UTC(y, m - 1, d));
  const dow = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - dow);
  return day.toISOString().slice(0, 10);
}

export function isCompleted(task: Task, completions: Completion[], today: string): boolean {
  if (task.recurrence === 'none') return Boolean(task.completedAt);
  return completions.some(c => c.taskId === task.id && c.periodKey === periodKey(task.recurrence, today));
}

export function nextDueDate(date: string, recurrence: Recurrence, today: string): string {
  if (!date || recurrence === 'none') return date;
  const [year, month, day] = date.split('-').map(Number);
  if (![year, month, day].every(Number.isInteger)) return date;
  const anchor = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(anchor.getTime())) return date;
  let cursor = anchor;
  const target = today;
  // Preserve calendar anchor on monthly schedules (31st becomes month-end when shorter).
  for (let n = 1; n < 5000 && cursor.toISOString().slice(0, 10) <= target; n++) {
    let yearNext = year;
    let monthNext = month - 1;
    if (recurrence === 'daily') {
      cursor = new Date(anchor.getTime() + n * 86400000);
      continue;
    }
    if (recurrence === 'weekly') {
      cursor = new Date(anchor.getTime() + n * 7 * 86400000);
      continue;
    }
    if (recurrence === 'monthly') monthNext += n;
    if (recurrence === 'quarterly') monthNext += n * 3;
    if (recurrence === 'yearly') yearNext += n;
    const first = new Date(Date.UTC(yearNext, monthNext, 1));
    const finalDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, finalDay)));
  }
  return cursor.toISOString().slice(0, 10);
}

export function toggleCompletion(state: BoardState, id: string, now = new Date()): BoardState {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return state;
  const today = brisbaneToday(now);
  const key = periodKey(task.recurrence, today);
  const matching = state.completions.find(c => c.taskId === id && c.periodKey === key);
  if (matching) {
    return {
      ...state,
      completions: state.completions.filter(c => c.id !== matching.id),
      tasks: state.tasks.map(t => t.id === id ? { ...t, completedAt: '', dueDate: matching.previousDueDate ?? t.dueDate, updatedAt: now.toISOString() } : t)
    };
  }
  const completion: Completion = { id: generateId(), taskId: id, title: task.title, category: task.category, completedAt: now.toISOString(), periodKey: key, previousDueDate: task.dueDate };
  const updated = state.tasks.map(t => t.id === id ? {
    ...t,
    completedAt: t.recurrence === 'none' ? now.toISOString() : '',
    dueDate: t.dueDate && t.recurrence !== 'none' ? nextDueDate(t.dueDate, t.recurrence, today) : t.dueDate,
    updatedAt: now.toISOString()
  } : t);
  return { ...state, tasks: updated, completions: [completion, ...state.completions] };
}

/** Pure Kanban reducer: destination position is independent of browser drag events. */
export function moveInBoard(state: BoardState, id: string, destination: Lane, overId?: string): BoardState {
  const task = state.tasks.find(t => t.id === id);
  if (!task || task.archivedAt || (id === overId && destination === task.lane)) return state;
  const tasks = state.tasks.filter(t => t.id !== id);
  let index = overId ? tasks.findIndex(t => t.id === overId && t.lane === destination) : -1;
  if (index < 0) {
    const last = tasks.findLastIndex(t => t.lane === destination && !t.archivedAt);
    index = last >= 0 ? last + 1 : tasks.length;
  }
  tasks.splice(index, 0, { ...task, lane: destination, updatedAt: new Date().toISOString() });
  return { ...state, tasks };
}

const seed: { lane: Lane; category: Category; title: string; recurrence?: Recurrence; priority?: Priority; description?: string }[] = [
  { lane: 'urgent', category: 'Finance', title: 'Tax', priority: 'high', description: 'Review outstanding tax paperwork and identify the next step.' },
  { lane: 'urgent', category: 'Personal', title: 'Take / book appointments', priority: 'high' },
  { lane: 'urgent', category: 'Pharmacy', title: 'Clear reports backlog', priority: 'high', description: 'Review outstanding HMR and RMMR reports.' },
  { lane: 'urgent', category: 'ChemistTasker', title: 'Claude setup', priority: 'medium', description: 'Finish the development assistant setup.' },
  { lane: 'daily', category: 'Pharmacy', title: 'Complete any reports' },
  { lane: 'daily', category: 'Family', title: 'Family time', priority: 'high' },
  { lane: 'daily', category: 'Pharmacy', title: 'Pharmacy shifts or visits' },
  { lane: 'daily', category: 'Personal', title: 'Check emails and reply' },
  { lane: 'daily', category: 'Personal', title: 'Review my tasks' },
  { lane: 'daily', category: 'Pharmacy', title: 'Training / CPD' },
  { lane: 'daily', category: 'ChemistTasker', title: 'ChemistTasker progress', priority: 'high' },
  { lane: 'weekly', category: 'Finance', title: 'Invoices for shifts' },
  { lane: 'weekly', category: 'Pharmacy', title: 'Make sure reports are sent' },
  { lane: 'weekly', category: 'Pharmacy', title: 'Check new referrals' },
  { lane: 'weekly', category: 'Family', title: 'One day outing with family', priority: 'high' },
  { lane: 'weekly', category: 'Family', title: 'Build a habit with family' },
  { lane: 'monthly', category: 'Finance', title: 'Invoices' },
  { lane: 'monthly', category: 'Finance', title: 'Claims' },
  { lane: 'monthly', category: 'Finance', title: 'Review and pay bills' },
  { lane: 'quarterly', category: 'Finance', title: 'BAS', recurrence: 'quarterly', description: 'Quarterly business activity statement.' },
  { lane: 'quarterly', category: 'Finance', title: 'Annual tax return', recurrence: 'yearly' },
  { lane: 'goals', category: 'Personal', title: 'Baladi', recurrence: 'none' },
  { lane: 'goals', category: 'Personal', title: 'Sport', recurrence: 'none' },
  { lane: 'goals', category: 'ChemistTasker', title: 'Grow ChemistTasker', recurrence: 'none' },
  { lane: 'goals', category: 'Family', title: 'Family habits', recurrence: 'none' },
  { lane: 'goals', category: 'Personal', title: 'Lose weight', recurrence: 'none' }
];

export const SUGGESTIONS = [
  { title: 'Review open PRs and staging readiness', category: 'ChemistTasker' as Category, lane: 'weekly' as Lane, description: 'Optional idea based on current SaaS work.' },
  { title: 'Plan ChemistTasker brand identity variants', category: 'ChemistTasker' as Category, lane: 'weekly' as Lane, description: 'Logo for mobile, compact mark, icon and wordmark.' },
  { title: 'Reconcile HMR / RMMR referral pipeline', category: 'Pharmacy' as Category, lane: 'weekly' as Lane, description: 'Review referrals, completed reports and follow-up status.' },
  { title: 'Plan next CPD topic', category: 'Pharmacy' as Category, lane: 'monthly' as Lane, description: 'Optional professional development planning.' }
];

export function createTask(values: Partial<Task> & Pick<Task, 'title'>): Task {
  const now = new Date().toISOString();
  const lane = values.lane ?? 'urgent';
  return {
    id: values.id ?? generateId(),
    title: values.title.trim(),
    description: values.description ?? '',
    lane,
    category: values.category ?? 'Personal',
    priority: values.priority ?? 'medium',
    dueDate: values.dueDate ?? '',
    recurrence: values.recurrence ?? DEFAULT_RECURRENCE[lane],
    estimateMinutes: values.estimateMinutes ?? 0,
    subtasks: values.subtasks ?? [],
    createdAt: values.createdAt ?? now,
    updatedAt: now,
    completedAt: values.completedAt ?? '',
    archivedAt: values.archivedAt ?? '',
    origin: values.origin ?? 'personal'
  };
}

export function initialState(): BoardState {
  return { version: 1, theme: 'light', completions: [], tasks: seed.map((t, i) => createTask({ ...t, id: `notebook-${i + 1}`, origin: 'notebook' })) };
}

export const STORAGE_KEY = 'my-command-centre:v1';
export function readState(): BoardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    return validateImported(JSON.parse(raw));
  } catch {
    return initialState();
  }
}

function validISODate(value: unknown): boolean {
  return typeof value === 'string' && (value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value));
}
export function validateImported(raw: unknown): BoardState {
  if (!raw || typeof raw !== 'object') throw new Error('This is not a task backup.');
  const obj = raw as Partial<BoardState>;
  if (obj.version !== 1 || !Array.isArray(obj.tasks) || !Array.isArray(obj.completions) || obj.tasks.length > 10000 || obj.completions.length > 50000) {
    throw new Error('Unsupported or invalid task backup.');
  }
  const lanes = new Set(LANES.map(l => l.id));
  const categories = new Set(CATEGORIES.map(c => c.id));
  const recurrence = new Set<Recurrence>(['none', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly']);
  const priority = new Set<Priority>(['high', 'medium', 'low']);
  const ids = new Set<string>();
  const tasks: Task[] = obj.tasks.map((t: Task) => {
    if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !t.id || t.id.length > 100 || ids.has(t.id) ||
      typeof t.title !== 'string' || !t.title.trim() || t.title.length > 250 ||
      typeof t.description !== 'string' || t.description.length > 10000 ||
      !lanes.has(t.lane) || !categories.has(t.category) || !recurrence.has(t.recurrence) || !priority.has(t.priority) ||
      !validISODate(t.dueDate) || !Array.isArray(t.subtasks) || t.subtasks.length > 100 ||
      !Number.isInteger(t.estimateMinutes) || t.estimateMinutes < 0 || t.estimateMinutes > 100000) {
      throw new Error('Backup contains invalid tasks.');
    }
    ids.add(t.id);
    const subtasks = t.subtasks.map(s => {
      if (!s || typeof s.id !== 'string' || typeof s.title !== 'string' || s.title.length > 250 || typeof s.done !== 'boolean') {
        throw new Error('Backup contains invalid checklist items.');
      }
      return { id: s.id.slice(0, 100), title: s.title, done: s.done };
    });
    return {
      ...t, subtasks,
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : '',
      updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : '',
      completedAt: typeof t.completedAt === 'string' ? t.completedAt : '',
      archivedAt: typeof t.archivedAt === 'string' ? t.archivedAt : '',
      origin: ['notebook', 'personal', 'idea'].includes(t.origin) ? t.origin : 'personal'
    };
  });
  const completions = obj.completions.map((c: Completion) => {
    if (!c || typeof c.id !== 'string' || typeof c.taskId !== 'string' || typeof c.title !== 'string' || typeof c.completedAt !== 'string' || typeof c.periodKey !== 'string' || !categories.has(c.category)) {
      throw new Error('Backup contains invalid completion history.');
    }
    return { id: c.id.slice(0, 100), taskId: c.taskId.slice(0, 100), title: c.title.slice(0, 250), category: c.category, completedAt: c.completedAt, periodKey: c.periodKey.slice(0, 40), previousDueDate: validISODate(c.previousDueDate) ? c.previousDueDate : undefined };
  });
  return { version: 1, tasks, completions, theme: obj.theme === 'dark' ? 'dark' : 'light' };
}
