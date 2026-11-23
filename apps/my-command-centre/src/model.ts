export type Lane = 'urgent' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'goals';
export type Category = 'ChemistTasker' | 'Pharmacy' | 'Family' | 'Finance' | 'Personal';
export type Priority = 'high' | 'medium' | 'low';
export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type TaskStatus = 'not-started' | 'started' | 'progressing' | 'finished' | 'postponed';
export type View = 'overview' | 'board' | 'today' | 'week' | 'calendar' | 'upcoming' | 'goals' | 'completed' | 'archived' | 'settings';

export interface Subtask { id: string; title: string; done: boolean }
export interface Task {
  id: string;
  title: string;
  description: string;
  lane: Lane;
  category: Category;
  priority: Priority;
  dueDate: string;
  scheduledTime: string; // Optional HH:mm in Australia/Brisbane local time
  scheduleAnchor: string; // Original recurrence date; avoids month-end drift
  recurrence: Recurrence;
  estimateMinutes: number;
  subtasks: Subtask[];
  status: TaskStatus; // Simple state, independent of an optional checklist.
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
  nextDueDate?: string;
  previousStatus?: TaskStatus;
  previousSubtasks?: Subtask[];
}
/** A commitment is a snapshot: moving or postponing a task never silently removes it from the score. */
export interface WeeklyCommitment {
  taskId: string;
  title: string;
  priority: Priority;
  plannedDate: string;
}
export interface WeekReview {
  wins: string;
  blockers: string;
  adjustment: string;
  savedAt: string;
  scoreSnapshot: number | null;
}
export interface WeeklyPlan {
  weekStart: string;
  commitments: WeeklyCommitment[];
  review: WeekReview | null;
}
export interface BoardState {
  version: 1;
  tasks: Task[];
  completions: Completion[];
  theme: 'light' | 'dark';
  weekPlans: Record<string, WeeklyPlan>;
  dailyFocus: Record<string, string[]>;
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

/** Completing a repeating task closes the current period and starts fresh next period.
 * A completion snapshot lets Undo restore status, checklist and due date.
 */
export function toggleCompletion(state: BoardState, id: string, now = new Date()): BoardState {
  const task = state.tasks.find(t => t.id === id);
  if (!task || task.archivedAt) return state;
  const today = brisbaneToday(now);
  const key = periodKey(task.recurrence, today);
  const matching = state.completions.find(c => c.taskId === id && c.periodKey === key);
  if (matching) {
    return {
      ...state,
      completions: state.completions.filter(c => c.id !== matching.id),
      tasks: state.tasks.map(t => {
        if (t.id !== id) return t;
        // Do not move a date backwards if the series was rescheduled after completion.
        const canRestore = matching.nextDueDate !== undefined && t.dueDate === matching.nextDueDate;
        return {
          ...t,
          completedAt: t.recurrence === 'none' ? '' : t.completedAt,
          dueDate: canRestore ? matching.previousDueDate ?? t.dueDate : t.dueDate,
          status: matching.previousStatus ?? 'not-started',
          subtasks: canRestore && matching.previousSubtasks ? matching.previousSubtasks : t.subtasks,
          updatedAt: now.toISOString()
        };
      })
    };
  }
  const repeating = task.recurrence !== 'none';
  const next = repeating && task.dueDate
    ? nextDueDate(task.scheduleAnchor || task.dueDate, task.recurrence, today >= task.dueDate ? today : task.dueDate)
    : task.dueDate;
  const completion: Completion = {
    id: generateId(), taskId: id, title: task.title, category: task.category,
    completedAt: now.toISOString(), periodKey: key,
    previousDueDate: task.dueDate, nextDueDate: next,
    previousStatus: task.status, previousSubtasks: task.subtasks.map(s => ({ ...s }))
  };
  const tasks = state.tasks.map(t => t.id !== id ? t : {
    ...t,
    completedAt: repeating ? '' : now.toISOString(),
    dueDate: next,
    status: repeating ? 'not-started' as TaskStatus : 'finished' as TaskStatus,
    subtasks: repeating ? t.subtasks.map(sub => ({ ...sub, done: false })) : t.subtasks,
    updatedAt: now.toISOString()
  });
  return { ...state, tasks, completions: [completion, ...state.completions] };
}

/** Changes a calendar schedule, not its task-board lane or existing completion log.
 * A recurring task is rescheduled as a whole series (not just one occurrence).
 */
export function rescheduleTask(state: BoardState, id: string, date: string, time?: string): BoardState {
  if (!validISODate(date) || (time !== undefined && !validTime(time))) return state;
  if (!state.tasks.some(t => t.id === id && !t.archivedAt)) return state;
  return {
    ...state,
    tasks: state.tasks.map(t => t.id !== id ? t : {
      ...t, dueDate: date, scheduleAnchor: date, scheduledTime: date ? (time ?? t.scheduledTime) : '',
      status: !date && t.status === 'postponed' ? 'not-started' : t.status, updatedAt: new Date().toISOString()
    })
  };
}

/** Clones task content without cloning identity, progress, or completion status/history. */
export function duplicateTask(task: Task): Task {
  return createTask({
    ...task, id: generateId(), title: `${task.title} (copy)`, origin: 'personal',
    createdAt: undefined, completedAt: '', archivedAt: '', status: 'not-started',
    subtasks: task.subtasks.map(s => ({ id: generateId(), title: s.title, done: false })),
    scheduleAnchor: task.dueDate
  });
}

/** Changing progress is deliberately independent from optional checklist ticks. */
export function setTaskStatus(state: BoardState, id: string, status: TaskStatus, postponedTo?: string, now = new Date()): BoardState {
  const task = state.tasks.find(t => t.id === id);
  if (!task || task.archivedAt) return state;
  if (status === 'postponed') {
    const earliest = task.dueDate > brisbaneToday(now) ? task.dueDate : brisbaneToday(now);
    if (!postponedTo || !validISODate(postponedTo) || postponedTo <= earliest) return state;
  }
  const day = brisbaneToday(now);
  const done = isCompleted(task, state.completions, day);
  if (status === 'finished') return done ? state : toggleCompletion(state, id, now);
  const reopened = done ? toggleCompletion(state, id, now) : state;
  return {
    ...reopened,
    tasks: reopened.tasks.map(t => t.id === id ? {
      ...t, status,
      dueDate: status === 'postponed' ? postponedTo! : t.dueDate,
      scheduleAnchor: status === 'postponed' ? postponedTo! : t.scheduleAnchor,
      updatedAt: now.toISOString()
    } : t)
  };
}

/** Save modal changes, without creating fake completions or losing existing history. */
export function saveTaskChanges(state: BoardState, draft: Task, now = new Date()): BoardState {
  const prior = state.tasks.find(t => t.id === draft.id);
  const status = draft.status;
  let base = state;
  if (prior && isCompleted(prior, base.completions, brisbaneToday(now)) && status !== 'finished') {
    base = toggleCompletion(base, draft.id, now);
  }
  // Finished is a recorded occurrence. Leave the persisted pending status until
  // completion is recorded, so recurring tasks do not remain finished next time.
  const updated: Task = { ...draft, status: status === 'finished' ? (prior?.status ?? 'not-started') : status,
    updatedAt: now.toISOString() };
  base = { ...base, tasks: prior
    ? base.tasks.map(t => t.id === draft.id ? updated : t)
    : [...base.tasks, updated] };
  if (status === 'finished' && !isCompleted(updated, base.completions, brisbaneToday(now))) {
    return toggleCompletion(base, draft.id, now);
  }
  return base;
}

/** Pure Kanban reducer: destination position is independent of browser drag events. */
export function moveInBoard(state: BoardState, id: string, destination: Lane, overId?: string): BoardState {
  const task = state.tasks.find(t => t.id === id);
  if (!task || task.archivedAt || (id === overId && destination === task.lane)) return state;
  const tasks = state.tasks.filter(t => t.id !== id);
  let index = overId ? tasks.findIndex(t => t.id === overId && t.lane === destination) : -1;
  if (index < 0) {
    let last = -1;
    tasks.forEach((entry, position) => {
      if (entry.lane === destination && !entry.archivedAt) last = position;
    });
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
    scheduledTime: values.scheduledTime ?? '',
    scheduleAnchor: values.scheduleAnchor ?? values.dueDate ?? '',
    recurrence: values.recurrence ?? DEFAULT_RECURRENCE[lane],
    estimateMinutes: values.estimateMinutes ?? 0,
    subtasks: values.subtasks ?? [],
    status: values.status ?? 'not-started',
    createdAt: values.createdAt ?? now,
    updatedAt: now,
    completedAt: values.completedAt ?? '',
    archivedAt: values.archivedAt ?? '',
    origin: values.origin ?? 'personal'
  };
}

export function initialState(): BoardState {
  return { version: 1, theme: 'light', completions: [], weekPlans: {}, dailyFocus: {}, tasks: seed.map((t, i) => createTask({ ...t, id: `notebook-${i + 1}`, origin: 'notebook' })) };
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

function validISODate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function validTime(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
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
  const statuses = new Set<TaskStatus>(['not-started', 'started', 'progressing', 'finished', 'postponed']);
  const ids = new Set<string>();
  const tasks: Task[] = obj.tasks.map((t: Task) => {
    if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !t.id || t.id.length > 100 || ids.has(t.id) ||
      typeof t.title !== 'string' || !t.title.trim() || t.title.length > 250 ||
      typeof t.description !== 'string' || t.description.length > 10000 ||
      !lanes.has(t.lane) || !categories.has(t.category) || !recurrence.has(t.recurrence) || !priority.has(t.priority) ||
      !validISODate(t.dueDate) || (t.scheduleAnchor !== undefined && !validISODate(t.scheduleAnchor)) ||
      (t.scheduledTime !== undefined && !validTime(t.scheduledTime)) ||
      (t.status !== undefined && !statuses.has(t.status)) ||
      !Array.isArray(t.subtasks) || t.subtasks.length > 100 ||
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
      scheduledTime: t.scheduledTime || '',
      scheduleAnchor: t.scheduleAnchor || t.dueDate,
      status: t.completedAt ? 'finished' : t.status ?? 'not-started',
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
    return { id: c.id.slice(0, 100), taskId: c.taskId.slice(0, 100), title: c.title.slice(0, 250), category: c.category, completedAt: c.completedAt, periodKey: c.periodKey.slice(0, 40), previousDueDate: validISODate(c.previousDueDate) ? c.previousDueDate : undefined,
      nextDueDate: validISODate(c.nextDueDate) ? c.nextDueDate : undefined,
      previousStatus: c.previousStatus && statuses.has(c.previousStatus) ? c.previousStatus : undefined,
      previousSubtasks: Array.isArray(c.previousSubtasks) && c.previousSubtasks.length <= 100 ? c.previousSubtasks.filter(s => s && typeof s.id === 'string' && typeof s.title === 'string' && s.title.length <= 250 && typeof s.done === 'boolean').map(s => ({ id: s.id.slice(0, 100), title: s.title, done: s.done })) : undefined }; 
  });
  // Backward-compatible with backups created before weekly planning was introduced.
  // Reject malformed optional records rather than persisting arbitrary imported shapes.
  const weekPlans: Record<string, WeeklyPlan> = Object.create(null) as Record<string, WeeklyPlan>;
  if (obj.weekPlans !== undefined) {
    if (!obj.weekPlans || typeof obj.weekPlans !== 'object' || Array.isArray(obj.weekPlans) || Object.keys(obj.weekPlans).length > 260) throw new Error('Invalid weekly plans in backup.');
    for (const [key, rawPlan] of Object.entries(obj.weekPlans)) {
      const plan = rawPlan as WeeklyPlan;
      if (!validISODate(key) || !key || new Date(`${key}T12:00:00Z`).getUTCDay() !== 1 ||
        !plan || typeof plan !== 'object' || plan.weekStart !== key ||
        !Array.isArray(plan.commitments) || plan.commitments.length > 150) throw new Error('Invalid weekly plan.');
      const seen = new Set<string>();
      const commitments = plan.commitments.map(item => {
        if (!item || typeof item.taskId !== 'string' || !item.taskId || item.taskId.length > 100 || seen.has(item.taskId) ||
          typeof item.title !== 'string' || item.title.length > 250 ||
          !priority.has(item.priority) || !validISODate(item.plannedDate)) throw new Error('Invalid weekly commitment.');
        seen.add(item.taskId);
        return { taskId: item.taskId, title: item.title, priority: item.priority, plannedDate: item.plannedDate };
      });
      let review: WeekReview | null = null;
      if (plan.review !== null && plan.review !== undefined) {
        const r = plan.review;
        if (typeof r !== 'object' || typeof r.wins !== 'string' || typeof r.blockers !== 'string' ||
          typeof r.adjustment !== 'string' || [r.wins, r.blockers, r.adjustment].some(s => s.length > 1400) ||
          typeof r.savedAt !== 'string' || (r.scoreSnapshot !== null && (!Number.isInteger(r.scoreSnapshot) || r.scoreSnapshot < 0 || r.scoreSnapshot > 100))) throw new Error('Invalid weekly review.');
        review = { wins: r.wins, blockers: r.blockers, adjustment: r.adjustment, savedAt: r.savedAt, scoreSnapshot: r.scoreSnapshot };
      }
      weekPlans[key] = { weekStart: key, commitments, review };
    }
  }
  const dailyFocus: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  if (obj.dailyFocus !== undefined) {
    if (!obj.dailyFocus || typeof obj.dailyFocus !== 'object' || Array.isArray(obj.dailyFocus) || Object.keys(obj.dailyFocus).length > 1100) throw new Error('Invalid daily focus backup.');
    for (const [key, ids] of Object.entries(obj.dailyFocus)) {
      if (!validISODate(key) || !key || !Array.isArray(ids) || ids.length > 3 ||
        ids.some(id => typeof id !== 'string' || !id || id.length > 100) ||
        new Set(ids).size !== ids.length) throw new Error('Invalid daily focus selection.');
      dailyFocus[key] = ids;
    }
  }
  return { version: 1, tasks, completions, weekPlans, dailyFocus, theme: obj.theme === 'dark' ? 'dark' : 'light' };
}

/** A weekly plan remains explicit, so postponement cannot silently inflate progress. */
export function setWeekCommitment(state: BoardState, weekStart: string, task: Task, include: boolean): BoardState {
  if (!validISODate(weekStart) || !weekStart || new Date(`${weekStart}T12:00:00Z`).getUTCDay() !== 1) return state;
  const current = state.weekPlans?.[weekStart] ?? { weekStart, commitments: [], review: null };
  const already = current.commitments.some(c => c.taskId === task.id);
  if (already === include) return state;
  if (include && (task.archivedAt || current.commitments.length >= 150)) return state;
  const commitments = include
    ? [...current.commitments, {
      taskId: task.id, title: task.title, priority: task.priority,
      plannedDate: task.dueDate >= weekStart && task.dueDate <= addDaysUTC(weekStart, 6) ? task.dueDate : ''
    }]
    : current.commitments.filter(c => c.taskId !== task.id);
  const review = current.review ? { ...current.review, savedAt: '', scoreSnapshot: null } : null;
  return { ...state, weekPlans: { ...state.weekPlans, [weekStart]: { weekStart, commitments, review } } };
}

function addDaysUTC(day: string, count: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/** Pick no more than three deliberate daily priorities; independent of task status. */
export function toggleDailyFocus(state: BoardState, day: string, taskId: string): BoardState {
  if (!validISODate(day) || !day || !state.tasks.some(t => t.id === taskId && !t.archivedAt)) return state;
  const current = state.dailyFocus?.[day] ?? [];
  const included = current.includes(taskId);
  if (!included && current.length >= 3) return state;
  const next = included ? current.filter(id => id !== taskId) : [...current, taskId];
  return { ...state, dailyFocus: { ...state.dailyFocus, [day]: next } };
}

/** The saved review freezes an end-of-week score for later comparison. */
export function saveWeekReview(state: BoardState, weekStart: string, notes: Pick<WeekReview, 'wins' | 'blockers' | 'adjustment'>, score: number | null, now = new Date()): BoardState {
  const plan = state.weekPlans?.[weekStart];
  if (!plan || ![notes.wins, notes.blockers, notes.adjustment].every(text => typeof text === 'string' && text.length <= 1400) ||
    (score !== null && (!Number.isInteger(score) || score < 0 || score > 100))) return state;
  return {
    ...state, weekPlans: {
      ...state.weekPlans,
      [weekStart]: { ...plan, review: {
        wins: notes.wins.trim(), blockers: notes.blockers.trim(), adjustment: notes.adjustment.trim(),
        savedAt: now.toISOString(), scoreSnapshot: score
      } }
    }
  };
}
