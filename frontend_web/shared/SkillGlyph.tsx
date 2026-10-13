import { useId, type CSSProperties, type ReactNode } from 'react';
import {
  Award, Backpack, Earth, GraduationCap, IdCard,
  Armchair, Bandage, BriefcaseMedical, CalendarClock, CalendarPlus, CircleHelp, ClipboardCheck, Clock3, Coffee, ClipboardPenLine, ClipboardPlus, Droplet, Files, GlassWater, Hand, HeartHandshake, HeartPulse, Hospital, HousePlus, ListChecks, LockKeyhole, MessagesSquare, Monitor, MonitorCog, PillBottle, Plane, QrCode, ReceiptText, ScanEye, ShelvingUnit, ShieldUser, ShoppingCart, SoapDispenserDroplet, Stethoscope, Store, Syringe, TabletSmartphone, Tablets, TestTubeDiagonal, ThermometerSnowflake, Truck, UsersRound, Venus,
  type LucideIcon,
} from 'lucide-react';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import { findSkill } from '@chemisttasker/shared-core';
import { SoftwareMark, hasSoftwareMark } from './SoftwareLogo';

const icons: Record<string, LucideIcon> = {
  // Verification badge subjects (shared/VerificationBadges.tsx).
  Award, Backpack, Earth, GraduationCap, IdCard,
  Armchair, Bandage, BriefcaseMedical, CalendarClock, CalendarPlus, CircleHelp, ClipboardCheck, Clock3, Coffee, ClipboardPenLine, ClipboardPlus, Droplet, Files, GlassWater, Hand, HeartHandshake, HeartPulse, Hospital, HousePlus, ListChecks, LockKeyhole, MessagesSquare, Monitor, MonitorCog, PillBottle, Plane, QrCode, ReceiptText, ScanEye, ShelvingUnit, ShieldUser, ShoppingCart, SoapDispenserDroplet, Stethoscope, Store, Syringe, TabletSmartphone, Tablets, TestTubeDiagonal, ThermometerSnowflake, Truck, UsersRound, Venus,
};

/** Brand colours only: violet #5222B8, cyan #00BDD2, magenta #D600C8, blue #008DDB. */
export type SkillTone = 'violet' | 'cyan' | 'magenta' | 'blue';
const TONES: SkillTone[] = ['violet', 'cyan', 'magenta', 'blue'];
const GROUP_TONE: Record<string, SkillTone> = {
  'Dispensing & Medicines': 'violet',
  'Clinical Services': 'cyan',
  'Operations & Retail': 'magenta',
  'Software & Digital': 'blue',
};
/** The group keeps its colour, so a category still reads at a glance. */
export const skillTone = (group?: string): SkillTone | undefined => (group ? GROUP_TONE[group] : undefined);
/** A second brand colour per skill (never the group's), so neighbouring symbols differ. */
export const skillAccentTone = (code: string, tone?: SkillTone): SkillTone | undefined => {
  if (!tone) return undefined;
  const others = TONES.filter(t => t !== tone);
  let hash = 0;
  for (const char of code) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return others[hash % others.length];
};

// Theme variables (sleekTheme) with the brand light values as fallbacks for surfaces without them (Next).
const FALLBACK: Record<SkillTone, [fill: string, arc: string]> = {
  violet: ['#CBBBF6', '#8B6CF0'],
  cyan: ['#A3E9F0', '#22B8C9'],
  magenta: ['#F5BDEF', '#D63BC4'],
  blue: ['#A9D6F5', '#3F9BE8'],
};
const ink = 'var(--ct-skill-ink, #06214A)';
const fillOf = (tone: SkillTone) => `var(--ct-skill-${tone}-fill, ${FALLBACK[tone][0]})`;
const arcOf = (tone: SkillTone) => `var(--ct-skill-${tone}-arc, ${FALLBACK[tone][1]})`;

// Thin, constant linework (screen px) like the reference spot icons; the colour carries the weight.
const strokePx = (size: number) => (size <= 20 ? 1.5 : size <= 32 ? 1.75 : 2);
const lineOf = (sw: number) => ({ fill: 'none', stroke: 'currentColor', strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

/** Fill shapes for Lucide glyphs drawn only from open lines; closed Lucide shapes fill themselves. */
const EXTRA_FILL: Record<string, ReactNode> = {
  ListChecks: <><rect x="2.5" y="4" width="7" height="6" rx="2" /><rect x="2.5" y="14" width="7" height="6" rx="2" /></>,
  Citrus: <path d="M14 10 8.35 4.34A8 8 0 0 0 19.65 15.66Z" />,
  Hand: <path d="M6 10.5h12V15a7 7 0 0 1-7 7h-.5A5.5 5.5 0 0 1 5 16.5Z" />,
  Syringe: <path d="M15 5 19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4Z" />,
  ShelvingUnit: <><path d="M8 12V9a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3Z" /><path d="M12 20v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3Z" /></>,
};


// Cannabis: a palmate leaf of seven serrate leaflets on a short stem (not a tree leaf).
const LEAFLETS: [angle: number, length: number][] = [[0, 14.5], [-36, 12], [36, 12], [-70, 9], [70, 9], [-104, 5.5], [104, 5.5]];
const leaflet = (length: number) => { const w = 0.95 + length * 0.12; return `M12 17C${12 - w} ${17 - length * 0.4} ${12 - w * 0.55} ${17 - length * 0.85} 12 ${17 - length}C${12 + w * 0.55} ${17 - length * 0.85} ${12 + w} ${17 - length * 0.4} 12 17Z`; };

type Custom = { line: ReturnType<typeof lineOf>; fills: boolean; small: boolean; maskId: string; checked?: boolean };

/** Custom glyphs follow Lucide's grid and stroke; `fills` draws only their colour shapes. */
const CUSTOM: Record<string, (c: Custom) => ReactNode> = {
  BLISTER_PACK: c => <Blister {...c} />,
  BLISTER_CHECK: c => <Blister {...c} checked />,
  ROBOT_ARM: ({ line, fills }) => fills
    ? <><path d="M6 21.25v-2.5a2.5 2.5 0 0 1 5 0v2.5Z" /><circle cx="8.5" cy="11" r="1.6" /><circle cx="16" cy="6" r="1.6" /></>
    : <>
      <path d="M3.5 21.25h11" {...line} />
      <path d="M6 21.25v-2.5a2.5 2.5 0 0 1 5 0v2.5" {...line} />
      <path d="M8.5 16.25V12.6" {...line} />
      <circle cx="8.5" cy="11" r="1.6" {...line} />
      <path d="m9.9 10.1 4.6-3.2" {...line} />
      <circle cx="16" cy="6" r="1.6" {...line} />
      <path d="m17 7.3 2 3.6" {...line} />
      <path d="M17.25 11.25h3.5M17.25 11.25v2.25M20.75 11.25v2.25" {...line} />
    </>,
  CANNABIS_LEAF: ({ line, fills }) => <>
    {LEAFLETS.map(([angle, length]) => <path key={angle} d={leaflet(length)} transform={`rotate(${angle} 12 17)`} {...(fills ? {} : line)} />)}
    {!fills && <path d="M12 17v4.5" {...line} />}
  </>,
  // Vitamins: a supplement capsule lettered VIT (stroked letters keep one line weight with the family).
  VITAMIN_CAPSULE: ({ line, fills }) => fills
    ? <path d="M12 6.5H6.75a5.5 5.5 0 0 0 0 11H12Z" />
    : <>
      <rect x="1.25" y="6.5" width="21.5" height="11" rx="5.5" {...line} />
      <path d="m7 10 1.5 4 1.5-4" {...line} />
      <path d="M12.25 10v4" {...line} />
      <path d="M14.5 10h3M16 10v4" {...line} />
    </>,
  // Stock control: three taped cartons stacked, so it reads as shipped stock rather than blocks.
  STOCK_CARTONS: ({ line, fills }) => fills
    ? <><rect x="2.5" y="13" width="9" height="8" rx="1" /><rect x="12.5" y="13" width="9" height="8" rx="1" /><rect x="7.5" y="4" width="9" height="8" rx="1" /></>
    : <>
      <rect x="2.5" y="13" width="9" height="8" rx="1" {...line} />
      <rect x="12.5" y="13" width="9" height="8" rx="1" {...line} />
      <rect x="7.5" y="4" width="9" height="8" rx="1" {...line} />
      <path d="M7 13v3.5M17 13v3.5M12 4v3.5" {...line} />
    </>,
  MORTAR_PESTLE: ({ line, fills }) => fills
    ? <path d="M4.3 11.5a7.7 7.7 0 0 0 15.4 0Z" />
    : <>
      <path d="M12.4 11.2 18.3 4.3a1.8 1.8 0 1 1 2.7 2.4l-5.6 4.5" {...line} />
      <path d="M3 11.5h18" {...line} />
      <path d="M4.3 11.5a7.7 7.7 0 0 0 15.4 0" {...line} />
      <path d="m9.2 19-.7 2.25h7l-.7-2.25" {...line} />
    </>,
  POS_TERMINAL: ({ line, fills }) => fills
    ? <><rect x="2.75" y="3" width="12.5" height="8.75" rx="1.5" /><rect x="17.25" y="9.75" width="4.25" height="7.75" rx="1.1" /></>
    : <>
      <rect x="2.75" y="3" width="12.5" height="8.75" rx="1.5" {...line} />
      <path d="M5.75 7.4h6.5" {...line} />
      <path d="M9 11.75v2.5" {...line} />
      <path d="M4 14.25h10a1 1 0 0 1 1 1V21H3v-5.75a1 1 0 0 1 1-1z" {...line} />
      <path d="M6 17.6h1.5M9.75 17.6h1.5" {...line} />
      <rect x="17.25" y="9.75" width="4.25" height="7.75" rx="1.1" {...line} />
      <path d="M18.6 12.4h1.6" {...line} />
    </>,
};

function Blister({ line, fills, small, maskId, checked }: Custom) {
  // Seven days x four doses at full size; a 4 x 3 tray stays legible in 16-20px badges.
  if (fills) return <>
    <rect x="3" y="1.75" width="16" height="19.5" rx="2" />
    {checked && <circle cx="18.5" cy="18.5" r="5" />}
  </>;
  const rows = small ? 4 : 7;
  const cols = small ? 3 : 4;
  const cellW = small ? 3.4 : 2.6;
  const cellH = small ? 2.6 : 1.5;
  const gapX = (14 - cols * cellW) / (cols + 1);
  const gapY = (17.5 - rows * cellH) / (rows + 1);
  return <>
    {checked && <defs><mask id={maskId}>
      <rect width="24" height="24" fill="white" />
      <circle cx="18.5" cy="18.5" r="5.9" fill="black" />
    </mask></defs>}
    <g mask={checked ? `url(#${maskId})` : undefined}>
      <rect x="3" y="1.75" width="16" height="19.5" rx="2" {...line} />
      {Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => (
        <rect key={`${row}-${col}`} x={4 + gapX + col * (cellW + gapX)} y={2.75 + gapY + row * (cellH + gapY)}
          width={cellW} height={cellH} rx={cellH / 2} fill="currentColor" />
      )))}
    </g>
    {checked && <>
      <circle cx="18.5" cy="18.5" r="5" {...line} />
      <path d="m16 18.6 1.7 1.7 3.3-3.4" {...line} />
    </>}
  </>;
}

/**
 * Pharmacy skill symbol, one family: Lucide's 24px grid, thin navy lines, and the drawing's own shapes
 * filled in two brand tints (the group colour, with a second colour across the lower-right half),
 * in the spirit of duotone spot illustrations. `expressive` adds two motion arcs in the second colour
 * that appear when `selected`. Without a tone it stays a single-colour outline (currentColor).
 * A check mark names a task; colour never implies verified evidence.
 */
export function SkillGlyph({ name, title, size = 24, className, decorative = false, tone, accentTone, expressive = false, selected = false }: {
  name: string; title: string; size?: number; className?: string; decorative?: boolean;
  tone?: SkillTone; accentTone?: SkillTone; expressive?: boolean; selected?: boolean;
}) {
  const id = useId();
  const maskId = `${id}m`;
  const halfId = `${id}h`;
  const accessible = decorative ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': title };
  // Expressive symbols shrink the drawing to leave room for the arcs at the sides.
  const inner = expressive ? 0.76 : 1;
  const offset = (24 - 24 * inner) / 2;
  // viewBox units that render as strokePx after the group scale
  const sw = strokePx(size) * 24 / (size * inner);
  const custom = CUSTOM[name];
  const Icon = icons[name] || CircleHelp;
  const shared: Custom = { line: lineOf(sw), fills: false, small: size <= 20, maskId };
  const fillShapes = custom ? custom({ ...shared, fills: true }) : EXTRA_FILL[name];
  const at: CSSProperties = { position: 'absolute', left: size * offset / 24, top: size * offset / 24 };

  return (
    <span {...accessible} className={className}
      style={{ position: 'relative', display: 'inline-block', width: size, height: size, flexShrink: 0, verticalAlign: 'middle', color: tone ? ink : undefined }}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {accentTone && <defs><clipPath id={halfId}><path d="M24 0v24H0Z" /></clipPath></defs>}
        <g transform={`translate(${offset} ${offset}) scale(${inner})`}>
          {tone && fillShapes && <g fill={fillOf(tone)}>{fillShapes}</g>}
          {accentTone && fillShapes && <g fill={fillOf(accentTone)} clipPath={`url(#${halfId})`}>{fillShapes}</g>}
          {custom?.(shared)}
        </g>
        {expressive && tone && (
          // Opacity only, so the selection cue stays calm under reduced motion.
          <g fill="none" stroke={arcOf(accentTone || tone)} strokeWidth={strokePx(size) * 24 / size} strokeLinecap="round"
            style={{ opacity: selected ? 1 : 0, transition: 'opacity 180ms cubic-bezier(.2,.8,.2,1)' }}>
            <path d="M2.7 9.4a6 6 0 0 0 0 5.2" />
            <path d="M.8 8.1a8.4 8.4 0 0 0 0 7.8" />
            <path d="M21.3 9.4a6 6 0 0 1 0 5.2" />
            <path d="M23.2 8.1a8.4 8.4 0 0 1 0 7.8" />
          </g>
        )}
      </svg>
      {!custom && tone && <Icon aria-hidden="true" size={size * inner} fill={fillOf(tone)} stroke="none" style={at} />}
      {!custom && accentTone && <Icon aria-hidden="true" size={size * inner} fill={fillOf(accentTone)} stroke="none"
        style={{ ...at, clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />}
      {!custom && <Icon aria-hidden="true" size={size * inner} strokeWidth={strokePx(size)} absoluteStrokeWidth style={at} />}
    </span>
  );
}

/** Resolve a stored skill ID or alias to its symbol. Labels stay visible beside it. */
export function SkillSymbol({ skill, size = 18, className, expressive = false, selected = false }: {
  skill: string; size?: number; className?: string; expressive?: boolean; selected?: boolean;
}) {
  const definition = findSkill(registry as any, skill);
  // Named software shows its vendor's own mark; everything else uses the ChemistTasker symbol.
  const logo = (definition as any)?.logo as string | undefined;
  if (hasSoftwareMark(logo)) return <span className={className} style={{ display: 'inline-flex' }}><SoftwareMark logo={logo!} size={size} /></span>;
  const tone = skillTone(definition?.group);
  return <SkillGlyph name={definition?.icon_web || 'CircleHelp'} title={definition?.label || skill} size={size} className={className}
    decorative tone={tone} accentTone={skillAccentTone(definition?.code || skill, tone)} expressive={expressive} selected={selected} />;
}

/** Script workload: an Rx in the band colour with waves around it (one to three a side as load rises). */
export function ScriptLoadSymbol({ level, color, size = 24, title }: { level: number; color: string; size?: number; title?: string }) {
  const sw = strokePx(size) * 24 / size;
  const waves = Math.min(Math.max(level, 1), 3);
  const arcs = [['M4 9.6a5.5 5.5 0 0 0 0 4.8', 'M20 9.6a5.5 5.5 0 0 1 0 4.8'], ['M2.3 8.4a8 8 0 0 0 0 7.2', 'M21.7 8.4a8 8 0 0 1 0 7.2'], ['M.6 7.2a10.4 10.4 0 0 0 0 9.6', 'M23.4 7.2a10.4 10.4 0 0 1 0 9.6']];
  const accessible = title ? { role: 'img' as const, 'aria-label': title } : { 'aria-hidden': true as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...accessible} style={{ flexShrink: 0, verticalAlign: 'middle', overflow: 'visible' }}>
      <g fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.2 17.5V6.5h3.6a2.9 2.9 0 0 1 0 5.8H8.2" />
        <path d="m10.9 12.3 5.2 5.7" />
        <path d="m16.1 13.6-4 4.4" />
        {arcs.slice(0, waves).map(([left, right]) => <g key={left}><path d={left} /><path d={right} /></g>)}
      </g>
    </svg>
  );
}

export type BadgeSubject = 'PROFILE' | 'AHPRA' | 'AHPRA_PROVISIONAL' | 'QUALIFICATION' | 'DISPENSING' | 'ENROLMENT' | 'ID' | 'REFERENCES' | 'ABN' | 'OVERSEAS' | 'UNDER_18';

/** Verification badge subjects (VerificationBadges.tsx); also rendered to PNG for Expo by scripts/render-mobile-skill-symbols.mjs. */
export const BADGE_SUBJECTS: Record<BadgeSubject, { icon: string; tone: SkillTone; accent: SkillTone }> = {
  PROFILE: { icon: 'ShieldUser', tone: 'violet', accent: 'cyan' },
  AHPRA: { icon: 'Award', tone: 'violet', accent: 'magenta' },
  AHPRA_PROVISIONAL: { icon: 'Award', tone: 'violet', accent: 'cyan' },
  QUALIFICATION: { icon: 'GraduationCap', tone: 'magenta', accent: 'violet' },
  DISPENSING: { icon: 'PillBottle', tone: 'violet', accent: 'blue' },
  ENROLMENT: { icon: 'GraduationCap', tone: 'cyan', accent: 'blue' },
  ID: { icon: 'IdCard', tone: 'blue', accent: 'violet' },
  REFERENCES: { icon: 'UsersRound', tone: 'cyan', accent: 'magenta' },
  ABN: { icon: 'ReceiptText', tone: 'blue', accent: 'cyan' },
  OVERSEAS: { icon: 'Earth', tone: 'blue', accent: 'cyan' },
  UNDER_18: { icon: 'Backpack', tone: 'magenta', accent: 'cyan' },
};
