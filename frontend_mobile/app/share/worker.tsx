import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Share, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Text } from 'react-native-paper';
import { BrandActivityIndicator as ActivityIndicator } from '@/components/ui/BrandActivityIndicator';
import { ShareQr } from '@/features/parity/ShareQr';
import { getPublicTalentFeed, type ExplorerPostApi } from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { colors, radius, space } from '@/constants/tokens';
import { publicWebOrigin } from '@/features/explore/webLinks';
import { getSessionGeneration } from '@/utils/authSession';

function nextPageUrl(next: string | null | undefined): number | null {
  const match = /[?&]page=(\d+)(?:[&#]|$)/.exec(next || '');
  return match && Number(match[1]) > 1 ? Number(match[1]) : null;
}

export default function ShareWorkerQr() {
  const router = useRouter();
  const { user } = useAuth();
  const [post, setPost] = useState<ExplorerPostApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showQr, setShowQr] = useState(false);
  const requestRef = useRef(0);
  const userId = Number(user?.id);
  const load = useCallback(async () => {
    const sessionGeneration = getSessionGeneration();
    const request = ++requestRef.current;
    setLoading(true); setError(''); setPost(null);
    try {
      if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('Sign in to share your public listing.');
      // Only data already present in the *public* talent feed may be QR-shared.
      // Private onboarding and identity documents are never exported.
      let page: number | null = 1;
      let found: ExplorerPostApi | null = null;
      for (let index = 0; index < 10 && page !== null && !found; index++) {
        if (sessionGeneration !== getSessionGeneration()) return;
        const response = await getPublicTalentFeed({ page, page_size: 100 }) as { results?: ExplorerPostApi[]; next?: string | null } | ExplorerPostApi[];
        if (request !== requestRef.current) return;
        const rows = Array.isArray(response) ? response : response.results || [];
        found = rows.find(row => Number(row.author_user_id) === userId && typeof row.reference_code === 'string' && /^[A-Za-z0-9_-]{4,100}$/.test(row.reference_code)) || null;
        page = Array.isArray(response) ? null : nextPageUrl(response.next);
      }
      if (request === requestRef.current) setPost(found);
    } catch (failure: any) {
      if (request === requestRef.current) setError(failure?.message || 'Public talent listing could not be verified.');
    } finally { if (request === requestRef.current) setLoading(false); }
  }, [userId]);
  useEffect(() => { void load(); return () => { requestRef.current += 1; }; }, [load]);

  const code = post?.reference_code || '';
  const profileLink = code ? publicWebOrigin() + '/talent/public-board?reference_code=' + encodeURIComponent(code) : '';
  const share = async () => {
    if (!profileLink) return;
    try { await Share.share({ message: profileLink }); }
    catch { setNotice('Sharing is not available on this device.'); }
  };

  return <SafeAreaView style={styles.page} edges={['top','left','right','bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      <Button icon="arrow-left" mode="text" onPress={() => router.back()}>Profile</Button>
      <Text variant="headlineMedium" style={styles.title}>Share my public worker card</Text>
      <Text style={styles.muted}>Only a listing already published to the public talent board may be shared. Private AHPRA, ID, payment and referee details are never included.</Text>
      {loading ? <ActivityIndicator accessibilityLabel="Checking published talent listing" /> :
       error ? <><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Button onPress={() => void load()}>Retry</Button></> :
       post ? <Card mode="outlined" style={styles.card}><Card.Content style={styles.group}>
        <Text variant="titleMedium">{post.role_title || post.headline || 'Pharmacy worker'}</Text>
        <Text style={styles.muted}>{[post.location_suburb,post.location_state].filter(Boolean).join(', ')}</Text>
        <Text selectable style={styles.muted}>{profileLink}</Text>
        <Button mode="contained" icon="qrcode" accessibilityLabel="Show my QR code" contentStyle={{ minHeight: 44 }} onPress={() => setShowQr(!showQr)}>Show my QR code</Button>
        {showQr ? <ShareQr kind="worker" value={code} origin={publicWebOrigin()} /> : null}
        <Button mode="outlined" icon="share-variant" onPress={() => void share()}>Share public link</Button>
      </Card.Content></Card> : <>
        <Text style={styles.muted}>No shareable public listing was found for this account. Publish a talent listing first and refresh. Anonymous or unpublished profiles cannot be shared by QR.</Text>
        <Button mode="outlined" onPress={() => void load()}>Check again</Button>
      </>}
      {notice ? <Text accessibilityRole="alert" style={styles.error}>{notice}</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space['3xl'] },
  title: { color: colors.textPrimary, fontWeight: '700' },
  muted: { color: colors.textSecondary, lineHeight: 22 },
  card: { backgroundColor: colors.surfaceBg, borderColor: colors.border, borderRadius: radius.card },
  group: { gap: space.md },
  error: { color: colors.status.red.fg },
});
