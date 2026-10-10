import type { ReactElement, ReactNode } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { Info } from 'lucide-react';

const iconSize = (size: number) => ({ '& svg': { width: size, height: size, flexShrink: 0, strokeWidth: 2 } });

/** Hover / focus explanation: a bold line and a sentence of context. */
export function Hint({ title, body, children }: { title: string; body?: ReactNode; children: ReactElement }) {
    return (
        <Tooltip
            arrow
            enterDelay={150}
            title={
                <Box sx={{ p: 0.25, maxWidth: 260 }}>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'inherit', lineHeight: 1.35 }}>{title}</Typography>
                    {body && <Typography sx={{ fontSize: 12, color: 'inherit', opacity: 0.86, lineHeight: 1.45, mt: 0.35 }}>{body}</Typography>}
                </Box>
            }
        >
            {children}
        </Tooltip>
    );
}

/** Small "i" that explains a heading on hover or keyboard focus. */
export function InfoHint({ title, body }: { title: string; body?: ReactNode }) {
    return (
        <Hint title={title} body={body}>
            <Box
                component="span"
                tabIndex={0}
                role="img"
                aria-label={`${title}${typeof body === 'string' ? `. ${body}` : ''}`}
                sx={{
                    display: 'inline-grid',
                    placeItems: 'center',
                    color: 'var(--ct-text-muted)',
                    cursor: 'help',
                    borderRadius: '50%',
                    '&:hover, &:focus-visible': { color: 'var(--ct-accent-strong)' },
                    '&:focus-visible': { outline: '2px solid var(--ct-accent-strong)', outlineOffset: 2 },
                    ...iconSize(15),
                }}
            >
                <Info />
            </Box>
        </Hint>
    );
}
