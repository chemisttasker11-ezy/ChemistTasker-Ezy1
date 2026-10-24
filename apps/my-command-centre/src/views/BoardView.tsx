import { useState } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, pointerWithin, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ChevronDown, Flag, GripVertical, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { CATEGORIES, LANES, type Category, type Lane, type Priority, type Task, type TaskStatus } from '../model';
import { BoardLane, CardPresentation } from '../components/TaskBoard';

interface Props {
  visible: Task[]; search: string; setSearch: (value: string) => void;
  categoryFilter: Category | 'All'; setCategoryFilter: (value: Category | 'All') => void;
  priorityFilter: Priority | 'All'; setPriorityFilter: (value: Priority | 'All') => void;
  selectedLane: Lane; setSelectedLane: (lane: Lane) => void;
  day: string; completed: (task: Task) => boolean; showEditor: (task: Task | null, lane?: Lane) => void;
  toggleTask: (id: string) => void; moveTask: (id: string, lane: Lane, overId?: string) => void;
  archiveTask: (id: string) => void; duplicateTask: (task: Task) => void;
  changeStatus: (id: string, status: TaskStatus, postponedTo?: string) => void; toggleSubtask: (id: string, subtaskId: string) => void;
}

export function BoardView({ visible, search, setSearch, categoryFilter, setCategoryFilter, priorityFilter, setPriorityFilter, selectedLane, setSelectedLane, day, completed, showEditor, toggleTask, moveTask, archiveTask, duplicateTask, changeStatus, toggleSubtask }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 7 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const collisionDetection: CollisionDetection = args => {
    const pointers = pointerWithin(args);
    if (pointers.length) {
      const taskTargets = pointers.filter(c => !LANES.some(l => l.id === c.id));
      return taskTargets.length ? taskTargets : pointers;
    }
    return closestCorners(args);
  };
  function onDragStart({ active }: DragStartEvent) { setDraggingId(String(active.id)); }
  function onDragEnd({ active, over }: DragEndEvent) {
    setDraggingId(null);
    if (!over || active.id === over.id) return;
    const target = visible.find(t => t.id === String(over.id));
    const lane = target?.lane ?? LANES.find(l => l.id === String(over.id))?.id;
    if (lane) moveTask(String(active.id), lane, target?.id);
  }
  const draggingTask = visible.find(t => t.id === draggingId);

  return <>
          <div className="page-title-row"><div><span className="eyebrow">MAKE IT HAPPEN</span><h1>My task board <span className="heading-sparkle">✦</span></h1><p>Six spaces for your priorities. Drag tasks between columns, or use each card's menu.</p></div><button className="button button-primary desktop-action" onClick={() => showEditor(null, selectedLane)}><Plus size={18}/> Add task</button></div>
          <div className="board-toolbar"><div className="board-search"><Search size={17}/><input aria-label="Search tasks" placeholder="Search your tasks..." value={search} onChange={e => setSearch(e.target.value)}/>{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={16}/></button>}</div><label className="filter-select"><SlidersHorizontal size={16}/><select aria-label="Filter by category" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as Category | 'All')}><option value="All">All areas</option>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}</select><ChevronDown size={14}/></label><label className="filter-select"><Flag size={16}/><select aria-label="Filter by priority" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as Priority | 'All')}><option value="All">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select><ChevronDown size={14}/></label><span className="board-total">{visible.length} tasks</span></div>
          <div className="mobile-lane-picker"><label>Choose a column<select value={selectedLane} onChange={e => setSelectedLane(e.target.value as Lane)}>{LANES.map(l => <option key={l.id} value={l.id}>{l.emoji} {l.title}</option>)}</select></label><span>Use ⋯ on a card to move it.</span></div>
          <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragCancel={() => setDraggingId(null)} onDragEnd={onDragEnd}>
            <div className="board-scroller"><div className="kanban-board">{LANES.map(lane => <div key={lane.id} className={selectedLane === lane.id ? 'mobile-lane-visible' : 'mobile-lane-hidden'}><BoardLane lane={lane} tasks={visible.filter(t => t.lane === lane.id)} completed={completed} day={day} onAdd={l => showEditor(null, l)} onComplete={toggleTask} onEdit={showEditor} onMove={moveTask} onArchive={archiveTask} onDuplicate={duplicateTask} onStatus={changeStatus} onSubtask={toggleSubtask}/></div>)}</div></div>
            <DragOverlay>{draggingTask ? <div className="drag-overlay"><CardPresentation task={draggingTask} done={completed(draggingTask)} day={day} onComplete={() => {}} onEdit={() => {}} onMove={() => {}} onArchive={() => {}} onDuplicate={() => {}} onStatus={() => {}} onSubtask={() => {}} ghost/></div> : null}</DragOverlay>
          </DndContext><p className="board-help"><GripVertical size={14}/> Drag by the handle to reorder or move. On touch screens, press and hold. The ⋯ menu works everywhere. Moving columns does not change a custom repeat schedule; edit a task to adjust it.</p>
        </>;
}
