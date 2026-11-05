import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Text } from 'react-native-paper';
import { colors, radius, space, touch } from '@/constants/tokens';
import { openCalculatorWebsite, openWebPage } from '@/features/explore/webLinks';

const items = [
  { title: 'Learning resources', description: 'Pharmacy learning and professional development.', route: '/explore/learning' },
  { title: 'Blog', description: 'Perspectives, stories and career advice.', route: '/explore/blog' },
  { title: 'News', description: 'Industry news and pharmacy updates.', route: '/explore/news' },
  { title: 'Community hubs', description: 'Public discussions and community updates.', route: '/explore/hubs' },
  { title: 'Find talent', description: 'Read public pharmacy talent profiles.', route: '/explore/talent-board' },
];

export default function ExploreIndex() {
  const router = useRouter();
  const [error, setError] = useState('');
  const visit = async (action: () => Promise<void>) => {
    setError('');
    try { await action(); } catch { setError('The website could not be opened. Please check your connection and retry.'); }
  };
  return <SafeAreaView style={styles.page} edges={['top', 'left', 'right', 'bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      <Button mode="text" icon="arrow-left" onPress={() => router.canGoBack() ? router.back() : router.replace('/' as any)}>Back</Button>
      <Text variant="headlineMedium" style={styles.title}>Explore ChemistTasker</Text>
      <Text style={styles.subtitle}>Learn, read and discover community conversations. Everyone can browse.</Text>
      {items.map(item => <Card key={item.route} mode="outlined" style={styles.card}
        onPress={() => router.push(item.route as any)} accessibilityLabel={item.title}>
        <Card.Content style={styles.row}><View style={styles.copy}>
          <Text variant="titleMedium" style={styles.title}>{item.title}</Text>
          <Text style={styles.subtitle}>{item.description}</Text>
        </View><Text style={styles.arrow}>›</Text></Card.Content>
      </Card>)}
      <Card mode="outlined" style={styles.card}><Card.Content style={styles.copy}>
        <Text variant="titleMedium" style={styles.title}>Paediatric anti-infective calculator</Text>
        <Text style={styles.subtitle}>Opens the website in your phone browser. Clinical validation is pending.</Text>
        <Button mode="outlined" icon="open-in-new" onPress={() => void visit(openCalculatorWebsite)}>Open website</Button>
      </Card.Content></Card>
      <Button mode="text" onPress={() => void visit(() => openWebPage('/pricing'))}>Pricing</Button>
      <Button mode="text" onPress={() => void visit(() => openWebPage('/pricing/organization'))}>Organisation pricing</Button>
      <Button mode="text" onPress={() => void visit(() => openWebPage('/terms-of-service'))}>Terms of Service</Button>
      <Button mode="text" onPress={() => void visit(() => openWebPage('/privacy-policy'))}>Privacy Policy</Button>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, paddingBottom: space['3xl'], gap: space.md },
  title: { color: colors.textPrimary, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, lineHeight: 21, flexShrink: 1 },
  card: { backgroundColor: colors.surfaceBg, borderColor: colors.border, borderRadius: radius.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: touch.min },
  copy: { flex: 1, gap: space.xs },
  arrow: { fontSize: 24, color: colors.primary },
  error: { color: colors.status.red.fg },
});
