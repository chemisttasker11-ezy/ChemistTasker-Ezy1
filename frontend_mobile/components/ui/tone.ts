import { colors } from '@/constants/tokens';

/** The four tinted tones of the dashboard system (tiles, avatars, selected tabs). */
export type Tone = 'violet' | 'blue' | 'cyan' | 'magenta';

/** Tones for pills, badges and avatars: the four tile tones plus status and neutral fills. */
export type StatusTone = Tone | 'green' | 'amber' | 'red' | 'neutral' | 'navy';

/**
 * A palette colour at `opacity` (multiplied with any alpha it already has), for glass and glow layers.
 * Takes `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`, `rgb()` and `rgba()`; anything else throws.
 */
export const alpha = (color: string, opacity: number) => {
  let rgba: number[];
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color)?.[1];
  const fn = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(color);
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    const bytes = full.match(/../g)!.map((b) => parseInt(b, 16));
    rgba = [bytes[0], bytes[1], bytes[2], bytes.length === 4 ? bytes[3] / 255 : 1];
  } else if (fn) {
    rgba = [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])];
  } else {
    throw new Error(`alpha(): unsupported colour "${color}"`);
  }
  const a = Math.round(rgba[3] * opacity * 1000) / 1000;
  return `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${a})`;
};

export const toneVars =(tone: Tone): { bg: string; fg: string } => colors.tone[tone];

export const toneColors = (tone: StatusTone): { bg: string; fg: string } => {
  switch (tone) {
    case 'green':
    case 'amber':
    case 'red':
      return { bg: colors.status[tone].bg, fg: colors.status[tone].fg };
    case 'neutral':
      return { bg: colors.subtleBg, fg: colors.textSecondary };
    case 'navy':
      return { bg: colors.brandNavy, fg: colors.surfaceBg };
    default:
      return colors.tone[tone];
  }
};
