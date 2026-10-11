import * as Lucide from 'lucide-react';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import { findSkill, skillLabel as resolveSkillLabel } from '@chemisttasker/shared-core';
import * as React from 'react';
export function skillLabel(value: string): string { return resolveSkillLabel(registry as any, value); }
export default function SkillIcon({ skill, size = 16, className }: { skill: string; size?: number; className?: string }) {
  const definition = findSkill(registry as any, skill);
  const name = definition?.icon_web || 'CircleHelp';
  if (name === 'BLISTER_PACK' || name === 'BLISTER_CHECK') {
    return <svg width={size} height={size} viewBox="0 0 26 26" role="img" aria-label={definition?.label || skill} className={className}>
      <rect x="2" y="2" width="22" height="22" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6"/>
      {[0,1,2,3].map(row => [0,1,2].map(col =>
        <ellipse key={row+'-'+col} cx={6+col*7} cy={5.5+row*5} rx="1.8" ry="1.65" fill="none" stroke="currentColor" strokeWidth="1" />))}
      {name === 'BLISTER_CHECK' && <path d="M14 20l3 3 6-7" stroke="#139568" strokeWidth="2.3" fill="none"/>}
    </svg>;
  }
  const Icon = (Lucide as unknown as Record<string, React.ComponentType<any>>)[name] || Lucide.CircleHelp;
  return <Icon size={size} strokeWidth={1.8} className={className} aria-label={definition?.label || skill} />;
}
export function SkillBadge({skill}:{skill:string}) { return <span className="skill-badge"><SkillIcon skill={skill}/>{skillLabel(skill)}</span>; }
