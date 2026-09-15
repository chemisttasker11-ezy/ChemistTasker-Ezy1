'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Lightbulb, Heart, ThumbsUp, MessageCircle, ArrowUpRight, Flag, Trash2 } from 'lucide-react';
import { Article, articlePath, dateLabel, HubComment, Page, Reactions } from '../../../lib/hub';
import { api } from './hub-client';
import {useSession} from '@/shared/session-provider';

function ReactionBar({ value, path, signedIn, onChange, signIn }: { value: Reactions; path: string; signedIn: boolean; onChange: (value: Reactions) => void; signIn: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const session = useSession();
  const choices = [{ key: 'like', label: 'Helpful', Icon: ThumbsUp }, { key: 'insightful', label: 'Insightful', Icon: Lightbulb }, { key: 'support', label: 'Support', Icon: Heart }];
  async function react(kind: string) {
    setBusy(true); setError('');
    try { onChange(await api<Reactions>(path, value.mine === kind ? 'DELETE' : 'PUT', { kind })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div><div className="hub-reactions" aria-label="Reactions">{choices.map(({ key, label, Icon }) => signedIn ? <button key={key} disabled={busy} aria-pressed={value.mine === key} onClick={() => react(key)}><Icon size={16}/>{label}<span>{value.counts[key] || 0}</span></button> : session.status!=='anonymous' ? <button key={key} disabled><Icon size={16}/>{label}<span>{value.counts[key] || 0}</span></button> : <Link href={signIn} key={key} aria-label={`Sign in to react: ${label}`}><Icon size={16}/>{label}<span>{value.counts[key] || 0}</span></Link>)}</div>{error && <p className="hub-error" role="alert">{error}</p>}</div>;
}

function Composer({ submit, label, cancel }: { submit: (body: string) => Promise<void>; label: string; cancel?: () => void }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function send(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await submit(body.trim()); setBody(''); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <form className="hub-composer" onSubmit={send}><label>{label}<textarea value={body} onChange={e => setBody(e.target.value)} maxLength={3000} required rows={4} placeholder="Share a thought, an experience, or a question…"/></label>
    <div><span>{body.length}/3000</span>{cancel && <button type="button" className="hub-text-button" onClick={cancel} disabled={busy}>Cancel</button>}<button className="button primary" disabled={busy || !body.trim()}>{busy ? 'Posting…' : label}<ArrowUpRight size={16}/></button></div>{error && <p role="alert" className="hub-error">{error}</p>}</form>;
}

function CommentThread({ comment, slug, signedIn, signIn, open, refresh, rootId }: { comment: HubComment; slug: string; signedIn: boolean; signIn: string; open: boolean; refresh: () => Promise<void>; rootId?: number }) {
  const [reactions, setReactions] = useState(comment.reactions);
  const [replying, setReplying] = useState(false);
  const [replies, setReplies] = useState<HubComment[]>([]);
  const [replyPage, setReplyPage] = useState(0);
  const [more, setMore] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { setReactions(comment.reactions); }, [comment.reactions]);
  const loadReplies = async (page = 1) => {
    const data = await api<Page<HubComment>>(`articles/${slug}/comments/?parent=${comment.id}&page=${page}`);
    setReplies(previous => page === 1 ? data.results : [...previous, ...data.results]); setReplyPage(page); setMore(!!data.next);
  };
  async function run(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function refreshThread() { await refresh(); if (!rootId && replyPage) await loadReplies(); }
  return <article className="hub-comment"><div className="hub-comment-heading"><span className="hub-avatar">{comment.deleted ? '—' : comment.author_name.split(' ').map(w => w[0]).slice(0, 2).join('')}</span><div><strong>{comment.author_name}</strong><time dateTime={comment.created_at}>{dateLabel(comment.created_at)}</time></div></div>
    <p className="hub-comment-body">{comment.deleted ? 'This comment has been removed.' : comment.body}</p>
    {!comment.deleted && <ReactionBar value={reactions} path={`comments/${comment.id}/reaction/`} signedIn={signedIn} onChange={setReactions} signIn={signIn}/>}
    <div className="hub-comment-actions">{!comment.deleted && open && (signedIn ? <button onClick={() => setReplying(!replying)} aria-expanded={replying}><MessageCircle size={15}/>Reply</button> : <Link href={signIn}>Log in to reply</Link>)}
      {!rootId && comment.reply_count > 0 && replyPage === 0 && <button disabled={busy} onClick={() => run(() => loadReplies())}>View {comment.reply_count} {comment.reply_count === 1 ? 'reply' : 'replies'}</button>}
      {signedIn && !comment.deleted && <button onClick={() => setReporting(!reporting)} aria-expanded={reporting}><Flag size={14}/>Report</button>}
      {comment.can_delete && <button onClick={() => setConfirmDelete(!confirmDelete)}><Trash2 size={14}/>Remove</button>}
    </div>
    {confirmDelete && <div className="hub-inline-confirm"><p>Remove your comment? Replies will remain in the conversation.</p><button disabled={busy} className="hub-text-button" onClick={() => run(async () => { await api(`comments/${comment.id}/`, 'DELETE'); setConfirmDelete(false); await refreshThread(); })}>Remove comment</button><button className="hub-text-button" onClick={() => setConfirmDelete(false)}>Keep comment</button></div>}
    {reporting && <form className="hub-report" onSubmit={e => { e.preventDefault(); void run(async () => { const data = await api<{ detail: string }>(`comments/${comment.id}/report/`, 'POST', { reason }); setNotice(data.detail); setReporting(false); setReason(''); }); }}><label>Why are you reporting this comment?<textarea required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} rows={2}/></label><button className="button secondary small" disabled={busy || !reason.trim()}>Send report</button></form>}
    {replying && <Composer label="Post reply" cancel={() => setReplying(false)} submit={async body => { await api(`articles/${slug}/comments/`, 'POST', { body, parent: rootId || comment.id }); setReplying(false); setNotice('Reply posted.'); try { await refresh(); if (!rootId) await loadReplies(); } catch { setError('Your reply was saved, but the conversation could not refresh. Reload to see it.'); } }}/ >}
    {error && <p className="hub-error" role="alert">{error}</p>}{notice && <p className="hub-notice" role="status">{notice}</p>}
    {replies.length > 0 && <div className="hub-replies">{replies.map(reply => <CommentThread key={reply.id} comment={reply} slug={slug} signedIn={signedIn} signIn={signIn} open={open && !comment.deleted} rootId={comment.id} refresh={refreshThread}/>)}{more && <button className="hub-text-button" disabled={busy} onClick={() => run(() => loadReplies(replyPage + 1))}>Load more replies</button>}</div>}
  </article>;
}

export default function Discussion({ article }: { article: Article }) {
  const session = useSession();
  const member = session.user ? {name: [session.user.first_name, session.user.last_name].filter(Boolean).join(' ') || 'ChemistTasker member'} : null;
  const [items, setItems] = useState<HubComment[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reactions, setReactions] = useState(article.reactions);
  const [commentsOpen, setCommentsOpen] = useState(article.comments_open);
  const signIn = `/community/sign-in?next=${encodeURIComponent(articlePath(article) + '#discussion')}`;
  const refresh = useCallback(async () => {
    const data = await api<Page<HubComment>>(`articles/${article.slug}/comments/`);
    setItems(data.results); setPage(1); setMore(!!data.next);
  }, [article.slug]);
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError('');
      try {
        const current = await api<Article>(`articles/${article.slug}/`);
        const data = await api<Page<HubComment>>(`articles/${article.slug}/comments/`);
        if (active) { setReactions(current.reactions); setCommentsOpen(current.comments_open); setItems(data.results); setMore(!!data.next); }
      } catch (e) { if (active) setError((e as Error).message); } finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [article.slug, session.status]);
  async function loadMore() {
    setBusy(true); setError('');
    try { const data = await api<Page<HubComment>>(`articles/${article.slug}/comments/?page=${page + 1}`); setItems(previous => [...previous, ...data.results]); setPage(page + 1); setMore(!!data.next); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="hub-discussion" id="discussion" aria-labelledby="discussion-heading"><p className="eyebrow">YOUR PERSPECTIVE MATTERS</p><h2 id="discussion-heading">Let’s talk about it.</h2><p>Keep it thoughtful, respectful, and free of personal patient information.</p>
    <ReactionBar value={reactions} path={`articles/${article.slug}/reaction/`} signedIn={!!member} onChange={setReactions} signIn={signIn}/>
    {loading || session.status==='loading' ? <p role="status">Loading the conversation…</p> : session.status==='unavailable' ? <p>We couldn’t check your account. <button onClick={()=>void session.reload()}>Reconnect</button></p> : <>{!commentsOpen ? <div className="hub-sign-in-prompt"><strong>This discussion is closed.</strong><p>You can still read the conversation and react.</p></div> : member ? <><div className="hub-member-line"><span>Posting as <strong>{member.name}</strong></span></div><Composer label="Post comment" submit={async body => { await api(`articles/${article.slug}/comments/`, 'POST', { body }); setNotice('Your comment has been posted.'); try { await refresh(); } catch { setError('Your comment was saved, but the conversation could not refresh. Reload to see it.'); } }}/></> : <div className="hub-sign-in-prompt"><span className="icon-box purple"><MessageCircle/></span><div><h3>Be part of the conversation.</h3><p>Log in with your ChemistTasker account to comment, reply, and react. Every role is welcome.</p><div className="button-row"><Link className="button primary small" href={signIn}>Log in to join <ArrowUpRight size={16}/></Link><a className="button secondary small" href={`/register?next=${encodeURIComponent(articlePath(article)+'#discussion')}`}>Create an account</a></div></div></div>}
      {items.length ? <div className="hub-comment-list">{items.map(comment => <CommentThread key={comment.id} comment={comment} slug={article.slug} signedIn={!!member} signIn={signIn} open={commentsOpen} refresh={refresh}/>)}</div> : !error && <p className="hub-first-comment">No comments yet. {commentsOpen ? 'Start a thoughtful conversation.' : ''}</p>}
      {more && <button className="button secondary" disabled={busy} onClick={loadMore}>{busy ? 'Loading…' : 'Load more comments'}</button>}
    </>}{notice && <p className="hub-notice" role="status">{notice}</p>}{error && <div role="alert" className="hub-error"><p>{error}</p><button className="hub-text-button" onClick={() => { setError(''); void refresh().catch(e => setError(e.message)); }}>Retry comments</button></div>}
  </section>;
}
