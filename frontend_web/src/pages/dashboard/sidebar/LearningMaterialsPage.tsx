// LearningMaterialsPage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Card,
  InputAdornment,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { ArrowUpRight, BookOpenCheck, Clock3, GraduationCap, Newspaper, Search, Users } from 'lucide-react';
import type { PublicArticle } from '@chemisttasker/shared-core';
import { chemistTaskerApi } from '../../../config/api';
import PageHeader from '../../../components/ui/PageHeader';
import IconTile from '../../../components/ui/IconTile';
import DashboardContentState from '../../../components/dashboard/DashboardContentState';
import { safeWebHref } from '../../../components/social/socialFormat';

type Kind = 'all' | PublicArticle['kind'];
type RoleOptions = { role_code?: string | null; role_label?: string | null };

/** Same role pathways as the public Learning hub in landing_next. */
const ROLE_PATH: Record<string, string> = {
  OWNER: 'Business, leadership and pharmacy operations',
  PHARMACIST: 'Clinical practice, career and professional development',
  INTERN: 'Internship, registration and workplace development',
  STUDENT: 'Study, placement and transition to practice',
  TECHNICIAN: 'Dispensary workflow and workplace development',
  ASSISTANT: 'Retail pharmacy, customer service and workplace development',
  EXPLORER: 'Career discovery and pharmacy pathways',
  CAREER_SWITCHER: 'Career transition and pharmacy pathways',
};

const KIND_LABEL: Record<PublicArticle['kind'], string> = { blog: 'Article', news: 'News' };

const publicOrigin = () => (import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, '');
const articleUrl = (article: PublicArticle) => `${publicOrigin()}/${article.kind}/${encodeURIComponent(article.slug)}`;
const publishedLabel = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
};
const nextPage = (next: string | null) => {
  if (!next) return null;
  try {
    const page = Number(new URL(next, window.location.origin).searchParams.get('page'));
    return Number.isFinite(page) && page > 1 ? page : null;
  } catch {
    return null;
  }
};

type CoverHeight = number | { xs: number; md: string };

function Cover({ article, height }: { article: PublicArticle; height: CoverHeight }) {
  const [failed, setFailed] = useState(false);
  const src = safeWebHref(article.cover_url || '');
  if (src && !failed) {
    return (
      <Box
        component="img"
        src={src}
        alt={article.cover_alt || ''}
        loading="lazy"
        onError={() => setFailed(true)}
        sx={{ display: 'block', width: '100%', height, objectFit: 'cover', bgcolor: 'var(--ct-subtle-bg)' }}
      />
    );
  }
  // No image: a shorter tinted band so text-only resources don't carry empty space.
  const bandHeight = typeof height === 'number' ? Math.round(height * 0.7) : { xs: 120, md: height.md };
  return (
    <Box
      aria-hidden="true"
      sx={{
        height: bandHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, var(--ct-tone-violet-bg) 0%, var(--ct-tone-blue-bg) 100%)',
        color: 'var(--ct-tone-violet-fg)',
      }}
    >
      <GraduationCap size={40} strokeWidth={1.5} />
    </Box>
  );
}

function Meta({ article }: { article: PublicArticle }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ color: 'var(--ct-text-secondary)', fontSize: 13 }}>
      <Box component="span" sx={{ fontWeight: 600, color: 'var(--ct-tone-violet-fg)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 12 }}>
        {KIND_LABEL[article.kind] || 'Article'}
      </Box>
      {article.read_minutes > 0 && (
        <Stack component="span" direction="row" spacing={0.5} alignItems="center">
          <Clock3 size={14} aria-hidden="true" />
          <span>{article.read_minutes} min read</span>
        </Stack>
      )}
    </Stack>
  );
}

function ArticleCard({ article, featured = false }: { article: PublicArticle; featured?: boolean }) {
  const date = publishedLabel(article.published_at);
  const byline = [article.author_name, date].filter(Boolean).join(' · ');
  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        borderRadius: 'var(--ct-card-radius)',
        borderColor: 'var(--ct-border-color)',
        bgcolor: 'var(--ct-surface-bg)',
        boxShadow: 'none',
        overflow: 'hidden',
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
        '&:hover': { borderColor: 'var(--ct-accent-strong)', boxShadow: '0 10px 28px rgba(6,18,58,0.08)' },
        '&:focus-within': { borderColor: 'var(--ct-accent-strong)' },
      }}
    >
      <ButtonBase
        component="a"
        href={articleUrl(article)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${article.title} (opens in a new tab)`}
        sx={{
          display: 'grid',
          gridTemplateColumns: featured ? { xs: '1fr', md: 'minmax(0, 1.15fr) minmax(0, 1fr)' } : '1fr',
          gridTemplateRows: featured ? undefined : 'auto 1fr',
          alignItems: 'stretch',
          width: '100%',
          height: '100%',
          textAlign: 'left',
          color: 'inherit',
          '&.Mui-focusVisible': { outline: '2px solid var(--ct-accent-strong)', outlineOffset: -2 },
        }}
      >
        <Cover article={article} height={featured ? { xs: 180, md: '100%' } : 160} />
        <Stack spacing={1.25} sx={{ p: featured ? { xs: 2.25, md: 3.5 } : 2.25, minWidth: 0, justifyContent: featured ? 'center' : 'flex-start' }}>
          {featured && (
            <Box component="span" sx={{ alignSelf: 'flex-start', px: 1.25, py: 0.4, borderRadius: '999px', bgcolor: 'var(--ct-tone-violet-bg)', color: 'var(--ct-tone-violet-fg)', fontSize: 12, fontWeight: 600 }}>
              Featured
            </Box>
          )}
          <Meta article={article} />
          <Typography
            component="h3"
            sx={{
              fontFamily: 'var(--ct-font-display)',
              fontWeight: 500,
              fontSize: featured ? { xs: 21, md: 26 } : 18,
              lineHeight: 1.25,
              color: 'var(--ct-text-primary)',
              overflowWrap: 'anywhere',
            }}
          >
            {article.title}
          </Typography>
          {article.excerpt && (
            <Typography
              sx={{
                color: 'var(--ct-text-secondary)',
                fontSize: 15,
                lineHeight: 1.55,
                display: '-webkit-box',
                WebkitLineClamp: featured ? 4 : 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {article.excerpt}
            </Typography>
          )}
          <Box sx={{ flex: 1 }} />
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ pt: 0.5 }}>
            <Typography variant="body2" noWrap sx={{ color: 'var(--ct-text-secondary)', minWidth: 0 }}>{byline}</Typography>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'var(--ct-accent-strong)', fontWeight: 600, fontSize: 14, flexShrink: 0 }}>
              <span>Read</span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </Stack>
          </Stack>
        </Stack>
      </ButtonBase>
    </Card>
  );
}

const grid = { display: 'grid', gap: { xs: 2, md: 2.5 }, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' } };

export default function LearningMaterialsPage() {
  const [articles, setArticles] = useState<PublicArticle[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [more, setMore] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [role, setRole] = useState<RoleOptions>();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('all');

  useEffect(() => {
    let active = true;
    setState('loading');
    chemistTaskerApi.publicContent
      .listArticles({ topic: 'learning' })
      .then((data) => {
        if (!active) return;
        setArticles(data.results || []);
        setMore(nextPage(data.next));
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  useEffect(() => {
    let active = true;
    chemistTaskerApi.marketplace
      .getListingOptions()
      .then((data) => {
        if (active) setRole(data as RoleOptions);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (!more) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const data = await chemistTaskerApi.publicContent.listArticles({ topic: 'learning', page: more });
      setArticles((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...(data.results || []).filter((a) => !seen.has(a.id))];
      });
      setMore(nextPage(data.next));
    } catch {
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [more]);

  const kindCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    articles.forEach((a) => {
      counts[a.kind] = (counts[a.kind] || 0) + 1;
    });
    return counts;
  }, [articles]);
  const kinds = Object.keys(kindCounts) as PublicArticle['kind'][];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (kind !== 'all' && a.kind !== kind) return false;
      if (!q) return true;
      return [a.title, a.excerpt, a.author_name].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [articles, kind, query]);

  const filtering = Boolean(query.trim()) || kind !== 'all';
  const featured = !filtering ? visible.find((a) => a.featured) || null : null;
  const rest = featured ? visible.filter((a) => a.id !== featured.id) : visible;
  const path = role?.role_code ? ROLE_PATH[role.role_code] : undefined;
  const hubUrl = `${publicOrigin()}/learning`;
  const countLabel = state === 'ready' && articles.length > 0
    ? `${articles.length}${more ? '+' : ''} ${articles.length === 1 ? 'resource' : 'resources'}`
    : undefined;

  return (
    <Box sx={{ maxWidth: 1240, mx: 'auto', width: '100%' }}>
      <PageHeader
        title="Learning materials"
        subtitle={
          <>
            Professional development and editorial resources from the pharmacy community.
            {countLabel && (
              <Box component="span" sx={{ color: 'var(--ct-text-primary)', fontWeight: 600 }}> {countLabel}.</Box>
            )}
          </>
        }
        actions={
          <Tooltip title="Blog, news and community discussions on the public site">
            <Button variant="outlined" href={hubUrl} target="_blank" rel="noopener noreferrer" endIcon={<ArrowUpRight size={16} />} sx={{ minHeight: 44 }}>
              Open learning hub
            </Button>
          </Tooltip>
        }
      />

      {path && (
        <Card
          variant="outlined"
          sx={{ mb: 2.5, p: { xs: 2, md: 2.5 }, borderRadius: 'var(--ct-card-radius)', borderColor: 'var(--ct-border-color)', bgcolor: 'var(--ct-surface-bg)', boxShadow: 'none' }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <IconTile icon={<GraduationCap />} tone="violet" />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ color: 'var(--ct-text-secondary)' }}>
                Your pathway{role?.role_label ? ` as ${role.role_label}` : ''}
              </Typography>
              <Typography sx={{ fontWeight: 600, color: 'var(--ct-text-primary)' }}>{path}</Typography>
            </Box>
          </Stack>
        </Card>
      )}

      {state === 'loading' && (
        <Box sx={grid} role="status" aria-busy="true" aria-label="Loading learning resources">
          {Array.from({ length: 6 }, (_, i) => (
            <Card key={i} variant="outlined" sx={{ borderRadius: 'var(--ct-card-radius)', borderColor: 'var(--ct-border-color)', boxShadow: 'none', overflow: 'hidden' }}>
              <Skeleton variant="rectangular" height={160} />
              <Box sx={{ p: 2.25 }}>
                <Skeleton width="35%" />
                <Skeleton height={30} />
                <Skeleton width="85%" />
                <Skeleton width="60%" />
              </Box>
            </Card>
          ))}
        </Box>
      )}

      {state === 'error' && (
        <DashboardContentState
          kind="error"
          title="Learning resources can't load right now"
          description="This is a connection problem, not an empty library. Your resources are safe."
          actionLabel="Try again"
          onAction={() => setLoadAttempt((n) => n + 1)}
        />
      )}

      {state === 'ready' && articles.length === 0 && (
        <DashboardContentState
          kind="empty"
          icon={<BookOpenCheck size={28} />}
          title="No learning resources yet"
          description="Resources the editorial team tags for learning will appear here. Meanwhile, community discussions are open in the hubs."
          actionLabel="Browse community hubs"
          onAction={() => window.open(`${publicOrigin()}/hubs`, '_blank', 'noopener')}
        />
      )}

      {state === 'ready' && articles.length > 0 && (
        <>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }} sx={{ mb: 2.5 }}>
            <TextField
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, topic or author"
              size="small"
              inputProps={{ 'aria-label': 'Search learning resources' }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search size={18} /></InputAdornment> }}
              sx={{ flex: 1, maxWidth: { md: 440 }, '& .MuiOutlinedInput-root': { minHeight: 44, borderRadius: '12px', bgcolor: 'var(--ct-surface-bg)' } }}
            />
            {kinds.length > 1 && (
              <Stack direction="row" spacing={1} role="group" aria-label="Resource type" flexWrap="wrap" useFlexGap>
                {(['all', ...kinds] as Kind[]).map((k) => {
                  const selected = kind === k;
                  const count = k === 'all' ? articles.length : kindCounts[k];
                  const label = k === 'all' ? 'All' : k === 'news' ? 'News' : 'Articles';
                  return (
                    <Button
                      key={k}
                      onClick={() => setKind(k)}
                      aria-pressed={selected}
                      startIcon={k === 'news' ? <Newspaper size={16} /> : k === 'blog' ? <BookOpenCheck size={16} /> : undefined}
                      sx={{
                        minHeight: 40,
                        px: 1.75,
                        borderRadius: '999px',
                        border: '1px solid',
                        borderColor: selected ? 'var(--ct-accent-strong)' : 'var(--ct-border-color)',
                        bgcolor: selected ? 'var(--ct-tone-violet-bg)' : 'var(--ct-surface-bg)',
                        color: selected ? 'var(--ct-tone-violet-fg)' : 'var(--ct-text-secondary)',
                        fontWeight: 600,
                      }}
                    >
                      {label} ({count})
                    </Button>
                  );
                })}
              </Stack>
            )}
          </Stack>

          {visible.length === 0 ? (
            <DashboardContentState
              kind="empty"
              compact
              icon={<Search size={26} />}
              title="No resources match"
              description={query.trim() ? `Nothing loaded matches “${query.trim()}”.` : 'Nothing of this type is published yet.'}
              actionLabel="Clear filters"
              onAction={() => {
                setQuery('');
                setKind('all');
              }}
            />
          ) : (
            <Stack spacing={{ xs: 2, md: 2.5 }}>
              {featured && <ArticleCard article={featured} featured />}
              {rest.length > 0 && (
                <Box sx={grid}>
                  {rest.map((article) => <ArticleCard key={article.id} article={article} />)}
                </Box>
              )}
            </Stack>
          )}

          {more && (
            <Stack alignItems="center" spacing={1} sx={{ mt: 3 }}>
              {moreError && (
                <Typography role="alert" variant="body2" sx={{ color: 'var(--ct-status-red-fg)' }}>
                  More resources couldn't load. Try again.
                </Typography>
              )}
              <Button variant="outlined" onClick={() => void loadMore()} disabled={loadingMore} sx={{ minHeight: 44, minWidth: 200 }}>
                {loadingMore ? 'Loading…' : 'Show more resources'}
              </Button>
            </Stack>
          )}

          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mt: 4, color: 'var(--ct-text-secondary)' }}>
            <Users size={16} aria-hidden="true" />
            <Typography variant="body2">
              Questions about a resource?{' '}
              <Box component="a" href={`${publicOrigin()}/hubs`} target="_blank" rel="noopener noreferrer" sx={{ color: 'var(--ct-accent-strong)', fontWeight: 600 }}>
                Discuss it in the community hubs
              </Box>
            </Typography>
          </Stack>
        </>
      )}
    </Box>
  );
}
