/** Tinted colour pairs for pills, badges and avatars. Theme variables keep light/dark and contrast in one place. */

export type StatusTone = 'violet' | 'blue' | 'cyan' | 'magenta' | 'green' | 'amber' | 'red' | 'neutral' | 'navy';

export const toneColors = (tone: StatusTone): { bg: string; fg: string } => {
    switch (tone) {
        case 'green':
        case 'amber':
        case 'red':
            return { bg: `var(--ct-status-${tone}-bg)`, fg: `var(--ct-status-${tone}-fg)` };
        case 'neutral':
            return { bg: 'var(--ct-subtle-bg)', fg: 'var(--ct-text-secondary)' };
        case 'navy':
            return { bg: '#06214A', fg: '#FFFFFF' };
        default:
            return { bg: `var(--ct-tone-${tone}-bg)`, fg: `var(--ct-tone-${tone}-fg)` };
    }
};
