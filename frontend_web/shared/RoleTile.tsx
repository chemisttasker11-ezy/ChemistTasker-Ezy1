'use client';

import { Box } from '@mui/material';
import {
  AutorenewRounded as SwitcherIcon,
  LocalPharmacyOutlined as PharmacistIcon,
  MedicationOutlined as TechnicianIcon,
  PersonOutlineRounded as PersonIcon,
  SchoolOutlined as StudentIcon,
  StorefrontOutlined as AssistantIcon,
} from '@mui/icons-material';

type Tone = 'violet' | 'blue' | 'cyan' | 'magenta' | 'amber' | 'neutral';

// Theme variables in the dashboard; brand light values as fallbacks on the public site.
const TONES: Record<Tone, { bg: string; fg: string }> = {
  violet: { bg: 'var(--ct-tone-violet-bg, #EEEAF9)', fg: 'var(--ct-tone-violet-fg, #4A1FA8)' },
  blue: { bg: 'var(--ct-tone-blue-bg, #E6EEFE)', fg: 'var(--ct-tone-blue-fg, #1F4FBF)' },
  cyan: { bg: 'var(--ct-tone-cyan-bg, #E2F5F8)', fg: 'var(--ct-tone-cyan-fg, #0B6577)' },
  magenta: { bg: 'var(--ct-tone-magenta-bg, #FCE8F8)', fg: 'var(--ct-tone-magenta-fg, #A1179A)' },
  amber: { bg: 'var(--ct-status-amber-bg, #FFF2DE)', fg: 'var(--ct-status-amber-fg, #8A4E00)' },
  neutral: { bg: 'var(--ct-subtle-bg, #EFF2F8)', fg: 'var(--ct-text-secondary, #445474)' },
};

/** Icon and colour for a talent role, so the board reads at a glance (pharmacist, intern, student…). */
export function roleLook(role?: string | null): { tone: Tone; Icon: typeof PersonIcon } {
  const r = String(role || '').toLowerCase();
  if (r.includes('intern')) return { tone: 'blue', Icon: StudentIcon };
  if (r.includes('student')) return { tone: 'magenta', Icon: StudentIcon };
  if (r.includes('switcher')) return { tone: 'amber', Icon: SwitcherIcon };
  if (r.includes('technician')) return { tone: 'cyan', Icon: TechnicianIcon };
  if (r.includes('assistant') || r.includes('junior')) return { tone: 'cyan', Icon: AssistantIcon };
  if (r.includes('pharmacist')) return { tone: 'violet', Icon: PharmacistIcon };
  return { tone: 'neutral', Icon: PersonIcon };
}

export function RoleTile({ role, size = 52 }: { role?: string | null; size?: number }) {
  const { tone, Icon } = roleLook(role);
  const { bg, fg } = TONES[tone];
  return (
    <Box aria-hidden sx={{ width: size, height: size, borderRadius: '16px', bgcolor: bg, color: fg, display: 'grid', placeItems: 'center', flexShrink: 0, '& svg': { fontSize: size * 0.5 } }}>
      <Icon />
    </Box>
  );
}
