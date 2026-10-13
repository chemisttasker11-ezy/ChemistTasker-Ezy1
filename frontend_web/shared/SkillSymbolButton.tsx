import type { ReactNode } from 'react';
import { Box, ButtonBase, Tooltip, Typography } from '@mui/material';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import { findSkill } from '@chemisttasker/shared-core';
import { SkillSymbol } from './SkillGlyph';

/**
 * A symbol on its own for compact rows. Hover, keyboard focus or a tap opens a short navy explainer;
 * screen readers get `ariaLabel`. Use symbol + name chips wherever there is room.
 */
export function SymbolTip({ title, detail, ariaLabel, emphasis = 'neutral', size = 26, children }: {
  title: string; detail?: string; ariaLabel: string; emphasis?: 'required' | 'neutral'; size?: number; children: ReactNode;
}) {
  return (
    <Tooltip arrow enterTouchDelay={0} leaveTouchDelay={4000} describeChild
      slotProps={{
        tooltip: { sx: { bgcolor: '#06214A', color: '#FFFFFF', maxWidth: 260, px: 1.5, py: 1, borderRadius: '10px', boxShadow: '0 10px 28px rgba(6, 18, 58, 0.22)', opacity: 1 } },
        arrow: { sx: { color: '#06214A' } },
      }}
      title={<Box sx={{ py: 0.25 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35, color: '#FFFFFF' }}>{title}</Typography>
        {detail && <Typography sx={{ fontSize: 12.5, lineHeight: 1.45, color: '#D5DEEE' }}>{detail}</Typography>}
      </Box>}>
      <ButtonBase aria-label={ariaLabel}
        sx={{
          position: 'relative', minWidth: size + 14, height: size + 14, px: 0.5, borderRadius: '12px', flexShrink: 0,
          border: '1px solid', borderColor: emphasis === 'required' ? 'rgba(82, 34, 184, 0.28)' : 'rgba(6, 33, 74, 0.12)',
          bgcolor: emphasis === 'required' ? 'action.selected' : 'background.paper',
          color: 'text.primary',
          transition: 'transform 160ms cubic-bezier(.2,.8,.2,1), border-color 160ms ease',
          '&:hover': { transform: 'translateY(-1px)', borderColor: 'rgba(82, 34, 184, 0.45)' },
          '&.Mui-focusVisible': { outline: '2px solid #5222B8', outlineOffset: 2 },
          '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' } },
        }}>
        {children}
      </ButtonBase>
    </Tooltip>
  );
}

/** A skill or software by registry ID, explained by its name and one-line definition. */
export function SkillSymbolButton({ skill, size = 26, emphasis = 'required' }: {
  skill: string; size?: number; emphasis?: 'required' | 'preferred';
}) {
  const definition = findSkill(registry as any, skill);
  const label = definition?.label || skill;
  return (
    <SymbolTip title={label} detail={definition?.definition} size={size} emphasis={emphasis === 'required' ? 'required' : 'neutral'}
      ariaLabel={`${emphasis === 'required' ? 'Required' : 'Preferred'}: ${label}`}>
      <SkillSymbol skill={skill} size={size} />
    </SymbolTip>
  );
}
