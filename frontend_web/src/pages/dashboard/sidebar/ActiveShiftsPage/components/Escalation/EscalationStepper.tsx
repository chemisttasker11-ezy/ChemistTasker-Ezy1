import React from 'react';
import { Box, Button, ButtonBase, CircularProgress, Stack, Typography } from '@mui/material';
import { ArrowRight, Lock, TrendingUp } from 'lucide-react';
import { Shift, EscalationLevelKey } from '@chemisttasker/shared-core';
import { AUDIENCE_LEVELS, type AudienceScope } from '../../utils/audience';
import { Hint, InfoHint, Pill, PlatformMark } from '../../../../shiftCenter/ShiftCentreParts';

interface EscalationStepperProps {
    shift: Shift;
    currentLevel: EscalationLevelKey;
    selectedLevel: EscalationLevelKey;
    onSelectLevel: (levelKey: EscalationLevelKey) => void;
    onEscalate: (shift: Shift, levelKey: EscalationLevelKey) => void;
    escalating?: boolean;
    labelOverrides?: Partial<Record<EscalationLevelKey, string>>;
    showPrivateFirst?: boolean;
}

type VisualStep = {
    key: string;
    label: string;
    reach: string;
    scope: AudienceScope;
    icon: React.ElementType;
    selectable: boolean;
    active: boolean;
    reached: boolean;
    current: boolean;
    onClick?: () => void;
};

export const EscalationStepper: React.FC<EscalationStepperProps> = ({
    shift,
    currentLevel,
    selectedLevel,
    onSelectLevel,
    onEscalate,
    escalating,
    labelOverrides,
    showPrivateFirst,
}) => {
    const allowedKeys = new Set((shift as any).allowedEscalationLevels || []);
    if (!allowedKeys.size) {
        AUDIENCE_LEVELS.forEach((level) => allowedKeys.add(level.key));
    }

    const levelSequence = AUDIENCE_LEVELS.filter((level) => allowedKeys.has(level.key));
    const resolveLabel = (key: EscalationLevelKey, fallback: string) =>
        labelOverrides?.[key] ?? fallback;
    const currentLevelIdx = Math.max(
        0,
        levelSequence.findIndex((level) => level.key === currentLevel)
    );
    const selectedLevelIdx = levelSequence.findIndex((level) => level.key === selectedLevel);
    const uiCurrentLevelIdx = showPrivateFirst ? -1 : currentLevelIdx;

    const visualSteps: VisualStep[] = [
        ...(showPrivateFirst
            ? [{
                key: 'DIRECT_PRIVATE',
                label: 'Direct / Private',
                reach: 'only the person you offered it to',
                scope: 'internal' as const,
                icon: Lock,
                selectable: false,
                active: false,
                reached: true,
                current: true,
            }]
            : []),
        ...levelSequence.map((level, idx) => ({
            key: level.key,
            label: resolveLabel(level.key, level.label),
            reach: level.reach,
            scope: level.scope,
            icon: level.icon,
            selectable: idx <= uiCurrentLevelIdx + 1 && allowedKeys.has(level.key),
            active: selectedLevel === level.key,
            reached: idx <= uiCurrentLevelIdx,
            current: idx === uiCurrentLevelIdx,
            onClick: () => onSelectLevel(level.key),
        })),
    ];

    const stepCount = visualSteps.length;
    const lastReachedIdx = visualSteps.reduce((acc, step, idx) => (step.reached ? idx : acc), 0);
    const internalCount = visualSteps.filter((step) => step.scope === 'internal').length;
    const platformCount = stepCount - internalCount;
    const currentStep = visualSteps[lastReachedIdx];

    const describe = (step: VisualStep) => {
        if (step.current) return `Visible now to ${step.reach}.`;
        if (step.reached) return `Already notified ${step.reach}. Select to see their responses.`;
        if (step.selectable) return `Next audience: ${step.reach}. Select to preview, then escalate.`;
        return `Opens after the earlier audiences: ${step.reach}.`;
    };

    return (
        <Box component="section" aria-label="Who can see this shift">
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mb: 2 }}>
                <Stack direction="row" spacing={0.75} alignItems="center">
                    <Typography component="h3" sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 17, color: 'var(--ct-text-primary)' }}>
                        Who can see this shift
                    </Typography>
                    <InfoHint
                        title="Audiences widen step by step"
                        body="A shift starts with your own people. Each escalation notifies the next, wider audience; earlier audiences keep seeing it."
                    />
                </Stack>
                {currentStep && (
                    <Pill
                        tone={currentStep.scope === 'platform' ? 'cyan' : 'violet'}
                        icon={currentStep.scope === 'platform' ? <PlatformMark size={15} /> : undefined}
                        label={`Now visible to ${currentStep.label}`}
                    />
                )}
            </Stack>

            {/* Group labels: internal network vs the public platform. */}
            <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${stepCount}, minmax(0, 1fr))`, columnGap: 1, mb: 1.25 }}>
                {internalCount > 0 && (
                    <Box sx={{ gridColumn: `1 / span ${internalCount}`, borderTop: '2px solid var(--ct-tone-violet-bg)', pt: 0.5, textAlign: 'center' }}>
                        <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ct-tone-violet-fg)' }}>
                            Your network
                        </Typography>
                    </Box>
                )}
                {platformCount > 0 && (
                    <Box sx={{ gridColumn: `${internalCount + 1} / span ${platformCount}`, borderTop: '2px solid var(--ct-tone-cyan-bg)', pt: 0.5, textAlign: 'center' }}>
                        <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ct-tone-cyan-fg)' }}>
                            Platform
                        </Typography>
                    </Box>
                )}
            </Box>

            <Box sx={{ position: 'relative' }}>
                {/* Track from the first to the last circle centre, filled up to the live audience. */}
                <Box
                    aria-hidden="true"
                    sx={{
                        position: 'absolute',
                        top: 21,
                        left: `calc(100% / ${stepCount * 2})`,
                        right: `calc(100% / ${stepCount * 2})`,
                        height: 2,
                        borderRadius: 2,
                        bgcolor: 'var(--ct-border-color)',
                    }}
                />
                <Box
                    aria-hidden="true"
                    sx={{
                        position: 'absolute',
                        top: 21,
                        left: `calc(100% / ${stepCount * 2})`,
                        width: `calc((100% - 100% / ${stepCount}) * ${stepCount > 1 ? lastReachedIdx / (stepCount - 1) : 0})`,
                        height: 2,
                        borderRadius: 2,
                        bgcolor: 'var(--ct-accent-strong)',
                        transition: 'width .3s ease',
                    }}
                />
                <Box sx={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${stepCount}, minmax(0, 1fr))`, columnGap: 1 }}>
                    {visualSteps.map((step) => {
                        const Icon = step.icon;
                        const isPlatform = step.scope === 'platform';
                        const circleSx = isPlatform
                            // The bottle keeps its own colours: white disc, ring shows the state.
                            ? {
                                bgcolor: 'var(--ct-surface-bg)',
                                border: step.reached ? '2px solid var(--ct-accent-strong)' : step.selectable ? '2px dashed var(--ct-accent-strong)' : '2px solid var(--ct-border-color)',
                            }
                            : step.reached
                            ? { bgcolor: 'var(--ct-accent-strong)', color: '#FFFFFF', border: '2px solid var(--ct-accent-strong)' }
                            : step.selectable
                                ? { bgcolor: 'var(--ct-surface-bg)', color: 'var(--ct-accent-strong)', border: '2px dashed var(--ct-accent-strong)' }
                                : { bgcolor: 'var(--ct-subtle-bg)', color: 'var(--ct-text-muted)', border: '2px solid var(--ct-border-color)' };
                        const caption = step.current ? 'Live now' : step.reached ? 'Notified' : step.selectable ? 'Next' : 'Later';
                        const content = (
                            <Stack alignItems="center" spacing={0.75} sx={{ width: '100%', minWidth: 0, py: 0.25 }}>
                                <Box
                                    sx={{
                                        width: 44,
                                        height: 44,
                                        borderRadius: '50%',
                                        display: 'grid',
                                        placeItems: 'center',
                                        boxShadow: step.active ? '0 0 0 4px var(--ct-tone-violet-bg)' : 'none',
                                        '& svg': { width: 20, height: 20, strokeWidth: 1.9 },
                                        ...circleSx,
                                    }}
                                >
                                    {isPlatform ? <PlatformMark size={28} muted={!step.reached} /> : <Icon />}
                                </Box>
                                <Typography
                                    sx={{
                                        fontSize: 13,
                                        fontWeight: step.active || step.current ? 600 : 500,
                                        color: step.reached || step.selectable ? 'var(--ct-text-primary)' : 'var(--ct-text-muted)',
                                        textAlign: 'center',
                                        lineHeight: 1.25,
                                        maxWidth: '100%',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {step.label}
                                </Typography>
                                <Typography
                                    sx={{
                                        fontSize: 11.5,
                                        fontWeight: 600,
                                        lineHeight: 1,
                                        color: step.current ? 'var(--ct-status-green-fg)' : step.active ? 'var(--ct-accent-strong)' : 'var(--ct-text-muted)',
                                        display: { xs: 'none', sm: 'block' },
                                    }}
                                >
                                    {step.active && !step.current ? 'Viewing' : caption}
                                </Typography>
                            </Stack>
                        );
                        return (
                            <Hint key={step.key} title={step.label} body={describe(step)}>
                                {step.selectable && step.onClick ? (
                                    <ButtonBase
                                        onClick={step.onClick}
                                        aria-pressed={step.active}
                                        aria-label={`${step.label}. ${describe(step)}`}
                                        sx={{ borderRadius: '14px', width: '100%', minWidth: 0, '&.Mui-focusVisible': { outline: '2px solid var(--ct-accent-strong)', outlineOffset: 2 } }}
                                    >
                                        {content}
                                    </ButtonBase>
                                ) : (
                                    <Box tabIndex={0} aria-label={`${step.label}. ${describe(step)}`} sx={{ width: '100%', minWidth: 0, borderRadius: '14px', '&:focus-visible': { outline: '2px solid var(--ct-accent-strong)', outlineOffset: 2 } }}>
                                        {content}
                                    </Box>
                                )}
                            </Hint>
                        );
                    })}
                </Box>
            </Box>

            {(() => {
                const canEscalateToSelected =
                    selectedLevelIdx > uiCurrentLevelIdx &&
                    selectedLevelIdx !== -1 &&
                    allowedKeys.has(levelSequence[selectedLevelIdx]?.key);

                const renderBanner = (target: (typeof levelSequence)[number] | undefined, onClick?: () => void, loading = false) => {
                    const targetLabel = target ? resolveLabel(target.key, target.label) : '';
                    return (
                        <Box
                            role={loading ? 'status' : undefined}
                            sx={{
                                mt: 2.5,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 2,
                                p: { xs: 1.75, sm: 2 },
                                borderRadius: '16px',
                                border: '1px solid var(--ct-tone-violet-bg)',
                                bgcolor: 'var(--ct-tone-violet-bg)',
                                flexWrap: 'wrap',
                            }}
                        >
                            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0, flex: '1 1 320px' }}>
                                <Box sx={{ width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', color: '#FFFFFF', flexShrink: 0, background: 'linear-gradient(135deg, #A3008F 0%, #5222B8 100%)', '& svg': { width: 20, height: 20 } }}>
                                    {loading ? <CircularProgress size={20} color="inherit" /> : <TrendingUp />}
                                </Box>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'var(--ct-text-primary)' }}>
                                        {loading ? `Escalating${targetLabel ? ` to ${targetLabel}` : ''}…` : 'Need more candidates?'}
                                    </Typography>
                                    <Typography sx={{ fontSize: 13, color: 'var(--ct-text-secondary)', lineHeight: 1.45 }}>
                                        {target
                                            ? `${loading ? 'Notifying' : 'Escalating notifies'} ${target.reach}.`
                                            : 'Notifying the next audience.'}
                                    </Typography>
                                </Box>
                            </Stack>
                            {!loading && onClick && (
                                <Button
                                    variant="contained"
                                    onClick={onClick}
                                    endIcon={<ArrowRight />}
                                    sx={{ width: { xs: '100%', sm: 'auto' }, bgcolor: 'var(--ct-accent-strong)', '&:hover': { bgcolor: '#2E1288' }, '& .MuiButton-endIcon svg': { width: 16, height: 16 } }}
                                >
                                    Escalate to {targetLabel}
                                </Button>
                            )}
                        </Box>
                    );
                };

                if (escalating) {
                    const target = canEscalateToSelected ? levelSequence[selectedLevelIdx] : levelSequence[currentLevelIdx + 1];
                    return renderBanner(target, undefined, true);
                }

                if (canEscalateToSelected) {
                    const targetLevel = levelSequence[selectedLevelIdx];
                    return renderBanner(targetLevel, () => onEscalate(shift, targetLevel.key));
                }

                const nextLevel = levelSequence[currentLevelIdx + 1];
                if (nextLevel && allowedKeys.has(nextLevel.key)) {
                    return renderBanner(nextLevel, () => onEscalate(shift, nextLevel.key));
                }

                return null;
            })()}
        </Box>
    );
};
