import { useId, type CSSProperties } from 'react';
import {
  BookLock, Bot, Boxes, BriefcaseMedical, CalendarCheck, CalendarClock, CalendarPlus, CircleHelp, ClipboardCheck, ClipboardList, ClipboardPenLine, ClipboardPlus, CreditCard, Droplet, Droplets, FileSpreadsheet, FileText, Files, FlaskConical, FlaskRound, Hand, HeartPulse, Hospital, Hourglass, HousePlus, LayoutGrid, Leaf, LockKeyhole, MessageCircleQuestion, MessagesSquare, Monitor, MonitorCog, PackageOpen, PackageX, PhoneCall, Pill, PillBottle, Plane, QrCode, ReceiptText, ScanBarcode, ShieldCheck, ShieldUser, ShoppingBag, ShoppingCart, Siren, Smartphone, Snowflake, SprayCan, Stethoscope, Store, Syringe, Truck, UsersRound, Workflow,
  type LucideIcon,
} from 'lucide-react';

const icons: Record<string, LucideIcon> = {
  BookLock, Bot, Boxes, BriefcaseMedical, CalendarCheck, CalendarClock, CalendarPlus, CircleHelp, ClipboardCheck, ClipboardList, ClipboardPenLine, ClipboardPlus, CreditCard, Droplet, Droplets, FileSpreadsheet, FileText, Files, FlaskConical, FlaskRound, Hand, HeartPulse, Hospital, Hourglass, HousePlus, LayoutGrid, Leaf, LockKeyhole, MessageCircleQuestion, MessagesSquare, Monitor, MonitorCog, PackageOpen, PackageX, PhoneCall, Pill, PillBottle, Plane, QrCode, ReceiptText, ScanBarcode, ShieldCheck, ShieldUser, ShoppingBag, ShoppingCart, Siren, Smartphone, Snowflake, SprayCan, Stethoscope, Store, Syringe, Truck, UsersRound, Workflow,
};

/** Same 24px optical grid for onboarding and compact job/talent badges.
 * A final-check tick describes a task; colour never implies verified evidence.
 */
export function SkillGlyph({ name, title, size = 24, className, decorative = false }: {
  name: string; title: string; size?: number; className?: string; decorative?: boolean;
}) {
  const maskId = useId();
  const style: CSSProperties = { flexShrink: 0, verticalAlign: 'middle' };
  const accessible = decorative ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': title, 'aria-hidden': false as const };
  if (name === 'BLISTER_PACK' || name === 'BLISTER_CHECK') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" {...accessible} className={className} style={style}>
        {name === 'BLISTER_CHECK' && <defs><mask id={maskId}>
          <rect width="24" height="24" fill="white" />
          <circle cx="18.5" cy="18.5" r="5.7" fill="black" />
        </mask></defs>}
        <g mask={name === 'BLISTER_CHECK' ? `url(#${maskId})` : undefined}>
        <rect x="3" y="1.5" width="18" height="21" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {Array.from({ length: 7 }, (_, row) => Array.from({ length: 4 }, (_, col) => (
          <rect key={`${row}-${col}`} x={5 + col * 3.7} y={3.3 + row * 2.6}
            width="2.6" height="1.5" rx="0.7" fill="currentColor" />
        )))}
        </g>
        {name === 'BLISTER_CHECK' && <>
          <circle cx="18.5" cy="18.5" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="m15.5 18.5 2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>}
      </svg>
    );
  }
  const Icon = icons[name] || CircleHelp;
  return <Icon size={size} strokeWidth={1.8} {...accessible} className={className} style={style} />;
}
