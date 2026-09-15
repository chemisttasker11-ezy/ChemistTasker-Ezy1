'use client';
import {useState} from 'react';
import {useSession} from '@/shared/session-provider';
import Link from 'next/link';
import {FileText,Download,Globe,Pin,ThumbsUp,MessageCircle,Share2} from 'lucide-react';
import RichContent from '@/components/rich-content';
import {browserApi} from '@/lib/browser-api';
import type {PublicPost} from './community-client';

export default function PostEntry({post,feed=false,onChange}:{post:PublicPost;feed?:boolean;onChange?:()=>Promise<void>}) {
 const session=useSession();
 const [failed,setFailed]=useState<number[]>([]);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const total=Object.values(post.reactions).reduce((sum,n)=>sum+n,0);
 async function like(){setBusy(true);setMessage('');try{await browserApi(`/api/platform/client-profile/hub/posts/${post.id}/reactions/`,'POST',{reaction_type:'LIKE'});await onChange?.();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 async function share(){try{await navigator.clipboard.writeText(`${window.location.origin}/hubs/posts/${post.id}`);setMessage('Post link copied.');}catch{setMessage('Open the conversation and copy its address to share.');}}
 return <>
  <header className="ct-author"><span className="ct-avatar" aria-hidden="true">{post.author_name.split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('')}</span><div><strong>{post.author_name}</strong><div className="ct-post-meta"><time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}</time><span aria-hidden="true">·</span><Globe size={12}/><span>Public</span></div></div>{post.is_pinned&&<span className="ct-pinned"><Pin size={14}/>Pinned</span>}{post.editorial&&<span className="ct-status">Editorial</span>}</header>
  {post.editorial?<article className="ct-preview"><h2>{post.editorial.title}</h2><RichContent document={post.editorial.body_document}/></article>:<p className="ct-post-body">{post.body}</p>}
  {!!post.attachments.length&&<div className="ct-post-media" data-multiple={post.attachments.length>1}>{post.attachments.map(a=>{
   const kind=a.kind.toLowerCase(),type=a.content_type||'';
   const url=a.url.replace('/api/public-hub/','/api/hub/');
   const name=a.name||`Attachment ${a.id}`;
   if(failed.includes(a.id)) return <div className="ct-file-preview" key={a.id}><FileText size={24}/><strong>{name}</strong><small>This attachment is currently unavailable.</small></div>;
   if(['image','gif'].includes(kind)||type.startsWith('image/')) return <a key={a.id} className="ct-photo" href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`Photo shared by ${post.author_name}`} loading="lazy" onError={()=>setFailed(ids=>[...ids,a.id])}/></a>;
   if(type.startsWith('video/')) return <video key={a.id} controls onError={()=>setFailed(ids=>[...ids,a.id])} preload="metadata" aria-label={name} src={url}>Your browser cannot play this video. <a href={url}>Download video</a></video>;
   if(type.startsWith('audio/')) return <div key={a.id} className="ct-file-preview"><strong>{name}</strong><audio controls onError={()=>setFailed(ids=>[...ids,a.id])} preload="metadata" src={url}/></div>;
   return <div className="ct-file-preview" key={a.id}>{type==='application/pdf'&&<iframe src={url} title={`Document preview: ${name}`} loading="lazy" sandbox="allow-same-origin"/>}<a href={url} target="_blank" rel="noopener noreferrer"><span className="ct-file-icon"><FileText size={24}/></span><span><strong>{name}</strong><small>{type==='application/pdf'?'PDF document':'Attached file'} · Open or download</small></span><Download size={18}/></a></div>;
  })}</div>}
  <div className="ct-engagement"><span>{total>0&&<><span className="ct-like-count"><ThumbsUp size={11}/></span> {total} {total===1?'reaction':'reactions'}</>}</span><Link href={`/hubs/posts/${post.id}`}>{post.comment_count} {post.comment_count===1?'comment':'comments'}</Link></div>
  {feed&&<div className="ct-feed-actions">{post.can_interact?<button disabled={busy} onClick={()=>void like()}><ThumbsUp size={18}/>Like</button>:session.status==='anonymous'?<Link href={`/login?next=/hubs/${post.platform_hub}`}><ThumbsUp size={18}/>Like</Link>:<button disabled title="Reactions are available to verified members eligible for this hub"><ThumbsUp size={18}/>Like</button>}<Link href={`/hubs/posts/${post.id}`}><MessageCircle size={18}/>Comment</Link><button onClick={()=>void share()}><Share2 size={18}/>Share</button></div>}
  {message&&<p className="ct-muted" role="status">{message}</p>}
 </>;
}
