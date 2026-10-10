'use client';

// Building blocks for the shift and talent filter panels, shared by the Vite dashboard and the Next public site.
// Colours use the dashboard's theme variables where they exist, with the brand light values as fallbacks.
import React, { useState } from 'react';
import { Box, Button, ButtonBase, Stack, Typography } from '@mui/material';
import { Check as CheckIcon, ExpandLess as ExpandLessIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';

export const filterColors = {
  text: 'var(--ct-text-primary, #172747)',
  muted: 'var(--ct-text-secondary, #52617C)',
  border: 'var(--ct-border-color, #DFE5EF)',
  surface: 'var(--ct-surface-bg, #FFFFFF)',
  hover: 'var(--ct-hover-bg, #F5F1FC)',
  accent: 'var(--ct-accent-strong, #3C18A8)',
  accentBg: 'var(--ct-tone-violet-bg, #F1ECFC)',
  urgent: 'var(--ct-status-amber-fg, #A15C07)',
} as const;
const c = filterColors;

/** A filter option as a toggle chip: one tap on, one tap off, state announced with aria-pressed. */
export function FilterChip({ selected, onClick, icon, children }: { selected: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <ButtonBase
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      sx={{
        gap: 0.75,
        minHeight: 36,
        maxWidth: '100%',
        px: 1.4,
        borderRadius: '999px',
        border: '1px solid',
        borderColor: selected ? c.accent : c.border,
        bgcolor: selected ? c.accentBg : c.surface,
        color: selected ? c.accent : c.text,
        fontSize: 13.5,
        fontWeight: selected ? 600 : 500,
        lineHeight: 1.2,
        textAlign: 'left',
        overflowWrap: 'anywhere',
        transition: 'background-color 140ms ease, border-color 140ms ease',
        '& svg': { fontSize: 17, flexShrink: 0 },
        '&:hover': { borderColor: c.accent, bgcolor: selected ? c.accentBg : c.hover },
        '&.Mui-focusVisible': { outline: `2px solid ${c.accent}`, outlineOffset: 2 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {selected ? <CheckIcon aria-hidden /> : icon ? <Box component="span" aria-hidden sx={{ display: 'inline-flex', color: c.muted }}>{icon}</Box> : null}
      {children}
    </ButtonBase>
  );
}

export const FilterChips = ({ children }: { children: React.ReactNode }) => (
  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.85, minWidth: 0 }}>{children}</Box>
);

/** A collapsible group of filters with a hairline above it. */
export function FilterSection({ title, idPrefix, children }: { title: string; idPrefix: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);
  const id = `${idPrefix}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <Box sx={{ borderTop: `1px solid ${c.border}`, pt: 1.5, mt: 1.5, minWidth: 0 }}>
      <Button
        type="button"
        fullWidth
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={id}
        endIcon={isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        sx={{
          justifyContent: 'space-between', textTransform: 'none', color: c.text, fontWeight: 600, fontSize: 14, lineHeight: 1.35,
          textAlign: 'left', px: 0.5, py: 0.4, mb: isOpen ? 1 : 0, minHeight: 36, minWidth: 0, borderRadius: '8px',
          '& .MuiButton-endIcon': { ml: 1, color: c.muted, '& svg': { fontSize: 19 } },
          '&:hover': { bgcolor: c.hover },
        }}
      >
        {title}
      </Button>
      <Box id={id} hidden={!isOpen} sx={{ display: isOpen ? 'block' : 'none', minWidth: 0, px: 0.25 }}>
        {children}
      </Box>
    </Box>
  );
}

/** "Filters" with the number that are on, and Clear all when there is something to clear. */
export function FiltersHeader({ active, onClearAll }: { active: number; onClearAll?: () => void }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5, px: 0.25, minHeight: 32 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography component="h2" sx={{ fontFamily: 'var(--ct-font-display, inherit)', fontWeight: 600, fontSize: 17, color: c.text }}>Filters</Typography>
        {active > 0 && (
          <Box component="span" aria-label={`${active} active`} sx={{ minWidth: 22, height: 22, px: 0.75, borderRadius: '999px', display: 'inline-grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color: '#FFFFFF', bgcolor: c.accent }}>
            {active}
          </Box>
        )}
      </Stack>
      {onClearAll && active > 0 && (
        <Button type="button" size="small" onClick={onClearAll} sx={{ textTransform: 'none', fontWeight: 600, color: c.accent, minHeight: 32 }}>
          Clear all
        </Button>
      )}
    </Stack>
  );
}
