import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function EmptyState({ icon: Icon, title, caption, action }: { icon: LucideIcon; title: string; caption: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={24}/></div><h3>{title}</h3><p>{caption}</p>{action}</div>;
}

