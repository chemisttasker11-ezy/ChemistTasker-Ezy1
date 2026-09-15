import Link from 'next/link';
import { ArrowUpRight, BookOpen, MessageCircle, Radio, Clock3 } from 'lucide-react';
import { Article, articlePath, dateLabel, safeWebUrl, topics } from '../../../lib/hub';

export function ArticleArt({ article, large = false }: { article: Article; large?: boolean }) {
  const cover = safeWebUrl(article.cover_url);
  return <div className={`hub-art hub-art-${article.topic} ${large ? 'hub-art-large' : ''}`}>
    {cover ? <img src={cover} alt={article.cover_alt} loading={large ? 'eager' : 'lazy'}/> : <><span className="hub-art-orbit"/><span className="hub-art-icon">{article.kind === 'news' ? <Radio size={48}/> : <BookOpen size={48}/>}</span><span className="hub-art-word">{topics[article.topic] || 'Pharmacy, connected.'}</span><span className="hub-art-brand">CHEMISTTASKER JOURNAL</span></>}
  </div>;
}
export default function ArticleCard({ article, featured = false }: { article: Article; featured?: boolean }) {
  return <article className={`hub-card ${featured ? 'hub-featured' : ''}`}>
    <Link href={articlePath(article)} className="hub-card-image" aria-label={`Read ${article.title}`}><ArticleArt article={article} large={featured}/></Link>
    <div className="hub-card-content"><div className="hub-meta"><span className="hub-tag">{topics[article.topic]}</span>{featured && <span className="hub-feature-label">EDITOR’S PICK</span>}</div>
      <h2><Link href={articlePath(article)}>{article.title}</Link></h2><p>{article.excerpt}</p>
      <div className="hub-byline"><span className="hub-avatar">CT</span><div><strong>{article.author_name}</strong><span><time dateTime={article.published_at}>{dateLabel(article.published_at)}</time> · {article.read_minutes} min read</span></div></div>
      <div className="hub-card-bottom"><span><MessageCircle size={15}/>{article.comment_count} {article.comment_count === 1 ? 'comment' : 'comments'}</span><Link href={articlePath(article)}>Read {article.kind === 'news' ? 'update' : 'story'} <ArrowUpRight size={17}/></Link></div>
    </div></article>;
}
