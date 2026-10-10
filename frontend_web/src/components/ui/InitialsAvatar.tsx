import { Box } from '@mui/material';
import { EyeOff } from 'lucide-react';
import { toneColors, type StatusTone } from './tone';

const iconSize = (size: number) => ({ '& svg': { width: size, height: size, flexShrink: 0, strokeWidth: 2 } });

const initialsOf = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || '?';

export function InitialsAvatar({ name, tone = 'violet', anonymous = false, size = 34 }: {
    name: string;
    tone?: StatusTone;
    anonymous?: boolean;
    size?: number;
}) {
    const { bg, fg } = toneColors(anonymous ? 'neutral' : tone);
    return (
        <Box
            component="span"
            aria-hidden="true"
            sx={{
                width: size,
                height: size,
                flex: `0 0 ${size}px`,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                fontSize: size * 0.36,
                fontWeight: 600,
                color: fg,
                bgcolor: bg,
                ...iconSize(size * 0.45),
            }}
        >
            {anonymous ? <EyeOff /> : initialsOf(name)}
        </Box>
    );
}
