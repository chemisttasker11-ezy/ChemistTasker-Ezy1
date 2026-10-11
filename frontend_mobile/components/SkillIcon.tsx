import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import { findSkill } from '@chemisttasker/shared-core';
import { DoseBlisterIcon } from './DoseBlisterIcon';

/** Shared native skill glyph for job and talent badges. Labels stay visible. */
export function SkillIcon({ skill, size = 16 }: { skill: string; size?: number }) {
  const name = findSkill(registry as any, skill)?.icon_mobile;
  if (name === 'BLISTER_PACK' || name === 'BLISTER_CHECK') {
    return <DoseBlisterIcon checked={name === 'BLISTER_CHECK'} size={size} />;
  }
  return <MaterialCommunityIcons name={(name || 'help-circle-outline') as any} size={size} color="#2463A6" />;
}
