import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ArticleDetail } from '@/features/explore/ArticleDetail';

export default function PublicArticleRoute() {
  const params = useLocalSearchParams<{ slug: string }>();
  return <ArticleDetail slug={String(params.slug || '')} />;
}
