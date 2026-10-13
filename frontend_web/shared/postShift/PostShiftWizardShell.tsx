import React, { useState } from 'react';
import { Box, Button, ButtonBase, Stack, Typography } from '@mui/material';
import { Check } from 'lucide-react';

export type StepTone = 'violet' | 'blue' | 'cyan' | 'magenta';

export type PostShiftWizardStep = {
  key: string;
  label: string;
  icon: React.ElementType;
  tone?: StepTone;
};

type Props = {
  steps: PostShiftWizardStep[];
  activeStep: number;
  setActiveStep: React.Dispatch<React.SetStateAction<number>>;
  isMobile: boolean;
  isEmbedded: boolean;
  isEditing: boolean;
  slotsLength: number;
  onSubmit: () => void | Promise<void>;
  submitting: boolean;
  children: React.ReactNode;
};

const tone = (name: StepTone = 'violet') => ({ bg: `var(--ct-tone-${name}-bg)`, fg: `var(--ct-tone-${name}-fg)` });
const BRAND = '#5222B8';

/** Progress header: icon tiles on wider screens, "Step n of N" with a segmented bar on phones. Onboarding reuses it. */
export function StepProgress({ steps, activeStep, onSelect, canSelect, compact, label = 'Post shift steps' }: {
  steps: PostShiftWizardStep[]; activeStep: number; onSelect: (index: number) => void; canSelect: (index: number) => boolean; compact: boolean; label?: string;
}) {
  if (compact) {
    const current = steps[activeStep];
    const Icon = current?.icon;
    return (
      <Box sx={{ mb: 2.5 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box aria-hidden sx={{ width: 40, height: 40, borderRadius: '12px', bgcolor: BRAND, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            {Icon && <Icon size={20} strokeWidth={1.75} />}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary' }}>Step {activeStep + 1} of {steps.length}</Typography>
            <Typography component="p" sx={{ fontSize: 17, fontWeight: 700, lineHeight: 1.25 }}>{current?.label}</Typography>
          </Box>
          {steps[activeStep + 1] && (
            <Typography sx={{ ml: 'auto', fontSize: 12.5, color: 'text.secondary', textAlign: 'right' }}>Next: {steps[activeStep + 1].label}</Typography>
          )}
        </Stack>
        <Stack direction="row" spacing={0.5} sx={{ mt: 1.5 }} role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={activeStep + 1}
          aria-label={`Step ${activeStep + 1} of ${steps.length}`}>
          {steps.map((step, index) => (
            <Box key={step.key} sx={{
              flex: 1, height: 6, borderRadius: 3,
              bgcolor: index < activeStep ? tone(step.tone).fg : index === activeStep ? BRAND : 'action.hover',
              opacity: index < activeStep ? 0.75 : 1,
            }} />
          ))}
        </Stack>
      </Box>
    );
  }

  return (
    <Box component="ol" aria-label={label} sx={{ listStyle: 'none', m: 0, mb: 3, p: 0, display: 'flex' }}>
      {steps.map((step, index) => {
        const done = index < activeStep;
        const active = index === activeStep;
        const Icon = step.icon;
        const { bg, fg } = tone(step.tone);
        const selectable = !active && canSelect(index);
        return (
          <Box component="li" key={step.key} sx={{ flex: 1, position: 'relative', minWidth: 0 }}>
            {index > 0 && (
              <Box aria-hidden sx={{
                position: 'absolute', top: 27, right: '50%', width: '100%', height: 3, borderRadius: 2, zIndex: 0,
                background: index <= activeStep ? `linear-gradient(90deg, ${BRAND}, #00BDD2)` : 'var(--ct-border-color, #E5E7EB)',
              }} />
            )}
            <ButtonBase disabled={!selectable} onClick={() => onSelect(index)} aria-current={active ? 'step' : undefined}
              aria-label={`${step.label}${done ? ', done' : active ? ', current step' : ''}`}
              sx={{
                position: 'relative', zIndex: 1, width: '100%', flexDirection: 'column', gap: 1, borderRadius: '14px', py: 0.5,
                '&.Mui-focusVisible .step-tile': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 3 },
                '&:hover .step-tile': selectable ? { transform: 'translateY(-1px)' } : undefined,
              }}>
              <Box className="step-tile" sx={{
                position: 'relative', width: 48, height: 48, borderRadius: '15px', display: 'grid', placeItems: 'center',
                transition: 'transform 160ms ease, box-shadow 160ms ease',
                ...(active
                  ? { bgcolor: BRAND, color: '#fff', boxShadow: '0 0 0 5px rgba(82, 34, 184, 0.14), 0 10px 22px rgba(82, 34, 184, 0.28)' }
                  : done
                    ? { bgcolor: bg, color: fg }
                    : { bgcolor: 'background.paper', color: 'text.secondary', border: '1.5px solid', borderColor: 'divider' }),
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}>
                <Icon size={22} strokeWidth={active ? 2 : 1.75} />
                {done && (
                  <Box aria-hidden sx={{
                    position: 'absolute', right: -5, bottom: -5, width: 20, height: 20, borderRadius: '50%', bgcolor: BRAND, color: '#fff',
                    display: 'grid', placeItems: 'center', border: '2px solid', borderColor: 'background.paper',
                  }}><Check size={12} strokeWidth={3} /></Box>
                )}
              </Box>
              <Typography sx={{
                fontSize: 13.5, fontWeight: active ? 700 : 600, color: active ? 'text.primary' : done ? fg : 'text.secondary',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', px: 0.5,
              }}>{step.label}</Typography>
            </ButtonBase>
          </Box>
        );
      })}
    </Box>
  );
}

export default function PostShiftWizardShell({
  steps, activeStep, setActiveStep, isMobile, isEmbedded, isEditing, slotsLength, onSubmit, submitting, children,
}: Props) {
  const [blocked, setBlocked] = useState('');
  const go = (index: number) => { setBlocked(''); setActiveStep(index); };

  return (
    <>
      <StepProgress steps={steps} activeStep={activeStep} compact={isMobile} onSelect={go}
        canSelect={index => isEditing || index < activeStep} />

      <Box sx={{ minHeight: isEmbedded ? 0 : 350, px: isEmbedded ? 0 : { xs: 0, md: 2.5 }, pt: isEmbedded ? 0 : 0.5 }}>
        {!isEmbedded && !isMobile && (
          <Typography variant="h5" fontWeight={600} gutterBottom>
            {steps[activeStep].label}
          </Typography>
        )}
        {children}
      </Box>

      <Stack
        direction={{ xs: 'column-reverse', sm: 'row' }}
        spacing={{ xs: 2, sm: 3 }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        sx={{ mt: isEmbedded ? 1.5 : 5, pt: isEmbedded ? 1.5 : 3, borderTop: '1px solid', borderColor: 'divider' }}
      >
        <Button onClick={() => go(activeStep - 1)} disabled={activeStep === 0} variant="text" sx={{ minWidth: 120 }}>
          Back
        </Button>
        {blocked && (
          <Typography role="alert" color="error" sx={{ fontWeight: 600, fontSize: 14, flex: 1, textAlign: { sm: 'right' } }}>{blocked}</Typography>
        )}
        {activeStep < steps.length - 1 ? (
          <Button
            onClick={() => {
              if (steps[activeStep]?.key === 'timetable' && slotsLength === 0) {
                setBlocked('Add at least one date before you continue.');
                return;
              }
              go(activeStep + 1);
            }}
            variant="contained"
            fullWidth={isMobile}
            sx={{ minWidth: isMobile ? '100%' : 140, borderRadius: 2 }}
          >
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            color="success"
            onClick={onSubmit}
            disabled={submitting}
            fullWidth={isMobile}
            sx={{ minWidth: isMobile ? '100%' : 160, borderRadius: 2 }}
          >
            {submitting ? 'Submitting...' : (isEditing ? 'Update Shift' : 'Post Shift')}
          </Button>
        )}
      </Stack>
    </>
  );
}
