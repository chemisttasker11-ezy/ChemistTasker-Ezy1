// "To get verified" / "Your profile is verified" on the worker's profile screen: what Verified still needs (each item
// opens the screen that completes it) and the badges earned so far. Re-read whenever the screen regains focus.
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, Text } from 'react-native-paper';
import { CheckCircle2, Circle, ChevronRight } from 'lucide-react-native';
import { colors, font, radius, space, touch } from '@/constants/tokens';
import { useFocusEffect, useRouter } from 'expo-router';
import { REQUIREMENT_TEXT, getOnboardingDetail, normalizeVerification, outstandingText, type RequirementCode, type VerificationSummary } from '@chemisttasker/shared-core';
import { BadgeGuideButton, VerificationBadges } from './VerificationBadges';

export function ProfileVerificationCard({ roleKey, role, routes }: {
  roleKey: 'pharmacist' | 'otherstaff' | 'explorer';
  role?: string | null;
  /** Screen that completes each requirement. */
  routes: Partial<Record<RequirementCode, string>>;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState<VerificationSummary | null>(null);
  const [skillRole, setSkillRole] = useState<string | null>(role ?? null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(useCallback(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    getOnboardingDetail(roleKey)
      .then((detail: any) => {
        if (!live) return;
        setSummary(normalizeVerification(detail?.verification, detail?.ahpra));
        setSkillRole(role ?? detail?.role_type ?? null);
        setFailed(false);
      })
      .catch(() => { if (live) setFailed(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [roleKey, role, refreshKey]));

  if (loading && !summary) return (
    <Card style={styles.card} accessibilityLabel="Checking your verification">
      <Card.Content style={styles.content}>
        <View style={styles.header}>
          <ActivityIndicator accessibilityLabel="Loading verification status" />
          <Text style={styles.title}>Checking verification</Text>
        </View>
      </Card.Content>
    </Card>
  );
  if (failed && !summary) return (
    <Card style={styles.card} accessibilityLabel="Verification status unavailable">
      <Card.Content style={styles.content}>
        <Text accessibilityRole="alert" style={styles.title}>Verification status unavailable</Text>
        <Text style={styles.subtitle}>Your saved details are still available. Check your connection to refresh the current requirements and badges.</Text>
        <Button mode="outlined" contentStyle={{ minHeight: touch.min }} onPress={() => setRefreshKey(current => current + 1)}>Try again</Button>
      </Card.Content>
    </Card>
  );
  const verified = Boolean(summary?.verified);
  // Verified profiles list only what a tightening asks for by its grace date ("References needed by ...").
  const due = (verified ? summary?.outstanding : summary?.missing) ?? [];
  return (
    <Card style={styles.card} accessibilityLabel={verified ? 'Your profile is verified' : 'To get verified'}>
      <Card.Content style={styles.content}>
        <View style={styles.header}>
          {verified ? <CheckCircle2 size={22} color={colors.status.green.fg} accessibilityElementsHidden /> : <Circle size={22} color={colors.primary} accessibilityElementsHidden />}
          <Text variant="titleMedium" style={styles.title}>{verified ? 'Your profile is verified' : 'To get verified'}</Text>
        </View>
        <Text style={styles.subtitle}>
          {verified ? outstandingText(summary) ?? 'You can apply for public shifts and publish on the talent hub.' : 'Only these are required. Everything else earns badges and can be added any time.'}
        </Text>
        {failed ? <View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>Latest verification status could not be refreshed.</Text><Button mode="outlined" onPress={() => setRefreshKey(current => current + 1)} disabled={loading}>Retry</Button></View> : null}
        {due.map(code => {
          const text = REQUIREMENT_TEXT[code];
          const route = routes[code];
          return (
            <Pressable key={code} disabled={!route} onPress={() => route && router.push(route as any)} accessibilityRole="button"
              accessibilityLabel={`${text?.title}. ${text?.body}`} style={({ pressed }) => [styles.requirement, pressed && styles.pressed]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.requirementTitle}>{text?.title ?? code}</Text>
                <Text style={styles.requirementBody}>{text?.body}</Text>
              </View>
              {route ? <ChevronRight size={22} color={colors.primary} accessibilityElementsHidden /> : null}
            </Pressable>
          );
        })}
        {summary ? (
          <View style={{ gap: 4 }}>
            <View style={styles.badgesHeader}>
              <Text style={styles.badgesTitle}>Your badges</Text>
              <BadgeGuideButton label="What pharmacies see" />
            </View>
            <VerificationBadges summary={summary} role={skillRole} audience="worker" />
          </View>
        ) : null}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space.lg, borderRadius: radius.card, backgroundColor: colors.surfaceBg, borderWidth: 1, borderColor: colors.border },
  content: { gap: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { fontFamily: font.outfit.medium, color: colors.brandNavy },
  subtitle: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  requirement: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.nested, borderWidth: 1, borderColor: colors.border, minHeight: touch.min },
  pressed: { backgroundColor: colors.pressBg },
  requirementTitle: { fontSize: 14, fontFamily: font.inter.semiBold, color: colors.brandNavy },
  requirementBody: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: space.xxs },
  badgesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badgesTitle: { fontSize: 13, fontFamily: font.inter.semiBold, color: colors.brandNavy },
  error: { padding: space.md, borderRadius: radius.nested, borderWidth: 1, borderColor: colors.status.red.fg, backgroundColor: colors.status.red.bg, gap: space.sm },
  errorText: { color: colors.status.red.fg },
});
