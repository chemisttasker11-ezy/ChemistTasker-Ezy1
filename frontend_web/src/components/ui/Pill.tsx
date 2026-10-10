import type { ReactNode } from 'react';
import { Box } from '@mui/material';
import { toneColors, type StatusTone } from './tone';

const iconSize = (size: number) => ({ '& svg': { width: size, height: size, flexShrink: 0, strokeWidth: 2 } });

/** Short label on a tinted background (role, status, source). */
export function Pill({ label, tone = 'neutral', icon, outlined = false, title }: {
    label: ReactNode;
    tone?: StatusTone;
    icon?: ReactNode;
    outlined?: boolean;
    title?: string;
}) {
    const { bg, fg } = toneColors(tone);
    return (
        <Box
            component="span"
            title={title}
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                minHeight: 24,
                px: 1,
                borderRadius: '999px',
                fontSize: 12,
                fontWeight: 600,
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: outlined ? 'var(--ct-text-primary)' : fg,
                bgcolor: outlined ? 'transparent' : bg,
                border: outlined ? '1px solid var(--ct-border-color)' : '1px solid transparent',
                ...iconSize(13),
            }}
        >
            {icon}
            {label}
        </Box>
    );
}

export function CountBadge({ value, tone = 'violet', label }: { value: number; tone?: StatusTone; label?: string }) {
    const { bg, fg } = toneColors(tone);
    return (
        <Box
            component="span"
            aria-label={label}
            sx={{
                minWidth: 24,
                height: 24,
                px: 0.75,
                borderRadius: '999px',
                display: 'inline-grid',
                placeItems: 'center',
                fontSize: 12,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                color: fg,
                bgcolor: bg,
            }}
        >
            {value}
        </Box>
    );
}
