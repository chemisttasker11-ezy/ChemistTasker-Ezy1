// "To get verified" / "Your profile is verified" on the worker's profile screen: what Verified still needs (each item
// opens the screen that completes it) and the badges earned so far. Re-read whenever the screen regains focus.
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { REQUIREMENT_TEXT, getOnboardingDetail, normalizeVerification, type RequirementCode, type VerificationSummary } from '@chemisttasker/shared-core';
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

  useFocusEffect(useCallback(() => {
    let live = true;
    getOnboardingDetail(roleKey)
      .then((detail: any) => {
        if (!live) return;
        setSummary(normalizeVerification(detail?.verification));
        setSkillRole(role ?? detail?.role_type ?? null);
        setFailed(false);
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [roleKey, role]));

  if (failed && !summary) return null;
  const verified = Boolean(summary?.verified);
  return (
    <Card style={styles.card} accessibilityLabel={verified ? 'Your profile is verified' : 'To get verified'}>
      <Card.Content style={styles.content}>
        <View style={styles.header}>
          <MaterialCommunityIcons name={verified ? 'check-decagram' : 'circle-outline'} size={22} color={verified ? '#17663A' : '#5222B8'} />
          <Text variant="titleMedium" style={styles.title}>{verified ? 'Your profile is verified' : 'To get verified'}</Text>
        </View>
        <Text style={styles.subtitle}>
          {verified ? 'You can apply for public shifts and publish on the talent hub.' : 'Only these are required. Everything else earns badges and can be added any time.'}
        </Text>
        {!verified && summary?.missing.map(code => {
          const text = REQUIREMENT_TEXT[code];
          const route = routes[code];
          return (
            <Pressable key={code} disabled={!route} onPress={() => route && router.push(route as any)} accessibilityRole="button"
              accessibilityLabel={`${text?.title}. ${text?.body}`} style={({ pressed }) => [styles.requirement, pressed && styles.pressed]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.requirementTitle}>{text?.title ?? code}</Text>
                <Text style={styles.requirementBody}>{text?.body}</Text>
              </View>
              {route ? <MaterialCommunityIcons name="chevron-right" size={22} color="#5222B8" /> : null}
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
  card: { marginBottom: 16, borderRadius: 20, backgroundColor: '#FFFFFF' },
  content: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontWeight: '600', color: '#06214A' },
  subtitle: { fontSize: 13.5, lineHeight: 20, color: '#445474' },
  requirement: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#D5DCE8', minHeight: 44 },
  pressed: { backgroundColor: '#F5F8FC' },
  requirementTitle: { fontSize: 14, fontWeight: '600', color: '#06214A' },
  requirementBody: { fontSize: 13, lineHeight: 19, color: '#445474', marginTop: 2 },
  badgesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badgesTitle: { fontSize: 13, fontWeight: '600', color: '#06214A' },
});
