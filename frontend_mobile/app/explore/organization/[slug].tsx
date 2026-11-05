import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Button, Card, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPublicOrganization } from '@chemisttasker/shared-core';
import { colors, radius, space } from '@/constants/tokens';
import { publicWebUrl, safePublicUrl } from '@/features/explore/webLinks';

type PublicOrganization = { id: number; name: string; slug: string; about?: string | null; cover_image_url?: string | null };

export default function PublicOrganizationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = String(params.slug || '');
  const generation = useRef(0);
  const [organization, setOrganization] = useState<PublicOrganization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const request = ++generation.current;
    setError(''); setLoading(true); setOrganization(null);
    try {
      if (!slug) throw new Error('Organisation not specified.');
      const result = await getPublicOrganization(slug) as PublicOrganization;
      if (request === generation.current) setOrganization(result);
    } catch (failure: any) {
      if (request === generation.current) setError(failure?.message || 'Public organisation could not load.');
    } finally { if (request === generation.current) setLoading(false); }
  }, [slug]);
  useEffect(() => {
    let active = true;
    // Defer initial load until after effects subscribe; stale generations cannot overwrite state.
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; generation.current += 1; };
  }, [load]);

  const photo = safePublicUrl(organization?.cover_image_url, true);
  return <SafeAreaView style={styles.page} edges={['top','left','right','bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      <Button mode="text" icon="arrow-left" onPress={() => router.canGoBack() ? router.back() : router.replace('/explore' as any)}>Explore</Button>
      {loading ? <ActivityIndicator /> : error ? <View style={styles.block}>
        <Text accessibilityRole="alert" style={styles.error}>{error}</Text><Button onPress={() => void load()}>Retry</Button>
      </View> : !organization ? <Text>Organisation not found.</Text> : <>
        {photo ? <Image source={{ uri: photo }} accessibilityLabel={organization.name} resizeMode="cover" style={styles.cover} /> : null}
        <Text variant="headlineMedium" style={styles.title}>{organization.name}</Text>
        <Card mode="outlined" style={styles.card}><Card.Content style={styles.block}>
          <Text variant="titleLarge" style={styles.title}>About {organization.name}</Text>
          <Text style={styles.body}>{organization.about || 'This organisation will share more details soon.'}</Text>
        </Card.Content></Card>
        <Button mode="contained" onPress={() => router.push({ pathname: '/shifts/public-board', params: { organization: String(organization.id) } } as any)}>See public shifts</Button>
        <Button mode="outlined" onPress={() => void Share.share({ message: publicWebUrl('/organization/' + encodeURIComponent(organization.slug)) }).catch(() => {})}>Share organisation profile</Button>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space['3xl'] },
  title: { color: colors.textPrimary, fontWeight: '700' },
  card: { borderColor: colors.border, backgroundColor: colors.surfaceBg, borderRadius: radius.card },
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.card },
  block: { gap: space.md },
  body: { color: colors.textSecondary, lineHeight: 24, fontSize: 16 },
  error: { color: colors.status.red.fg },
});
