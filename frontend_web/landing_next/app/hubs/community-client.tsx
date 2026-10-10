'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,MessageCircle,Globe,Users,ImagePlus,Search,X,Send,BarChart3} from 'lucide-react';
import PostEntry from './post-entry';
import AccessNotice from './access-notice';
import {useSession} from '@/shared/session-provider';
import {loginHref} from '@/shared/browser-session';
import {chemistTaskerApi} from '@/lib/chemisttasker-api';
import {type RichNode} from '@/components/rich-content';
import type {Page} from '@/lib/hub';
import {fullDate,initials,relativeTime,richText} from './social-format';

export type PublicPost={id:number;platform_hub:string;body:string;author_name:string;created_at:string;allow_comments:boolean;is_pinned:boolean;comment_count:number;reactions:Record<string,number>;can_interact:boolean;can_edit:boolean;attachments:{id:number;kind:string;url:string;name?:string;content_type?:string}[];editorial:{title:string;body_document:RichNode}|null};
type Comment={id:number;body:string;parent_comment:number|null;author_name:string;created_at:string;can_edit:boolean;reactions:Record<string,number>};
type Poll={id:number;question:string;can_interact:boolean;is_closed:boolean;options:{id:number;text:string;votes:number}[]};

const ABOUT:Record<string,string>={
 public:'The shared ChemistTasker community. Ask questions, share what works and learn from people across pharmacy.',
 pharmacist:'A community for pharmacists: clinical questions, practice tips and career conversations.',
 intern:'A community for intern pharmacists: study, placements, exams and first jobs.',
 staff:'A community for pharmacy assistants, dispensary technicians and other pharmacy staff.',
 explorer:'A community for students and people exploring a career in pharmacy.',
 owner:'A community for pharmacy owners: running a pharmacy, staffing and business questions.',
};

function Paging({page,next,onPage}:{page:number;next:boolean;onPage:(n:number)=>void}){
 if(page===1&&!next)return null;
 return <div className="ct-pagination"><button disabled={page===1} onClick={()=>onPage(page-1)}>Previous</button><span>Page {page}</span><button disabled={!next} onClick={()=>onPage(page+1)}>Next</button></div>;
}

export default function CommunityFeed({hub,label,initial}:{hub:string;label:string;initial:Page<PublicPost>}){
 const session=useSession();
 const [tab,setTab]=useState<'discussion'|'about'>('discussion');
 const [files,setFiles]=useState<File[]>([]);const [feed,setFeed]=useState(initial);const [page,setPage]=useState(1);
 const [query,setQuery]=useState('');const [search,setSearch]=useState('');const [searchOpen,setSearchOpen]=useState(false);
 const [body,setBody]=useState('');const [composerOpen,setComposerOpen]=useState(false);const [allowed,setAllowed]=useState(false);
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [polls,setPolls]=useState<Page<Poll>>();const [pollPage,setPollPage]=useState(1);
 const textRef=useRef<HTMLTextAreaElement>(null);const fileRef=useRef<HTMLInputElement>(null);
 const meName=`${session.user?.first_name||''} ${session.user?.last_name||''}`.trim();
 const reload=useCallback(async()=>setFeed(await chemistTaskerApi.publicContent.listCommunityPosts(hub,{page,q:search}) as Page<PublicPost>),[hub,page,search,session.status]);
 useEffect(()=>{const draft=sessionStorage.getItem(`ct:hub-draft:${hub}`)||'';setBody(draft);if(draft)setComposerOpen(true);},[hub]);
 const loadPolls=useCallback(async()=>setPolls(await chemistTaskerApi.publicContent.listCommunityPolls(hub,{page:pollPage}) as Page<Poll>),[hub,pollPage]);
 useEffect(()=>{reload().catch(e=>setError(e.message));},[reload]);useEffect(()=>{loadPolls().catch(e=>setError(e.message));},[loadPolls]);
 useEffect(()=>{chemistTaskerApi.publicContent.listHubs().then(h=>setAllowed(!!h.find(x=>x.key===hub)?.can_interact)).catch(e=>setError(e.message));},[hub,session.status]);
 function openComposer(){setComposerOpen(true);setTimeout(()=>textRef.current?.focus(),0);}
 function addFiles(selected:File[]){const tooLarge=selected.find(file=>file.size>15*1024*1024);if(tooLarge){setError(`${tooLarge.name} is larger than the 15 MB attachment limit.`);return;}setError('');setFiles(prev=>[...prev,...selected]);setComposerOpen(true);}
 async function post(){setBusy(true);setError('');try{const data=new FormData();data.append('scope','platform');data.append('platform_hub',hub);data.append('body',body);files.forEach(file=>data.append('attachments',file));await chemistTaskerApi.publicContent.createCommunityPost(data);setBody('');sessionStorage.removeItem(`ct:hub-draft:${hub}`);setFiles([]);setComposerOpen(false);setPage(1);await reload();}catch(e){setError(`${(e as Error).message} Your text is still here, so you can try again.`);if((e as {status?:number}).status===401)window.location.assign(loginHref(`/hubs/${hub}`));}finally{setBusy(false);}}
 async function vote(poll:number,option:number){setBusy(true);setError('');try{await chemistTaskerApi.publicContent.voteCommunityPoll(poll,option);await loadPolls();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const about=ABOUT[hub]||'Share ideas, ask questions and learn with your pharmacy community.';
 const aboutPanel=<>
  <p>{about}</p>
  <p className="ct-about-fact"><Globe size={15} aria-hidden="true"/> Public · anyone can read these posts, including visitors who aren’t signed in.</p>
  <div className="ct-about-access">{!allowed?<AccessNotice hub={hub} path={`/hubs/${hub}`}/>:<p>You can post and join the conversation here.</p>}</div>
 </>;
 return <main className="ct-shell">
  <Link href="/hubs" className="ct-back"><ArrowLeft size={16}/> All communities</Link>
  <header className="ct-group-header">
   <div className="ct-group-band" aria-hidden="true"/>
   <div className="ct-group-identity">
    <div className="ct-hub-symbol" aria-hidden="true"><Users size={34}/></div>
    <div>
     <p className="ct-group-eyebrow">ChemistTasker community</p>
     <h1>{label}</h1>
     <p className="ct-group-meta"><Globe size={14} aria-hidden="true"/> Public group · Connected by pharmacy</p>
    </div>
   </div>
   <div className="ct-group-tabs">
    <div role="tablist" aria-label={`${label} sections`}>
     <button role="tab" aria-selected={tab==='discussion'} onClick={()=>setTab('discussion')}>Discussion</button>
     <button role="tab" aria-selected={tab==='about'} onClick={()=>setTab('about')}>About</button>
     <Link href="/hubs">Discover hubs</Link>
    </div>
    {tab==='discussion'&&(searchOpen||search?<form className="ct-tab-search" role="search" onSubmit={e=>{e.preventDefault();setSearch(query);setPage(1);}}><Search size={16} aria-hidden="true"/><input autoFocus aria-label="Search this group" placeholder="Search this group" value={query} onChange={e=>setQuery(e.target.value)} maxLength={200}/>{(query||search)&&<button type="button" aria-label="Clear search" onClick={()=>{setQuery('');setSearch('');setSearchOpen(false);setPage(1);}}><X size={16}/></button>}</form>:<button className="ct-icon-button" aria-label="Search this group" onClick={()=>setSearchOpen(true)}><Search size={18}/></button>)}
   </div>
  </header>
  {error&&<p role="alert" className="ct-message">{error}</p>}
  {tab==='about'?<section className="ct-card ct-about-tab" aria-label="About this group"><h2>About this group</h2>{aboutPanel}</section>:
  <div className="ct-group-layout">
   <div className="ct-feed" id="discussion">
    {allowed&&(!composerOpen?
     <div className="ct-card ct-composer-collapsed">
      <span className="ct-avatar" aria-hidden="true">{initials(meName||'Me')}</span>
      <button className="ct-composer-trigger" onClick={openComposer}>Write something to {label}…</button>
      <div className="ct-composer-quick"><button onClick={()=>fileRef.current?.click()}><ImagePlus size={18}/> Photo or file</button></div>
     </div>:
     <form className="ct-card ct-composer" onSubmit={e=>{e.preventDefault();void post();}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addFiles(Array.from(e.dataTransfer.files||[]));}}>
      <div className="ct-composer-head"><span className="ct-avatar" aria-hidden="true">{initials(meName||'Me')}</span><div><strong>{meName||'You'}</strong><span> · posting to {label}</span></div></div>
      <textarea ref={textRef} aria-label="Post text" placeholder="What would you like to share with the group?" required maxLength={10000} value={body} onChange={e=>{setBody(e.target.value);sessionStorage.setItem(`ct:hub-draft:${hub}`,e.target.value);}} onPaste={e=>{const pasted=Array.from(e.clipboardData.files||[]);if(pasted.length){e.preventDefault();addFiles(pasted);}}}/>
      {files.length>0&&<div className="ct-selected-files">{files.map((file,index)=><span key={index}>{file.type.startsWith('image/')?<img src={URL.createObjectURL(file)} alt=""/>:null}{file.name}<button type="button" onClick={()=>setFiles(files.filter((_,i)=>i!==index))} aria-label={`Remove ${file.name}`}><X size={14}/></button></span>)}</div>}
      <p className="ct-composer-note"><Globe size={13} aria-hidden="true"/> Everyone can see this post, including visitors who aren’t signed in.</p>
      <div className="ct-composer-actions">
       <button type="button" className="ct-ghost" title="Photos, PDF or Word documents, up to 15 MB each" onClick={()=>fileRef.current?.click()}><ImagePlus size={18}/> Photo or file</button>
       <span/>
       <button type="button" className="ct-ghost" onClick={()=>{setComposerOpen(false);}}>Cancel</button>
       <button className="ct-primary" disabled={busy||!body.trim()}><Send size={16}/>{busy?'Posting…':'Post'}</button>
      </div>
     </form>)}
    <input ref={fileRef} type="file" hidden accept=".pdf,.docx,image/jpeg,image/png,image/webp,image/gif" multiple onChange={e=>{addFiles(Array.from(e.target.files||[]));e.target.value='';}}/>
    {search&&<p className="ct-muted" role="status">Showing posts matching “{search}”.</p>}
    {feed.results.length===0&&<div className="ct-card ct-empty"><MessageCircle size={32}/><h2>{search?'No posts match':'No conversations yet'}</h2><p>{search?'Try another word.':'A thoughtful question can start something useful.'}</p>{allowed&&!search&&<button className="ct-primary" onClick={openComposer}>Write a post</button>}</div>}
    {feed.results.map(post=><section className="ct-card ct-social-post" key={post.id}><PostEntry post={post} feed onChange={reload}/></section>)}
    <Paging page={page} next={!!feed.next} onPage={setPage}/>
    {!!polls?.results.length&&<section className="ct-card"><h2 className="ct-section-title"><BarChart3 size={18} aria-hidden="true"/> Community polls</h2>{polls.results.map(p=>{const total=p.options.reduce((s,o)=>s+o.votes,0);return <div key={p.id} className="ct-poll"><h3>{p.question}</h3>{p.options.map(o=><button className="ct-poll-option" key={o.id} disabled={busy||!p.can_interact||p.is_closed} onClick={()=>void vote(p.id,o.id)} style={{['--pct' as string]:`${total?Math.round(o.votes/total*100):0}%`}}><span>{o.text}</span><span>{o.votes} {o.votes===1?'vote':'votes'}</span></button>)}{p.is_closed&&<p className="ct-muted">Voting closed</p>}</div>;})}<Paging page={pollPage} next={!!polls.next} onPage={setPollPage}/></section>}
   </div>
  </div>}
 </main>;
}

export function PostPage({initial}:{initial:PublicPost}){
 const session=useSession();
 const [post,setPost]=useState(initial);const [comments,setComments]=useState<Page<Comment>>();const [page,setPage]=useState(1);const [body,setBody]=useState('');const [reply,setReply]=useState<Comment|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [report,setReport]=useState('');const [reportOpen,setReportOpen]=useState(false);const [message,setMessage]=useState('');const [editing,setEditing]=useState<number|'post'|null>(null);const [editBody,setEditBody]=useState('');const [confirmRemove,setConfirmRemove]=useState<number|'post'|null>(null);
 useEffect(()=>{setBody(sessionStorage.getItem(`ct:comment-draft:${initial.id}`)||'');},[initial.id]);
 const reload=useCallback(async()=>{const [p,c]=await Promise.all([chemistTaskerApi.publicContent.getPost(initial.id) as Promise<PublicPost>,chemistTaskerApi.publicContent.listPostComments(initial.id,{page}) as Promise<Page<Comment>>]);setPost(p);setComments(c);},[initial.id,page,session.status]);useEffect(()=>{reload().catch(e=>setError(e.message));},[reload]);
 async function run(action:()=>Promise<unknown>,clearCommentDraft=false){setBusy(true);setError('');try{await action();if(clearCommentDraft){setBody('');sessionStorage.removeItem(`ct:comment-draft:${post.id}`);setReply(null);}setEditing(null);setConfirmRemove(null);await reload();}catch(e){setError((e as Error).message);if((e as {status?:number}).status===401)window.location.assign(loginHref(`/hubs/posts/${post.id}`));}finally{setBusy(false);}}
 async function sendReport(){setBusy(true);setError('');try{await chemistTaskerApi.publicContent.reportPost(post.id,{reason:report});setMessage('Report received. A publisher will review it.');setReportOpen(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function removePost(){setBusy(true);try{await chemistTaskerApi.publicContent.deleteCommunityPost(post.id);window.location.assign(`/hubs/${post.platform_hub}`);}catch(e){setError((e as Error).message);setBusy(false);}}
 return <main className="ct-shell" style={{maxWidth:850}}><Link className="ct-back" href={`/hubs/${post.platform_hub}`}><ArrowLeft size={16}/>Back to the hub</Link>{error&&<p role="alert" className="ct-message">{error}</p>}{message&&<p role="status" className="ct-message">{message}</p>}<section className="ct-card ct-social-post ct-post-detail"><PostEntry post={post}/>{post.can_interact?<div className="ct-actions"><button disabled={busy} onClick={()=>void run(()=>chemistTaskerApi.publicContent.reactToCommunityPost(post.id,'LIKE'))}>Like</button><button disabled={busy} onClick={()=>void run(()=>chemistTaskerApi.publicContent.removeCommunityPostReaction(post.id))}>Remove reaction</button><button onClick={()=>setReportOpen(!reportOpen)}>Report</button>{post.can_edit&&!post.editorial&&<><button onClick={()=>{setEditing('post');setEditBody(post.body);}}>Edit post</button>{confirmRemove==='post'?<span className="ct-confirm">Remove this post for everyone? <button className="ct-danger" disabled={busy} onClick={()=>void removePost()}>Remove</button><button onClick={()=>setConfirmRemove(null)}>Keep</button></span>:<button disabled={busy} onClick={()=>setConfirmRemove('post')}>Remove post</button>}</>}</div>:<AccessNotice hub={post.platform_hub} path={`/hubs/posts/${post.id}`}/>}
 {reportOpen&&<form className="ct-form" onSubmit={e=>{e.preventDefault();void sendReport();}}><label>Reason for reporting<textarea required value={report} maxLength={500} onChange={e=>setReport(e.target.value)}/></label><button disabled={busy}>Send report</button></form>}
 {editing!==null&&<form className="ct-form" onSubmit={e=>{e.preventDefault();void run(()=>editing==='post'?chemistTaskerApi.publicContent.updateCommunityPost(post.id,{body:editBody}):chemistTaskerApi.publicContent.updateCommunityComment(post.id,editing,{body:editBody}));}}><label>Edit text<textarea required value={editBody} onChange={e=>setEditBody(e.target.value)}/></label><div className="ct-actions"><button disabled={busy}>Save changes</button><button type="button" onClick={()=>setEditing(null)}>Cancel</button></div></form>}
 <div className="ct-discussion"><h2>Comments{comments?` · ${comments.count}`:''}</h2>
  {comments?.results.map(c=><article className="ct-comment-bubble" data-reply={!!c.parent_comment} key={c.id}>
   <span className="ct-avatar ct-avatar-sm" aria-hidden="true">{initials(c.author_name)}</span>
   <div>
    <div className="ct-bubble"><strong>{c.author_name}</strong><p>{richText(c.body)}</p></div>
    <div className="ct-comment-meta"><time dateTime={c.created_at} title={fullDate(c.created_at)}>{relativeTime(c.created_at)}</time>{Object.entries(c.reactions).filter(([,n])=>n>0).map(([key,n])=><span key={key}>{key==='LIKE'?'👍':key} {n}</span>)}
     {post.can_interact&&<>{post.allow_comments&&<button onClick={()=>setReply(c)}>Reply</button>}<button disabled={busy} onClick={()=>void run(()=>chemistTaskerApi.publicContent.reactToCommunityComment(post.id,c.id,'LIKE'))}>Like</button><button disabled={busy} onClick={()=>void run(()=>chemistTaskerApi.publicContent.removeCommunityCommentReaction(post.id,c.id))}>Remove reaction</button>{c.can_edit&&<><button onClick={()=>{setEditing(c.id);setEditBody(c.body);}}>Edit</button>{confirmRemove===c.id?<span className="ct-confirm">Remove? <button className="ct-danger" disabled={busy} onClick={()=>void run(()=>chemistTaskerApi.publicContent.deleteCommunityComment(post.id,c.id))}>Remove</button><button onClick={()=>setConfirmRemove(null)}>Keep</button></span>:<button onClick={()=>setConfirmRemove(c.id)}>Remove</button>}</>}</>}
    </div>
   </div>
  </article>)}
  {comments?.count===0&&<p className="ct-muted">No comments yet. {post.can_interact&&post.allow_comments?'Start the conversation below.':''}</p>}
  <Paging page={page} next={!!comments?.next} onPage={setPage}/>
  {post.can_interact&&post.allow_comments?<form className="ct-comment-form" onSubmit={e=>{e.preventDefault();void run(()=>chemistTaskerApi.publicContent.createCommunityComment(post.id,{body,...(reply?{parent_comment:reply.parent_comment||reply.id}:{})}),true);}}>
   {reply&&<p className="ct-replying">Replying to <strong>{reply.author_name}</strong> <button type="button" onClick={()=>setReply(null)} aria-label="Cancel reply"><X size={14}/></button></p>}
   <div className="ct-comment-input"><textarea aria-label={reply?`Reply to ${reply.author_name}`:'Write a comment'} placeholder={reply?`Reply to ${reply.author_name.split(' ')[0]}…`:'Write a comment…'} required maxLength={3000} value={body} onChange={e=>{setBody(e.target.value);sessionStorage.setItem(`ct:comment-draft:${post.id}`,e.target.value);}}/><button disabled={busy||!body.trim()} className="ct-primary" aria-label="Post comment"><Send size={16}/></button></div>
  </form>:!post.allow_comments&&<p className="ct-notice">Comments are closed for this post.</p>}
 </div></section></main>;
}
