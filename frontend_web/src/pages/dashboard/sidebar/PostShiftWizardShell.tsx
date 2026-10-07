import { useEffect, useRef, type Dispatch, type ElementType, type ReactNode, type SetStateAction } from 'react';
import { Box, Button, LinearProgress, Stack, Step, StepButton, Stepper, Typography } from '@mui/material';
import { ArrowBackRounded, ArrowForwardRounded, CheckRounded } from '@mui/icons-material';

export type PostShiftWizardStep = { key: string; label: string; icon: ElementType };
type Props = {
  steps: PostShiftWizardStep[];
  activeStep: number;
  setActiveStep: Dispatch<SetStateAction<number>>;
  isMobile: boolean;
  isEmbedded: boolean;
  isEditing: boolean;
  validateStep: (key: string) => boolean;
  onSubmit: () => void | Promise<void>;
  submitting: boolean;
  children: ReactNode;
};

export default function PostShiftWizardShell({ steps, activeStep, setActiveStep, isMobile, isEmbedded, isEditing, validateStep, onSubmit, submitting, children }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(activeStep);
  useEffect(() => {
    if (previousStep.current !== activeStep) {
      heading.current?.focus({ preventScroll: true });
      if (!isEmbedded) heading.current?.scrollIntoView({ block: 'start' });
      previousStep.current = activeStep;
    }
  }, [activeStep, isEmbedded]);
  const current = steps[activeStep];
  if (!current) return null;
  return <>
    {isMobile ? <Box sx={{ mb: 2.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Step {activeStep + 1} of {steps.length} · {current.label}</Typography>
      <LinearProgress variant="determinate" value={(activeStep + 1) / steps.length * 100} aria-label="Posting progress" sx={{ height: 5, borderRadius: 1 }} />
    </Box> : <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4, '& .MuiStepLabel-label': { fontSize: 13 } }}>
      {steps.map((step, index) => <Step key={step.key} completed={index < activeStep}>
        <StepButton disabled={submitting || (!isEditing && index > activeStep)} onClick={() => {
          if (index <= activeStep || validateStep(current.key)) setActiveStep(index);
        }} aria-current={index === activeStep ? 'step' : undefined}>{step.label}</StepButton>
      </Step>)}
    </Stepper>}
    <Box sx={{ minHeight: isEmbedded ? 0 : 300 }}>
      <Typography ref={heading} tabIndex={-1} component="h2" variant="h6" fontWeight={700} sx={{ mb: 2, scrollMarginTop: 100 }}>{current.label}</Typography>
      {children}
    </Box>
    <Stack direction="row" spacing={1.5} justifyContent="space-between" sx={{ mt: 3, pt: 2.5, borderTop: '1px solid', borderColor: 'divider' }}>
      <Button startIcon={<ArrowBackRounded />} onClick={() => setActiveStep((previous) => previous - 1)} disabled={activeStep === 0 || submitting} sx={{ minHeight: 48 }}>Back</Button>
      {activeStep < steps.length - 1 ? <Button variant="contained" endIcon={<ArrowForwardRounded />} disabled={submitting}
        onClick={() => { if (validateStep(current.key)) setActiveStep((previous) => previous + 1); }} sx={{ minHeight: 48 }}>
        {isMobile ? 'Continue' : `Continue to ${steps[activeStep + 1].label.toLowerCase()}`}
      </Button> : <Button variant="contained" startIcon={<CheckRounded />} onClick={onSubmit} disabled={submitting} sx={{ minHeight: 48 }}>
        {submitting ? 'Saving…' : isEditing ? 'Save changes' : isEmbedded ? 'Send booking request' : 'Post shift'}
      </Button>}
    </Stack>
  </>;
}
