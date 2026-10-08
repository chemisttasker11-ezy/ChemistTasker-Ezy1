'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BookOpenCheck, GraduationCap, Newspaper, RefreshCw, Users } from 'lucide-react';
import { useSession } from '@/shared/session-provider';
import { chemistTaskerApi } from '@/lib/chemisttasker-api';
import { safeWebUrl } from '@/lib/hub';
import styles from './learning.module.css';

type Article = {
  id: number;
  title: string;
  slug: string;
  kind: 'blog' | 'news';
  topic: string;
  excerpt: string;
  read_minutes: number;
  published_at: string;
  cover_url?: string;
  cover_alt?: string;
  author_name?: string;
};
type ArticleResponse = { results?: Article[] };
type Options = { role_code: string | null; role_label: string | null; role_guidance: string[] };

const rolePath: Record<string, string> = {
  OWNER: 'Business, leadership and pharmacy operations',
  PHARMACIST: 'Clinical practice, career and professional development',
  INTERN: 'Internship, registration and workplace development',
  STUDENT: 'Study, placement and transition to practice',
  TECHNICIAN: 'Dispensary workflow and workplace development',
  ASSISTANT: 'Retail pharmacy, customer service and workplace development',
  EXPLORER: 'Career discovery and pharmacy pathways',
  CAREER_SWITCHER: 'Career transition and pharmacy pathways',
};

export default function LearningPage() {
  const session = useSession();
  const [articles, setArticles] = useState<Article[]>([]);
  const [options, setOptions] = useState<Options>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const loadArticles = useCallback(async () => {
    setState('loading');
    try {
      const data = await chemistTaskerApi.publicContent.listArticles({ topic: 'learning' }) as ArticleResponse;
      setArticles(data.results || []);
      setState('ready');
    } catch {
      setArticles([]);
      setState('error');
    }
  }, []);

  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);

  useEffect(() => {
    if (session.status !== 'authenticated') {
      setOptions(undefined);
      return;
    }
    void chemistTaskerApi.marketplace.getListingOptions()
      .then((data) => setOptions(data as Options))
      .catch(() => setOptions(undefined));
  }, [session.status]);

  const path = options?.role_code ? rolePath[options.role_code] : undefined;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroIcon}><GraduationCap size={32} /></div>
          <h1>Learn across the pharmacy community.</h1>
          <span>Shared resources for everyone, with role-relevant pathways when you are signed in.</span>
          {path && (
            <div className={styles.role}>
              <strong>{options?.role_label}</strong>
              <small>{path}</small>
            </div>
          )}
        </div>
      </section>

      <section className="container">
        <nav className={styles.links} aria-label="Knowledge and community">
          <Link href="/hubs"><Users /> Community discussions</Link>
          <Link href="/blog"><BookOpenCheck /> Blog</Link>
          <Link href="/news"><Newspaper /> News</Link>
        </nav>

        <div className={styles.heading}>
          <div>
            <h2>Learning resources</h2>
            <p>Editorial resources tagged for learning are shown here.</p>
          </div>
        </div>

        {state === 'loading' && (
          <div className={styles.grid} aria-label="Loading learning resources">
            {Array.from({ length: 3 }, (_, index) => <div key={index} className={styles.skeleton} />)}
          </div>
        )}

        {state === 'error' && (
          <section className={[styles.empty, styles.error].join(' ')} role="alert">
            <RefreshCw />
            <h3>Learning resources can&apos;t load right now.</h3>
            <p>This is a service problem rather than an empty learning library.</p>
            <button className="button secondary" type="button" onClick={() => void loadArticles()}>
              <RefreshCw size={16} /> Try again
            </button>
          </section>
        )}

        {state === 'ready' && articles.length > 0 && (
          <div className={styles.grid}>
            {articles.map((article) => {
              const cover = safeWebUrl(article.cover_url);
              return (
                <Link href={\`/\${article.kind}/\${article.slug}\`} key={article.id} className={styles.card}>
                  {cover && (
                    <div className={styles.cardImage}>
                      <img src={cover} alt={article.cover_alt || article.title} loading="lazy" />
                    </div>
                  )}
                  <div className={styles.cardBody}>
                    <div className={styles.cardMeta}>
                      <span>{article.kind} · {article.read_minutes} min</span>
                      {article.author_name && <span className={styles.authorBadge}>{article.author_name}</span>}
                    </div>
                    <h3>{article.title}</h3>
                    <p>{article.excerpt}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {state === 'ready' && articles.length === 0 && (
          <section className={styles.empty}>
            <BookOpenCheck />
            <h3>No learning resources are published yet.</h3>
            <p>Published resources tagged with the learning topic will appear here.</p>
          </section>
        )}
      </section>
    </div>
  );
}
