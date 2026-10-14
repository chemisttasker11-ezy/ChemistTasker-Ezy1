// A worker's skills, everywhere they are shown (talent cards, candidate review, booked-worker profile): two rows,
// Skills and Software (owner decision 2026-10-14, the job board's split; projectTalentSkills), drawn like the job board's
// requirements. Cards use `compact` (symbol tiles that explain themselves); profiles use name chips.
// Certificate skills carry their check state (StatusMark); other skills never have one.
import { Box, Chip, Stack, Typography } from '@mui/material';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import { evidenceExplainer, evidenceStateLabel, findSkill, projectTalentSkills, skillEvidenceState, type BadgeAudience, type VerificationSummary } from '@chemisttasker/shared-core';
import { SkillSymbol } from './SkillGlyph';
import { SymbolTip } from './SkillSymbolButton';
import { SkillEvidenceMark, StatusMark } from './VerificationBadges';

const reg = registry as any;
export const WORKER_SKILL_GROUPS = [
  { key: 'skills', title: 'Skills' },
  { key: 'dispenseSoftware', title: 'Software' },
] as const;

const heading = { fontFamily: 'Inter, sans-serif', color: 'text.primary', fontWeight: 800, fontSize: 13, lineHeight: 1.35 } as const;

export function WorkerSkillRows({ skills, verification = null, compact = false, audience = 'employer' }: {
  skills: readonly string[];
  verification?: VerificationSummary | null;
  compact?: boolean;
  audience?: BadgeAudience;
}) {
  const groups = projectTalentSkills(reg, skills);
  const rows = WORKER_SKILL_GROUPS.filter(group => groups[group.key].length > 0);
  if (!rows.length) return null;
  return (
    <Stack spacing={compact ? 1 : 1.5}>
      {rows.map(({ key, title }) => (
        <Stack key={key} direction={compact ? { xs: 'column', sm: 'row' } : 'column'} spacing={compact ? { xs: 0.5, sm: 1.25 } : 0.75}
          alignItems={compact ? { xs: 'flex-start', sm: 'center' } : 'stretch'}>
          <Typography component="h4" sx={{ ...heading, minWidth: compact ? { sm: 76 } : undefined }}>{title}</Typography>
          <Stack direction="row" useFlexGap flexWrap="wrap" gap={compact ? 0.75 : 0.5}>
            {groups[key].map(code => {
              const label = findSkill(reg, code)?.label || code;
              const state = skillEvidenceState(verification, code);
              if (!compact) {
                return <Chip key={code} size="small" icon={<SkillSymbol skill={code} size={18} />}
                  label={<Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>{label}<SkillEvidenceMark state={state} skill={label} /></Box>} />;
              }
              const checked = state ? `${evidenceStateLabel(state)}. ${evidenceExplainer(state, audience)}` : undefined;
              return (
                <SymbolTip key={code} title={label} detail={checked ?? findSkill(reg, code)?.definition} ariaLabel={state ? `${label}: ${evidenceStateLabel(state)}` : label}>
                  <SkillSymbol skill={code} size={26} />
                  {state && <Box component="span" sx={{ position: 'absolute', right: -4, bottom: -4, lineHeight: 0 }}><StatusMark state={state} size={14} /></Box>}
                </SymbolTip>
              );
            })}
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}
