import RichContent,{richHeadings} from '@/components/rich-content';
import { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, Clock3, MessageCircle } from 'lucide-react';
import { getArticle, getArticles } from '../../../lib/hub-server';
import { articlePath, dateLabel, Kind, safeWebUrl, site, topics } from '../../../lib/hub';
import ArticleCard, { ArticleArt } from './article-card';
import Discussion from './discussion';
import ShareButton from './share-button';

export async function articleMetadata(slug: string, kind: Kind): Promise<Metadata> {
  const article = await getArticle(slug);
  if (!article || article.kind !== kind) return { title: 'Article not found | ChemistTasker', robots: { index: false } };
  const url = `${site}${articlePath(article)}`;
  return { title: `${article.seo_title || article.title} | ChemistTasker`, description: article.seo_description || article.excerpt,
    alternates: { canonical: url }, openGraph: { type: 'article', title: article.title, description: article.excerpt, url,
      publishedTime: article.published_at, modifiedTime: article.updated_at, authors: [article.author_name],
      images: safeWebUrl(article.cover_url) ? [{ url: article.cover_url, alt: article.cover_alt }] : undefined },
    twitter: { card: article.cover_url ? 'summary_large_image' : 'summary', title: article.title, description: article.excerpt },
  };
}
export default async function ArticleDetail({ slug, kind }: { slug: string; kind: Kind }) {
  const article = await getArticle(slug);
  if (!article || article.kind !== kind) notFound();
  let related;
  try { related = await getArticles(kind, { topic: article.topic }); } catch { /* Related reading is optional. */ }
  const sections = article.body.split(/\r?\n\s*\r?\n/).filter(Boolean);
  const headings = article.body_document?.type==='doc'?richHeadings(article.body_document):sections.map((text,index)=>({text,id:`section-${index}`})).filter(({text})=>text.startsWith('## ')).map(item=>({...item,text:item.text.slice(3)}));
  const structuredData = { '@context': 'https://schema.org', '@type': kind === 'news' ? 'NewsArticle' : 'BlogPosting',
    headline: article.title, description: article.excerpt, datePublished: article.published_at, dateModified: article.updated_at,
    author: { '@type': article.author_name === 'ChemistTasker Editorial' ? 'Organization' : 'Person', name: article.author_name },
    publisher: { '@type': 'Organization', name: 'ChemistTasker', url: site }, mainEntityOfPage: `${site}${articlePath(article)}`,
    image: safeWebUrl(article.cover_url), articleSection: topics[article.topic], inLanguage: 'en-AU',
  };
  return <><Script id={`article-json-ld-${article.id}`} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}/>
    <div className="container hub-article-shell"><nav className="hub-breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href={`/${kind}`}>{kind === 'news' ? 'News' : 'The blog'}</Link><span>/</span><span aria-current="page">{topics[article.topic]}</span></nav>
      <header className="hub-article-heading"><Link className="hub-back" href={`/${kind}`}><ArrowLeft size={17}/>Back to {kind === 'news' ? 'news' : 'the journal'}</Link><span className="hub-tag">{topics[article.topic]}</span><h1>{article.title}</h1><p>{article.excerpt}</p>
        <div className="hub-article-meta"><div className="hub-byline"><span className="hub-avatar">{article.author_name.split(' ').map(w => w[0]).slice(0, 2).join('')}</span><div><strong>{article.author_name}</strong><span><time dateTime={article.published_at}>{dateLabel(article.published_at)}</time></span></div></div><span><Clock3 size={17}/>{article.read_minutes} min read</span><a href="#discussion"><MessageCircle size={17}/>Read and add comments</a><ShareButton/></div>
      </header><ArticleArt article={article} large/>
      <div className="hub-reading-layout"><aside className="hub-reading-aside"><p className="eyebrow">IN THIS STORY</p>{headings.length ? <nav aria-label="Article sections">{headings.map(({text,id})=><a href={`#${id}`} key={id}>{text}</a>)}</nav> : <p>A perspective from the ChemistTasker journal.</p>}<div className="hub-reading-note"><MessageCircle size={23}/><h3>Good conversations start with you.</h3><p>Have a perspective to add? Meet us in the discussion.</p><a href="#discussion">Add your voice <ArrowUpRight size={16}/></a></div></aside>
        <div><article className="hub-prose">{article.body_document?.type === 'doc' ? <RichContent document={article.body_document}/> : sections.map((text, index) => text.startsWith('## ') ? <h2 id={`section-${index}`} key={index}>{text.slice(3)}</h2> : <p key={index}>{text}</p>)}</article>
          {safeWebUrl(article.source_url) && <div className="hub-source"><strong>Go to the source</strong><p>For the original information and any subsequent updates:</p><a href={article.source_url} rel="noopener noreferrer" target="_blank">{article.source_name}<ArrowUpRight size={17}/></a></div>}
          <div className="hub-article-end"><span className="hub-tag">{topics[article.topic]}</span><ShareButton/></div>
          <Discussion article={article}/>
        </div></div>
      {!!related?.results.filter(a => a.id !== article.id).length && <section className="hub-related"><p className="eyebrow">KEEP EXPLORING</p><h2>A little more to think about.</h2><div className="hub-card-grid">{related.results.filter(a => a.id !== article.id).slice(0, 3).map(a => <ArticleCard key={a.id} article={a}/>)}</div></section>}
    </div></>;
}
