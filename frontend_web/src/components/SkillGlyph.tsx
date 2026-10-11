import * as React from 'react';
import * as Lucide from 'lucide-react';

/** Single design-system glyph. DAA uses a custom blister-tray symbol. */
export function SkillGlyph({ name, title }: { name: string; title: string }) {
  if (name === 'BLISTER_PACK' || name === 'BLISTER_CHECK') {
    return (
      <svg width="26" height="26" viewBox="0 0 26 26" role="img" aria-label={title} style={{flexShrink:0}}>
        <rect x="2" y="2" width="22" height="22" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        {[0,1,2,3].map(row => [0,1,2].map(col => (
          <ellipse key={row+'-'+col} cx={6+col*7} cy={5.5+row*5}
            rx="1.8" ry="1.65" fill="none" stroke="currentColor" strokeWidth="1" />
        )))}
        {name === 'BLISTER_CHECK' && <path d="M14 20l3 3 6-7" fill="none" stroke="#139568" strokeWidth="2.3" strokeLinecap="round" />}
      </svg>
    );
  }
  const Icon = (Lucide as Record<string, unknown>)[name] as React.ComponentType<{size?: number;strokeWidth?:number; 'aria-label'?:string}> | undefined;
  return Icon ? <Icon size={22} strokeWidth={1.8} aria-label={title} /> : <Lucide.Stethoscope size={22} aria-label={title} />;
}
