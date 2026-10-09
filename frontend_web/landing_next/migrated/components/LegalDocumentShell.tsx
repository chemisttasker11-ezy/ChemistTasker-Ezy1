'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Container, Paper, Stack, Typography } from '@mui/material';

type TocItem = { id: string; label: string };

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
}

export default function LegalDocumentShell({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate?: string;
  children: ReactNode;
}) {
  const articleRef = useRef<HTMLDivElement | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);

  useEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    const seen = new Set<string>();
    const headings = Array.from(root.querySelectorAll<HTMLElement>('h2,h3,h4,h5'));
    const items = headings
      .map((heading, index) => {
        const label = heading.textContent?.trim() || `Section ${index + 1}`;
        let id = heading.id || slugify(label) || `section-${index + 1}`;
        const base = id;
        let suffix = 2;
        while (seen.has(id)) id = `${base}-${suffix++}`;
        seen.add(id);
        heading.id = id;
        heading.style.scrollMarginTop = '110px';
        return { id, label };
      })
      .filter((item) => item.label);
    setToc(items);
  }, [children]);

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '240px minmax(0,1fr)' }, gap: { xs: 3, lg: 5 }, alignItems: 'start' }}>
        <Box
          component="aside"
          sx={{
            display: { xs: 'none', lg: 'block' },
            position: 'sticky',
            top: 112,
            border: '1px solid #E5ECF7',
            bgcolor: '#fff',
            borderRadius: 3,
            p: 2.25,
            maxHeight: 'calc(100vh - 140px)',
            overflow: 'auto',
          }}
        >
          <Typography sx={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', color: 'text.secondary', mb: 1.25 }}>
            On this page
          </Typography>
          <Stack component="nav" aria-label={`${title} sections`} spacing={.2}>
            {toc.map((item) => (
              <Box
                component="a"
                key={item.id}
                href={`#${item.id}`}
                sx={{
                  py: .7,
                  px: .9,
                  borderRadius: 1.5,
                  color: 'text.secondary',
                  fontSize: 12.5,
                  fontWeight: 700,
                  lineHeight: 1.35,
                  '&:hover': { bgcolor: '#F4F0FC', color: 'primary.main' },
                }}
              >
                {item.label}
              </Box>
            ))}
          </Stack>
        </Box>

        <Paper
          component="article"
          ref={articleRef}
          variant="outlined"
          sx={{
            p: { xs: 2.5, sm: 4, md: 5.5 },
            borderRadius: 4,
            boxShadow: '0 18px 48px rgba(6,18,58,.055)',
            '& p,& li': { fontSize: { xs: 14.5, md: 15.5 }, lineHeight: 1.8, color: 'text.secondary' },
            '& h5': { mt: 4.25, mb: 1.3, fontSize: { xs: 20, md: 23 } },
            '& a': { color: 'primary.main', textDecoration: 'underline', textUnderlineOffset: '3px' },
          }}
        >
          <Box sx={{ pb: 3, mb: 1, borderBottom: '1px solid #E5ECF7' }}>
            <Typography variant="h3" component="h1" sx={{ fontSize: { xs: 32, md: 42 } }}>
              {title}
            </Typography>
            {effectiveDate && (
              <Typography sx={{ mt: 1, color: 'text.secondary', fontSize: 13, fontWeight: 700 }}>
                {effectiveDate}
              </Typography>
            )}
          </Box>
          {children}
        </Paper>
      </Box>
    </Container>
  );
}
