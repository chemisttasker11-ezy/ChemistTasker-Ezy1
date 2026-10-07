import { Box, Button, ButtonBase, CircularProgress, Stack, Typography, alpha } from '@mui/material';
import { CheckRounded, GroupsOutlined, PublicOutlined, TrendingUpRounded } from '@mui/icons-material';
import { getShiftEscalation, type Shift, type EscalationLevelKey } from '@chemisttasker/shared-core';

interface EscalationStepperProps {
  shift: Shift;
  currentLevel: EscalationLevelKey;
  selectedLevel: EscalationLevelKey;
  onSelectLevel: (level: EscalationLevelKey) => void;
  onEscalate: (shift: Shift, level: EscalationLevelKey) => void;
  escalating?: boolean;
  labelOverrides?: Partial<Record<EscalationLevelKey, string>>;
  showPrivateFirst?: boolean;
}

export function EscalationStepper({ shift, currentLevel, selectedLevel, onSelectLevel, onEscalate, escalating, labelOverrides, showPrivateFirst }: EscalationStepperProps) {
  const progress = getShiftEscalation({ ...shift, visibility: currentLevel });
  const next = showPrivateFirst ? progress.stages[0] : progress.next;
  const current = showPrivateFirst ? 'Direct / private offer' : progress.current?.label ?? 'Audience unavailable';
  return <Box component="section" aria-label="Escalation and audience" sx={{ minWidth: 0 }}>
    <Typography component="h3" variant="h6" fontWeight={700}>Who can see this post?</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
      Current audience: {current}. Select a reached level to review responses.
    </Typography>
    <Box component="ol" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: `repeat(${progress.stages.length || 1}, minmax(0, 1fr))` }, gap: 1, listStyle: 'none', p: 0, m: 0 }}>
      {progress.stages.map((stage) => {
        const reached = !showPrivateFirst && progress.reached.some((item) => item.key === stage.key);
        const selected = reached && selectedLevel === stage.key;
        const isCurrent = !showPrivateFirst && currentLevel === stage.key;
        return <Box component="li" key={stage.key}>
          <ButtonBase onClick={() => onSelectLevel(stage.key)} disabled={!reached || escalating}
            aria-pressed={selected} aria-current={isCurrent ? 'step' : undefined}
            aria-label={`Level ${stage.level}: ${labelOverrides?.[stage.key] ?? stage.label}${isCurrent ? ', current audience' : reached ? ', reached' : ', not reached'}`}
            sx={{ width: '100%', minHeight: { xs: 60, sm: 100 }, p: 1.5, border: '1px solid', borderColor: selected ? 'primary.main' : 'divider', borderRadius: 2,
              display: 'flex', flexDirection: { xs: 'row', sm: 'column' }, gap: 1, justifyContent: { xs: 'flex-start', sm: 'center' },
              bgcolor: (theme) => selected ? alpha(theme.palette.primary.main, 0.07) : theme.palette.background.paper,
              '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              '&:hover': { bgcolor: 'action.hover' }, '&.Mui-disabled': { opacity: 1 } }}>
            <Box sx={{ display: 'grid', placeItems: 'center', width: 28, height: 28, flexShrink: 0, borderRadius: '50%',
              bgcolor: reached ? stage.color : 'action.hover', color: reached ? '#fff' : 'text.secondary', fontSize: 13, fontWeight: 700 }}>
              {reached && !isCurrent ? <CheckRounded fontSize="small" /> : stage.level}
            </Box>
            <Box sx={{ textAlign: { xs: 'left', sm: 'center' }, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={selected ? 700 : 500} color="text.primary">{labelOverrides?.[stage.key] ?? stage.label}</Typography>
              <Typography variant="caption" color="text.secondary">{isCurrent ? 'Current' : reached ? 'Reached' : 'Not reached'}</Typography>
            </Box>
          </ButtonBase>
        </Box>;
      })}
    </Box>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} justifyContent="space-between"
      sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        {next ? <GroupsOutlined color="primary" /> : <PublicOutlined color="info" />}
        <Box>
          <Typography variant="body2" fontWeight={600}>{next ? `Next audience: ${next.label}` : 'Your post has reached its widest audience'}</Typography>
          <Typography variant="body2" color="text.secondary">{next ? 'Widen the search when you need more candidates.' : 'Review responses below and select a candidate.'}</Typography>
        </Box>
      </Stack>
      {next && <Button variant="outlined" disabled={escalating} onClick={() => onEscalate(shift, next.key)}
        startIcon={escalating ? <CircularProgress size={16} /> : <TrendingUpRounded />} sx={{ minHeight: 44, flexShrink: 0 }}>
        {escalating ? 'Widening audience…' : `Escalate to ${next.label}`}
      </Button>}
    </Stack>
  </Box>;
}
