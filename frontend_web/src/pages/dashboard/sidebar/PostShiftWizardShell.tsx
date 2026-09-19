import React from 'react';
import {
  Box,
  Button,
  Stack,
  Step,
  StepConnector,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import type { StepIconProps } from '@mui/material/StepIcon';
import { stepConnectorClasses } from '@mui/material/StepConnector';
import WorkIcon from '@mui/icons-material/Work';

export type PostShiftWizardStep = {
  key: string;
  label: string;
  icon: React.ElementType;
};

type Props = {
  steps: PostShiftWizardStep[];
  activeStep: number;
  setActiveStep: React.Dispatch<React.SetStateAction<number>>;
  isMobile: boolean;
  isEmbedded: boolean;
  isEditing: boolean;
  slotsLength: number;
  showError: (message: string) => void;
  onSubmit: () => void | Promise<void>;
  submitting: boolean;
  children: React.ReactNode;
};

const StepConnectorStyled = styled(StepConnector)(({ theme }) => ({
  [`&.${stepConnectorClasses.alternativeLabel}`]: {
    top: 24,
  },
  [`& .${stepConnectorClasses.line}`]: {
    borderColor: theme.palette.grey[300],
    borderTopWidth: 2,
    borderRadius: 1,
  },
  [`&.${stepConnectorClasses.active} .${stepConnectorClasses.line}`]: {
    borderColor: theme.palette.primary.main,
  },
  [`&.${stepConnectorClasses.completed} .${stepConnectorClasses.line}`]: {
    borderColor: theme.palette.primary.main,
  },
}));

const StepIconRoot = styled('div')<{ ownerState: { active?: boolean; completed?: boolean } }>(
  ({ theme, ownerState }) => ({
    zIndex: 1,
    width: 44,
    height: 44,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: theme.transitions.create(['background-color', 'box-shadow', 'transform'], {
      duration: theme.transitions.duration.shorter,
    }),
    color: ownerState.active || ownerState.completed
      ? theme.palette.common.white
      : theme.palette.text.secondary,
    background: ownerState.completed || ownerState.active
      ? 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)'
      : theme.palette.grey[200],
    boxShadow: ownerState.active
      ? '0 12px 24px rgba(109, 40, 217, 0.25)'
      : '0 0 0 rgba(0,0,0,0)',
    transform: ownerState.active ? 'scale(1.05)' : 'scale(1)',
  }),
);

export default function PostShiftWizardShell({
  steps,
  activeStep,
  setActiveStep,
  isMobile,
  isEmbedded,
  isEditing,
  slotsLength,
  showError,
  onSubmit,
  submitting,
  children,
}: Props) {
  const StepIconComponent = (props: StepIconProps) => {
    const { active, completed, icon } = props;
    const stepIndex = Number(icon) - 1;
    const Icon = steps[stepIndex]?.icon ?? WorkIcon;
    return (
      <StepIconRoot ownerState={{ active, completed }}>
        <Icon fontSize="small" />
      </StepIconRoot>
    );
  };

  return (
    <>
      <Stepper
        activeStep={activeStep}
        alternativeLabel={!isMobile}
        orientation={isMobile ? 'vertical' : 'horizontal'}
        connector={<StepConnectorStyled />}
        sx={{
          mb: isEmbedded ? 1.5 : 3,
          px: isEmbedded ? { xs: 0, sm: 1 } : { xs: 1, sm: 4 },
          ...(isEmbedded && {
            '& .MuiStepLabel-label': { fontSize: '0.78rem' },
            '& .MuiStepIcon-root, & [class*="StepIconRoot"]': { transform: 'scale(0.9)' },
          }),
        }}
      >
        {steps.map((step, index) => (
          <Step key={step.label}>
            <StepLabel
              StepIconComponent={StepIconComponent}
              onClick={isEditing ? () => setActiveStep(index) : undefined}
              sx={isEditing ? { cursor: 'pointer' } : undefined}
            >
              <Typography
                variant="body2"
                fontWeight={activeStep === index ? 700 : 500}
                color={activeStep === index ? 'text.primary' : 'text.secondary'}
              >
                {step.label}
              </Typography>
            </StepLabel>
          </Step>
        ))}
      </Stepper>

      <Box sx={{ minHeight: isEmbedded ? 0 : 350, px: isEmbedded ? 0 : { xs: 0, md: 2.5 }, pt: isEmbedded ? 0 : 0.5 }}>
        {!isEmbedded && (
          <Typography variant="h5" fontWeight={500} gutterBottom>
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
        sx={{
          mt: isEmbedded ? 1.5 : 5,
          pt: isEmbedded ? 1.5 : 3,
          borderTop: '1px solid',
          borderColor: isEmbedded ? 'rgba(15, 23, 42, 0.08)' : '#eee',
        }}
      >
        <Button
          onClick={() => setActiveStep((previous) => previous - 1)}
          disabled={activeStep === 0}
          variant="text"
          sx={{ minWidth: 120 }}
        >
          Back
        </Button>
        {activeStep < steps.length - 1 ? (
          <Button
            onClick={() => {
              const nextStep = activeStep + 1;
              const currentKey = steps[activeStep]?.key;
              if (currentKey === 'timetable' && slotsLength === 0) {
                showError('Add at least one timetable entry before continuing.');
                return;
              }
              setActiveStep(nextStep);
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
