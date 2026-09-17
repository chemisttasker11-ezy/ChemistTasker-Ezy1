import { Syringe, FlaskConical, HeartPulse, Monitor, ShieldCheck, Pill, Leaf, PackageCheck, Bot, Droplets, Stethoscope, Plane, ClipboardCheck, GraduationCap, Sparkles, Users, ShoppingBag, type LucideIcon } from 'lucide-react';
import catalog from '@chemisttasker/shared-core/skills_catalog.json';
const labels = new Map<string,string>();
for (const role of Object.values(catalog)) for (const entries of Object.values(role)) if(Array.isArray(entries)) for (const entry of entries) labels.set(entry.code,entry.label);
export function skillLabel(skill: string) { return labels.get(skill) || skill; }
const rules: [RegExp,LucideIcon][] = [
 [/vaccin|immun|yellow.fever/i,Syringe], [/compound/i,FlaskConical], [/first.aid|cpr|cardiac/i,HeartPulse],
 [/fred|minfos|dispense.works|z.dispense|corum|rxone|aquarius|posworks|software/i,Monitor],
 [/insurance|pdl|indemnity/i,ShieldCheck], [/cannabis/i,Leaf], [/webster|daa|pack|stock/i,PackageCheck],
 [/robot|rowa|alpaca/i,Bot], [/ndss|diabet/i,Droplets], [/travel/i,Plane], [/medscheck|hmr|review/i,ClipboardCheck],
 [/credential|accredit|train/i,GraduationCap], [/prescrib|clinical|uti/i,Stethoscope], [/dispens|supply|pharmaco|contracept/i,Pill],
 [/customer|team|communicat/i,Users], [/retail|sales/i,ShoppingBag],
];
export default function SkillIcon({ skill, size = 16, className }: {skill:string;size?:number;className?:string}) {
 const label=skillLabel(skill); const Icon=rules.find(([test])=>test.test(label))?.[1] || Sparkles;
 return <Icon size={size} strokeWidth={1.8} className={className} aria-hidden="true"/>;
}
export function SkillBadge({skill}:{skill:string}) { return <span className="skill-badge"><SkillIcon skill={skill}/>{skillLabel(skill)}</span>; }
