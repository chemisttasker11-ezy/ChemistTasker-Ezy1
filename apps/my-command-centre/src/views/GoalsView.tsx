import { ArrowUpRight, Plus } from 'lucide-react';
import { type Lane, type Task } from '../model';

interface Props {
  goals: Task[]; showEditor: (task: Task | null, lane?: Lane) => void;
}

export function GoalsView({ goals, showEditor }: Props) {
  return <>
          <div className="page-title-row"><div><span className="eyebrow">THE BIG PICTURE</span><h1>Grow into your goals <span className="heading-sparkle">✨</span></h1><p>Progress isn't always urgent. Make space for what you're building.</p></div><button className="button button-primary" onClick={() => showEditor(null, 'goals')}><Plus size={18}/> New goal</button></div>
          <div className="goals-intro"><span>✦</span><div><strong>Keep the dream. Make the next step small.</strong><p>Open a goal to add milestone checklists, notes and an optional target date.</p></div></div><div className="goals-grid">{goals.map((goal, index) => { const done = goal.subtasks.filter(s => s.done).length; return <button key={goal.id} className={`goal-card goal-colour-${index % 5}`} onClick={() => showEditor(goal)}><div className="goal-upper"><span className="goal-symbol">{['✦', '◈', '✳', '♡', '✺'][index % 5]}</span><ArrowUpRight size={18}/></div><span className="goal-category">{goal.category}</span><h3>{goal.title}</h3><p>{goal.description || 'A goal worth making time for.'}</p><div className="goal-progress"><div className="mini-progress"><span style={{ width: `${goal.subtasks.length ? (done / goal.subtasks.length) * 100 : 0}%` }}/></div><span>{goal.subtasks.length ? `${done} of ${goal.subtasks.length} steps` : 'Add your first milestone'}</span></div></button>; })}{<button className="goal-card new-goal-card" onClick={() => showEditor(null, 'goals')}><span className="new-goal-plus"><Plus size={28}/></span><strong>Add a new goal</strong><p>Your next chapter starts here.</p></button>}</div>
        </>;
}
