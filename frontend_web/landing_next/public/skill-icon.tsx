import registry from '@chemisttasker/shared-core/skills_registry.json';
import { skillLabel as resolveSkillLabel } from '@chemisttasker/shared-core';
import { SkillSymbol } from '@chemisttasker/shared-ui/SkillGlyph';

export function skillLabel(value: string): string { return resolveSkillLabel(registry as any, value); }
export default function SkillIcon({ skill, size = 16, className }: { skill: string; size?: number; className?: string }) {
  return <SkillSymbol skill={skill} size={size} className={className} />;
}
export function SkillBadge({skill}:{skill:string}) { return <span className="skill-badge"><SkillIcon skill={skill}/>{skillLabel(skill)}</span>; }
