import registry from '@chemisttasker/shared-core/skills_registry.json';
import { findSkill, skillLabel as resolveSkillLabel } from '@chemisttasker/shared-core';
import { SkillGlyph } from '../../shared/SkillGlyph';

export function skillLabel(value: string): string { return resolveSkillLabel(registry as any, value); }
export default function SkillIcon({ skill, size = 16, className }: { skill: string; size?: number; className?: string }) {
  const definition = findSkill(registry as any, skill);
  return <SkillGlyph name={definition?.icon_web || 'CircleHelp'} title={definition?.label || skill} size={size} className={className} decorative />;
}
export function SkillBadge({skill}:{skill:string}) { return <span className="skill-badge"><SkillIcon skill={skill}/>{skillLabel(skill)}</span>; }
