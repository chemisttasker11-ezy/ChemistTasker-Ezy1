import Link from 'next/link';
import { ArrowRight, Search, MessageCircle, BookOpen, Radio, Users, ArrowUpRight } from 'lucide-react';
import { getArticles } from '../../../lib/hub-server';
import { Kind, platform, topics } from '../../../lib/hub';
import ArticleCard from './article-card';

export type SearchParams = Record<string, string | string[] | undefined>;
export default async function Listing({ kind, filters }: { kind: Kind; filters: SearchParams }) {
  const q = typeof filters.q === 'string' ? filters.q.slice(0, 200) : '';
  const topic = typeof filters.topic === 'string' && topics[filters.topic] ? filters.topic : '';
  const page = Math.max(1, Math.min(100000, Number.parseInt(String(filters.page || '1'), 10) || 1));
  const params = { q, topic, page: String(page) };
  let data;
  let unavailable = false;
  try { data = await getArticles(kind, params); } catch { unavailable = true; }
  const news = kind === 'news';
  const items = data?.results || [];
  const featured = page === 1 && !q && !topic && items[0]?.featured ? items[0] : undefined;
  const href = (changes: Record<string, string>) => `/${kind}?${new URLSearchParams({ ...params, ...changes })}`;
  return <>
    <section className="hub-hero"><div className="container hub-hero-grid"><div><p className="eyebrow"><span className="live-dot"/> {news ? 'PHARMACY NEWS & UPDATES' : 'THE CHEMISTTASKER JOURNAL'}</p>
      <h1>{news ? <>Stay informed.<br/><span>Stay connected.</span></> : <>Fresh perspectives.<br/><span>Better pharmacy days.</span></>}</h1>
      <p className="hub-hero-description">{news ? 'The updates that matter to Australian pharmacy. Follow industry news, explore career opportunities, and add your voice to the conversation.' : 'Practical guides to locum pharmacy work, hiring and connected teams in Australia. Explore career advice and everyday pharmacy perspectives.'}</p>
      <div className="hub-hero-notes"><span><BookOpen size={17}/>{news ? 'Industry & TGA updates' : 'Written by our team'}</span><span><MessageCircle size={17}/>Open conversations</span></div>
    </div><div className="hub-hero-visual" aria-hidden="true"><div className="hub-visual-ring"/><div className="hub-visual-note"><span className="icon-box purple">{news ? <Radio/> : <BookOpen/>}</span><span className="eyebrow">{news ? 'IN THE LOOP' : 'A FRESH PERSPECTIVE'}</span><h2>{news ? <>One profession.<br/>Many perspectives.</> : <>Good ideas.<br/>Shared openly.</>}</h2><div className="hub-note-lines"><i/><i/><i/></div><div className="hub-note-bottom"><span className="hub-avatar">CT</span><span>People. Pharmacy. Possibility.</span></div></div><div className="hub-visual-pill"><Users size={19}/>{news ? 'Your voice belongs here.' : 'Room to learn. Space to grow.'}</div><span className="hub-visual-spark">✦</span></div>
    </div></section>
    <div className="container hub-content"><nav className="hub-section-nav" aria-label="Publication sections"><Link href="/blog" aria-current={!news ? 'page' : undefined}><BookOpen size={18}/>The blog</Link><Link href="/news" aria-current={news ? 'page' : undefined}><Radio size={18}/>News</Link><span>Knowledge grows when we share it.</span></nav>
      {featured && <section className="hub-feature-section" aria-label="Featured article"><ArticleCard article={featured} featured/></section>}
      <section aria-labelledby="hub-latest"><div className="hub-list-heading"><div><p className="eyebrow">{news ? 'THE CONVERSATION CONTINUES' : 'A LITTLE INSPIRATION FOR YOUR DAY'}</p><h2 id="hub-latest">{news ? 'Around the pharmacy world.' : 'From the journal.'}</h2></div><form className="hub-search" action={`/${kind}`}><label htmlFor="article-search" className="hub-sr-only">Search {news ? 'news' : 'articles'}</label><Search size={18}/><input id="article-search" name="q" defaultValue={q} placeholder={news ? 'Search updates…' : 'Search the journal…'} maxLength={200}/>{topic && <input type="hidden" name="topic" value={topic}/>}<button type="submit" aria-label="Search"><ArrowRight size={19}/></button></form></div>
        <nav className="hub-filters" aria-label="Filter by topic"><Link href={href({ topic: '', page: '1' })} aria-current={!topic ? 'page' : undefined}>All topics</Link>{Object.entries(topics).map(([value, label]) => <Link key={value} href={href({ topic: value, page: '1' })} aria-current={topic === value ? 'page' : undefined}>{label}</Link>)}</nav>
        {q && <p className="hub-result-label">{data?.count || 0} results for “{q}” <Link href={`/${kind}`}>Clear search</Link></p>}
        {unavailable ? <div className="hub-empty" role="status"><Radio size={32}/><h3>We couldn’t load the latest stories.</h3><p>The publishing service is temporarily unavailable. Please try again shortly.</p><Link className="button secondary" href={href({})}>Try again</Link></div> : !items.length ? <div className="hub-empty"><BookOpen size={32}/><h3>{q || topic || page > 1 ? 'No stories found here.' : 'A new conversation starts here.'}</h3><p>{q || topic || page > 1 ? 'Try another topic or search, or return to the latest stories.' : 'Our team is preparing the first stories. Published articles will appear here.'}</p>{(q || topic || page > 1) && <Link className="button secondary" href={`/${kind}`}>View all stories</Link>}</div> : <div className="hub-card-grid">{items.filter(a => a.id !== featured?.id).map(article => <ArticleCard key={article.id} article={article}/>)}</div>}
        {data && (data.next || data.previous) && <nav className="hub-pagination" aria-label="Article pages">{data.previous && <Link className="button secondary" href={href({ page: String(page - 1) })}>Previous</Link>}<span>Page {page} of {Math.ceil(data.count / 12)}</span>{data.next && <Link className="button secondary" href={href({ page: String(page + 1) })}>Next <ArrowRight size={17}/></Link>}</nav>}
      </section>
      <section className="hub-join"><span className="icon-box purple"><MessageCircle size={27}/></span><div><p className="eyebrow">MORE THAN A COMMENT SECTION</p><h2>A place for your perspective.</h2><p>Ask a question. Share your experience. Connect with people who understand your working day.</p></div><a href="/hubs" className="button primary">Explore communities <ArrowUpRight size={18}/></a></section>
    </div>
  </>;
}
