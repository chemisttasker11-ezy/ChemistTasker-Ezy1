import {Fragment,type ReactNode} from 'react';

/** Same feed stamps as the Vite hub and chat: "Just now", "5m", "2h", "Yesterday", "Mon", "6 Oct". */
export function relativeTime(iso:string){
 const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';
 const now=new Date();const minutes=Math.floor((now.getTime()-d.getTime())/60000);
 if(minutes<1)return 'Just now';if(minutes<60)return `${minutes}m`;
 const sameDay=d.toDateString()===now.toDateString();
 if(sameDay)return `${Math.floor(minutes/60)}h`;
 const startOf=(x:Date)=>new Date(x.getFullYear(),x.getMonth(),x.getDate()).getTime();
 const days=Math.round((startOf(now)-startOf(d))/86400000);
 if(days===1)return 'Yesterday';
 if(days<7)return d.toLocaleDateString('en-AU',{weekday:'short'});
 return d.toLocaleDateString('en-AU',d.getFullYear()===now.getFullYear()?{day:'numeric',month:'short'}:{day:'numeric',month:'short',year:'numeric'});
}
export const fullDate=(iso:string)=>new Date(iso).toLocaleString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'numeric',minute:'2-digit'});
export const initials=(name:string)=>name.split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('').toUpperCase()||'?';

const TOKEN=/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|(@[\p{L}\p{N}._-]+)/gu;
/** Text with clickable links and highlighted @mentions (no HTML is executed). */
export function richText(body:string):ReactNode{
 const parts:ReactNode[]=[];let last=0;
 for(const m of body.matchAll(TOKEN)){const start=m.index??0;if(start>last)parts.push(body.slice(last,start));
  parts.push(m[1]?<a key={start} href={m[1]} target="_blank" rel="noopener noreferrer nofollow">{m[1]}</a>:<strong key={start} className="ct-mention">{m[2]}</strong>);
  last=start+m[0].length;}
 if(last<body.length)parts.push(body.slice(last));
 return parts.map((p,i)=><Fragment key={i}>{p}</Fragment>);
}
