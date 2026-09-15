import { Fragment, type ReactNode } from 'react';
export type RichNode = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: {type:string;attrs?:Record<string,unknown>}[]; content?: RichNode[] };
export const emptyDocument: RichNode = {type:'doc',content:[{type:'paragraph'}]};
function url(value:unknown,image=false) { try {const u=new URL(String(value));return (image?['http:','https:']:['http:','https:','mailto:']).includes(u.protocol)?u.href:undefined;}catch{return undefined;} }
export function richHeadings(document:RichNode){const items:{text:string;id:string}[]=[];const text=(node:RichNode):string=>node.text||node.content?.map(text).join('')||'';function walk(node:RichNode,key:string){if(node.type==='heading')items.push({text:text(node),id:`section-${key}`});node.content?.forEach((child,i)=>walk(child,`${key}-${i}`));}walk(document,'root');return items;}
export default function RichContent({document}:{document:RichNode}) {
 function render(node:RichNode,key:number|string):ReactNode {
  const children=node.content?.map((child,i)=>render(child,`${key}-${i}`));
  if(node.type==='text') {
   let text:ReactNode=node.text;
   for(const mark of node.marks||[]) {
    if(mark.type==='bold') text=<strong>{text}</strong>;
    if(mark.type==='italic') text=<em>{text}</em>;
    if(mark.type==='strike') text=<s>{text}</s>;
    if(mark.type==='code') text=<code>{text}</code>;
    if(mark.type==='link'&&url(mark.attrs?.href)) text=<a href={url(mark.attrs?.href)} rel="noopener noreferrer">{text}</a>;
   }
   return <Fragment key={key}>{text}</Fragment>;
  }
  switch(node.type) {
   case 'doc':return <Fragment key={key}>{children}</Fragment>;
   case 'paragraph':return <p key={key}>{children}</p>;
   case 'heading':return node.attrs?.level===3?<h3 id={`section-${key}`} key={key}>{children}</h3>:node.attrs?.level===4?<h4 id={`section-${key}`} key={key}>{children}</h4>:<h2 id={`section-${key}`} key={key}>{children}</h2>;
   case 'bulletList':return <ul key={key}>{children}</ul>;
   case 'orderedList':return <ol key={key}>{children}</ol>;
   case 'listItem':return <li key={key}>{children}</li>;
   case 'blockquote':return <blockquote key={key}>{children}</blockquote>;
   case 'hardBreak':return <br key={key}/>;
   case 'image':return url(node.attrs?.src,true)?<figure key={key}><img loading="lazy" src={url(node.attrs?.src,true)} alt={String(node.attrs?.alt||'')}/></figure>:null;
   default:return null;
  }
 }
 return <>{render(document,'root')}</>;
}
