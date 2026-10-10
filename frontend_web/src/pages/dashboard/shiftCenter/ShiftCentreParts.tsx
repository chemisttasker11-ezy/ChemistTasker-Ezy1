import type { ReactNode } from 'react';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import type { ButtonProps } from '@mui/material';
import { keyframes } from '@mui/system';
import { BellRing, Star } from 'lucide-react';
import { toneColors, type StatusTone } from '../../../components/ui/tone';
import { CountBadge } from '../../../components/ui/Pill';
import { InitialsAvatar } from '../../../components/ui/InitialsAvatar';
import { Hint, InfoHint } from '../../../components/ui/Hint';

/** Shift Centre building blocks (candidate rows, columns, sources, row actions). Generic pills, avatars, hints and
 * tones live in components/ui. */

const pulse = keyframes`
    0% { box-shadow: 0 0 0 0 rgba(163, 0, 143, 0.45); }
    70% { box-shadow: 0 0 0 6px rgba(163, 0, 143, 0); }
    100% { box-shadow: 0 0 0 0 rgba(163, 0, 143, 0); }
`;

const iconSize = (size: number) => ({ '& svg': { width: size, height: size, flexShrink: 0, strokeWidth: 2 } });

export const NEW_ACTIVITY_HINT =
    'Someone showed interest, sent an offer or replied since you last opened this date. Select the date to review it and clear the marker.';

/** Replaces the unexplained red dot: a labelled marker with an explanation on hover. */
export function NewActivityBadge({ label = 'New activity', hint = NEW_ACTIVITY_HINT, focusable = true }: { label?: string; hint?: string; focusable?: boolean }) {
    const { bg, fg } = toneColors('magenta');
    return (
        <Hint title="New candidate activity" body={hint}>
            <Box
                component="span"
                tabIndex={focusable ? 0 : undefined}
                aria-label={focusable ? `${label}. ${hint}` : undefined}
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.6,
                    minHeight: 22,
                    px: 0.9,
                    borderRadius: '999px',
                    fontSize: 11.5,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    color: fg,
                    bgcolor: bg,
                    cursor: 'help',
                    '&:focus-visible': { outline: '2px solid var(--ct-accent-strong)', outlineOffset: 2 },
                }}
            >
                <Box
                    component="span"
                    sx={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        bgcolor: 'currentColor',
                        animation: `${pulse} 2s ease-out infinite`,
                        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                    }}
                />
                {label}
            </Box>
        </Hint>
    );
}

type ActionKind = 'primary' | 'secondary' | 'buzz';

/** Compact action used inside candidate rows. */
export function RowAction({ kind = 'secondary', loading = false, children, ...props }: Omit<ButtonProps, 'variant' | 'color'> & {
    kind?: ActionKind;
    loading?: boolean;
}) {
    const amber = toneColors('amber');
    const sx =
        kind === 'primary'
            // Same fill as contained buttons: --ct-accent-strong is a light text violet in dark mode (white on it is 2.2:1).
            ? { bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } }
            : kind === 'buzz'
                ? { bgcolor: amber.bg, color: amber.fg, border: '1px solid transparent', '&:hover': { bgcolor: amber.bg, borderColor: amber.fg } }
                : { bgcolor: 'var(--ct-surface-bg)', color: 'var(--ct-text-primary)', border: '1px solid var(--ct-border-color)', '&:hover': { borderColor: 'var(--ct-accent-strong)', bgcolor: 'var(--ct-surface-bg)' } };
    return (
        <Button
            size="small"
            color="inherit"
            disableElevation
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : kind === 'buzz' ? <BellRing /> : undefined}
            {...props}
            sx={{
                minHeight: 32,
                minWidth: 0,
                px: 1.5,
                borderRadius: '10px',
                fontSize: 12.5,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                '& .MuiButton-startIcon': { mr: 0.5, '& svg': { width: 14, height: 14 } },
                '&.Mui-disabled': { opacity: 0.6, color: 'inherit' },
                ...sx,
            }}
        >
            {children}
        </Button>
    );
}

/** One person in a candidate column: who, from where, what state, what you can do. */
export function CandidateRow({ name, meta, rating, pills, actions, tone = 'violet', anonymous = false }: {
    name: string;
    meta?: ReactNode;
    rating?: number | null;
    pills?: ReactNode;
    actions?: ReactNode;
    tone?: StatusTone;
    anonymous?: boolean;
}) {
    return (
        <Box
            sx={{
                p: 1.25,
                borderRadius: '12px',
                border: '1px solid var(--ct-border-color)',
                bgcolor: 'var(--ct-surface-bg)',
                minWidth: 0,
            }}
        >
            <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ minWidth: 0 }}>
                <InitialsAvatar name={name} tone={tone} anonymous={anonymous} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ minWidth: 0 }}>
                        <Typography
                            title={name}
                            sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ct-text-primary)', lineHeight: 1.3, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                            {name}
                        </Typography>
                        {rating ? (
                            <Box
                                component="span"
                                aria-label={`Rated ${rating.toFixed(1)} out of 5`}
                                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.35, fontSize: 12, fontWeight: 600, color: 'var(--ct-status-amber-fg)', flexShrink: 0, '& svg': { width: 13, height: 13, fill: 'currentColor' } }}
                            >
                                <Star />
                                {rating.toFixed(1)}
                            </Box>
                        ) : null}
                    </Stack>
                    {meta && (
                        <Typography sx={{ fontSize: 12, color: 'var(--ct-text-secondary)', lineHeight: 1.4, mt: 0.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {meta}
                        </Typography>
                    )}
                    {pills && <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>{pills}</Stack>}
                    {actions && <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>{actions}</Stack>}
                </Box>
            </Stack>
        </Box>
    );
}

/** A status column (Interested, Assigned, ...): tinted header, explanation, scrolling list or empty note. */
export function CandidateColumn({ title, helper, tone, icon, count, emptyText, children }: {
    title: string;
    helper: string;
    tone: StatusTone;
    icon: ReactNode;
    count: number;
    emptyText: string;
    children?: ReactNode;
}) {
    const { bg, fg } = toneColors(tone);
    return (
        <Box
            component="section"
            aria-label={`${title}: ${count}`}
            sx={{
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                borderRadius: '16px',
                border: '1px solid var(--ct-border-color)',
                bgcolor: 'var(--ct-subtle-bg)',
                overflow: 'hidden',
            }}
        >
            <Stack direction="row" spacing={1.25} alignItems="center" sx={{ px: 1.5, py: 1.25, bgcolor: bg }}>
                <Box component="span" aria-hidden="true" sx={{ width: 30, height: 30, borderRadius: '9px', display: 'grid', placeItems: 'center', bgcolor: 'var(--ct-surface-bg)', color: fg, flexShrink: 0, ...iconSize(16) }}>
                    {icon}
                </Box>
                <Typography component="h4" sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: fg, lineHeight: 1.25 }}>
                    {title}
                </Typography>
                <Box component="span" sx={{ minWidth: 24, height: 24, px: 0.75, borderRadius: '999px', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600, bgcolor: 'var(--ct-surface-bg)', color: fg }}>
                    {count}
                </Box>
            </Stack>
            <Typography sx={{ px: 1.5, pt: 1, fontSize: 12, color: 'var(--ct-text-secondary)', lineHeight: 1.4 }}>{helper}</Typography>
            <Box sx={{ p: 1.25, pt: 1, flex: 1, minHeight: 0 }}>
                {count > 0 ? (
                    <Stack spacing={1} sx={{ maxHeight: 340, overflowY: 'auto', pr: 0.25, scrollbarWidth: 'thin' }}>
                        {children}
                    </Stack>
                ) : (
                    <Box sx={{ py: 2.5, px: 1, textAlign: 'center', border: '1px dashed var(--ct-border-color)', borderRadius: '12px' }}>
                        <Typography sx={{ fontSize: 12.5, color: 'var(--ct-text-muted)', lineHeight: 1.45 }}>{emptyText}</Typography>
                    </Box>
                )}
            </Box>
        </Box>
    );
}

/** Groups candidates by where they came from: your own network or the public platform. */
export function SourceSection({ title, subtitle, tone, icon, count, hint, children }: {
    title: string;
    subtitle: string;
    tone: StatusTone;
    icon: ReactNode;
    count: number;
    hint?: { title: string; body: string };
    children: ReactNode;
}) {
    const { bg, fg } = toneColors(tone);
    return (
        <Box component="section" aria-label={title} sx={{ minWidth: 0, containerType: 'inline-size' }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5, minWidth: 0 }}>
                <Box component="span" aria-hidden="true" sx={{ width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: bg, color: fg, flexShrink: 0, ...iconSize(20) }}>
                    {icon}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                        <Typography component="h3" sx={{ fontFamily: 'var(--ct-font-display)', fontWeight: 500, fontSize: 17, color: 'var(--ct-text-primary)', lineHeight: 1.25 }}>
                            {title}
                        </Typography>
                        <CountBadge value={count} tone={tone} label={`${count} people`} />
                        {hint && <InfoHint title={hint.title} body={hint.body} />}
                    </Stack>
                    <Typography sx={{ fontSize: 13, color: 'var(--ct-text-secondary)', lineHeight: 1.45 }}>{subtitle}</Typography>
                </Box>
            </Stack>
            {children}
        </Box>
    );
}

const PLATFORM_MARK_SRC = '/images/ChatGPT Image Jan 18, 2026, 08_14_43 PM.png';

/** The ChemistTasker bottle: marks anything that comes from, or goes out to, the public platform. */
export function PlatformMark({ size = 20, muted = false }: { size?: number; muted?: boolean }) {
    return (
        <Box
            component="img"
            src={PLATFORM_MARK_SRC}
            alt=""
            aria-hidden="true"
            sx={{
                width: size,
                height: size,
                objectFit: 'contain',
                flexShrink: 0,
                filter: muted ? 'grayscale(1)' : 'none',
                opacity: muted ? 0.5 : 1,
            }}
        />
    );
}
