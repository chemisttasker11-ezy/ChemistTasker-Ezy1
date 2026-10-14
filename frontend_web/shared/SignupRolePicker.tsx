'use client';

// "I'm joining as": three main account types, then a separate path for people new to pharmacy in Australia, which asks
// which kind of newcomer they are and their date of birth (minimum age 15). Native radios keep keyboard behaviour.
import type { ReactNode } from 'react';
import { Box, Stack, TextField, Typography } from '@mui/material';
import { ArrowRight, Compass, Pill, Store, Users } from 'lucide-react';
import { NEWCOMER_MINIMUM_AGE, NEWCOMER_TYPES, ageFromBirthDate } from '@chemisttasker/shared-core';

export type SignupRole = 'OWNER' | 'PHARMACIST' | 'OTHER_STAFF' | 'EXPLORER';

const MAIN: { value: SignupRole; title: string; body: string; icon: ReactNode }[] = [
  { value: 'OWNER', title: 'Pharmacy owner', body: 'Post shifts, run rosters and manage your team.', icon: <Store /> },
  { value: 'PHARMACIST', title: 'Pharmacist', body: 'Find locum, casual and permanent work.', icon: <Pill /> },
  { value: 'OTHER_STAFF', title: 'Pharmacy team', body: 'Assistant · Technician · Intern · Student', icon: <Users /> },
];

const BRAND = 'var(--ct-accent-strong, #3C18A8)';

/** What still blocks a newcomer sign-up, in words; null when the answers are complete. */
export function newcomerSignupProblem(role: SignupRole | null, newcomerType: string, dateOfBirth: string): string | null {
  if (role !== 'EXPLORER') return null;
  if (!newcomerType) return 'Tell us which describes you best.';
  const age = ageFromBirthDate(dateOfBirth);
  if (age == null) return 'Enter your date of birth.';
  if (age < NEWCOMER_MINIMUM_AGE) return `You need to be at least ${NEWCOMER_MINIMUM_AGE} to join ChemistTasker.`;
  return null;
}

function Choice({ name, value, checked, onSelect, title, body, icon, trailing, wide = false }: {
  name: string; value: string; checked: boolean; onSelect: (value: string) => void;
  title: string; body: string; icon?: ReactNode; trailing?: ReactNode; wide?: boolean;
}) {
  return (
    <Box
      component="label"
      sx={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 1.5, p: wide ? 1.75 : 1.5, minHeight: 64,
        borderRadius: '14px', cursor: 'pointer', bgcolor: checked ? 'var(--ct-tone-violet-bg, #EEEAF9)' : 'var(--ct-surface-bg, #FFFFFF)',
        border: '1.5px solid', borderColor: checked ? BRAND : 'var(--ct-border-color, #D5DCE8)',
        transition: 'border-color 140ms ease, background-color 140ms ease',
        '&:hover': { borderColor: checked ? BRAND : 'var(--ct-text-secondary, #445474)' },
        '&:has(input:focus-visible)': { outline: `2px solid ${BRAND}`, outlineOffset: 2 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onSelect(value)}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
      {icon && (
        <Box aria-hidden sx={{ width: 40, height: 40, flex: '0 0 40px', borderRadius: '12px', display: 'grid', placeItems: 'center',
          bgcolor: checked ? BRAND : 'var(--ct-tone-violet-bg, #EEEAF9)', color: checked ? '#FFFFFF' : 'var(--ct-tone-violet-fg, #4A1FA8)',
          '& svg': { width: 20, height: 20, strokeWidth: 1.75 } }}>{icon}</Box>
      )}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'var(--ct-text-primary, #06214A)', lineHeight: 1.3 }}>{title}</Typography>
        <Typography sx={{ fontSize: 13, color: 'var(--ct-text-secondary, #445474)', lineHeight: 1.4, mt: 0.25 }}>{body}</Typography>
      </Box>
      {trailing}
    </Box>
  );
}

export function SignupRolePicker({ role, onRole, newcomerType, onNewcomerType, dateOfBirth, onDateOfBirth, showErrors }: {
  role: SignupRole | null;
  onRole: (role: SignupRole) => void;
  newcomerType: string;
  onNewcomerType: (value: string) => void;
  dateOfBirth: string;
  onDateOfBirth: (value: string) => void;
  /** After a submit attempt: show what is missing next to the field. */
  showErrors: boolean;
}) {
  const age = ageFromBirthDate(dateOfBirth);
  const tooYoung = age != null && age < NEWCOMER_MINIMUM_AGE;
  return (
    <Stack component="fieldset" spacing={1.25} sx={{ border: 0, m: 0, p: 0, mt: 2.5, minWidth: 0 }}>
      <Typography component="legend" sx={{ fontSize: 15, fontWeight: 600, color: 'var(--ct-text-primary, #06214A)', mb: 1, p: 0 }}>
        I'm joining as
      </Typography>
      <Stack spacing={1} role="radiogroup" aria-label="Account type">
        {MAIN.map(item => (
          <Choice key={item.value} name="signup-role" value={item.value} checked={role === item.value} onSelect={value => onRole(value as SignupRole)}
            title={item.title} body={item.body} icon={item.icon} />
        ))}
        <Stack direction="row" alignItems="center" spacing={1.5} aria-hidden sx={{ py: 0.75 }}>
          <Box sx={{ flex: 1, height: '1px', bgcolor: 'var(--ct-border-color, #D5DCE8)' }} />
          <Typography sx={{ fontSize: 12.5, color: 'var(--ct-text-secondary, #445474)' }}>or</Typography>
          <Box sx={{ flex: 1, height: '1px', bgcolor: 'var(--ct-border-color, #D5DCE8)' }} />
        </Stack>
        <Choice name="signup-role" value="EXPLORER" checked={role === 'EXPLORER'} onSelect={() => onRole('EXPLORER')} wide
          title="New to pharmacy in Australia? Start here" icon={<Compass />}
          body="Overseas-qualified, school students, placement seekers and anyone curious about pharmacy."
          trailing={<Box aria-hidden sx={{ color: BRAND, display: 'grid', '& svg': { width: 18, height: 18 } }}><ArrowRight /></Box>} />
      </Stack>
      {showErrors && !role && <Typography role="alert" sx={{ fontSize: 13, color: 'error.main' }}>Choose how you're joining.</Typography>}

      {role === 'EXPLORER' && (
        <Stack spacing={1.5} sx={{ mt: 1, p: { xs: 1.5, sm: 2 }, borderRadius: '16px', bgcolor: 'var(--ct-subtle-bg, #F5F8FC)' }}>
          <Stack component="fieldset" spacing={1} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
            <Typography component="legend" sx={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ct-text-primary, #06214A)', mb: 1, p: 0 }}>
              Which describes you best?
            </Typography>
            <Stack spacing={1} role="radiogroup" aria-label="Which describes you best">
              {NEWCOMER_TYPES.map(item => (
                <Choice key={item.value} name="newcomer-type" value={item.value} checked={newcomerType === item.value} onSelect={onNewcomerType}
                  title={item.label} body={item.description} />
              ))}
            </Stack>
            {showErrors && !newcomerType && <Typography role="alert" sx={{ fontSize: 13, color: 'error.main' }}>Tell us which describes you best.</Typography>}
          </Stack>
          <TextField
            type="date" label="Date of birth" value={dateOfBirth} onChange={event => onDateOfBirth(event.target.value)} fullWidth
            InputLabelProps={{ shrink: true }} inputProps={{ max: new Date().toISOString().slice(0, 10) }}
            error={tooYoung || (showErrors && age == null)}
            helperText={tooYoung
              ? `You need to be at least ${NEWCOMER_MINIMUM_AGE} to join ChemistTasker.`
              : showErrors && age == null
                ? 'Enter your date of birth.'
                : `You need to be at least ${NEWCOMER_MINIMUM_AGE}. If you're under 18, only your first name is shown.`}
            sx={{ bgcolor: 'var(--ct-surface-bg, #FFFFFF)', borderRadius: '12px' }}
          />
        </Stack>
      )}
    </Stack>
  );
}
