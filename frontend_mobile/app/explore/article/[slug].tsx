import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ArticleDetail } from '@/features/explore/ArticleDetail';
import { useAuth } from '@/context/AuthContext';

export default function PublicArticleRoute() {
  const params = useLocalSearchParams<{ slug: string }>();
  const { user } = useAuth();
  const slug = String(params.slug || '');
  return <ArticleDetail key={`${user?.id ?? 'anonymous'}:${slug}`} slug={slug} />;
}
