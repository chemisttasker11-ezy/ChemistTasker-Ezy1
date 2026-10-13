// Verification badges for Expo. States come from the backend; labels and explanations from shared-core.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  VERIFICATION_GUIDE,
  evidenceExplainer,
  evidenceStateLabel,
  verificationRows,
  verifiedProfileExplainer,
  type BadgeAudience,
  type BadgeTone,
  type EvidenceState,
  type VerificationSummary,
} from '@chemisttasker/shared-core';

// Same AA pairs as the web light theme.
const TONES: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  success: { bg: '#E4F5EA', fg: '#17663A', border: '#E4F5EA' },
  info: { bg: '#E6F1FC', fg: '#0063A8', border: '#E6F1FC' },
  warning: { bg: '#FDF0D9', fg: '#8A4B00', border: '#FDF0D9' },
  neutral: { bg: '#FFFFFF', fg: '#445474', border: '#D5DCE8' },
};
const STATE_TONE: Record<EvidenceState, BadgeTone> = { verified: 'success', pending: 'info', failed: 'warning', not_supplied: 'neutral' };
const STATE_ICON: Record<EvidenceState, keyof typeof MaterialCommunityIcons.glyphMap> = {
  verified: 'check-decagram-outline', pending: 'clock-outline', failed: 'alert-circle-outline', not_supplied: 'circle-outline',
};

type Item = { key: string; text: string; tone: BadgeTone; icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; body: string };

/** The person's badges. Tap one to read why; cards use `compact` (verified ones, the rest as "N not verified"). */
export function VerificationBadges({ summary, role, audience = 'employer', compact = false }: {
  summary: VerificationSummary | null; role?: string | null; audience?: BadgeAudience; compact?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!summary) return null;
  const rows = verificationRows(summary, audience);
  const others = rows.filter(row => row.state !== 'verified');
  const items: Item[] = [{
    key: 'profile', tone: summary.verified ? 'success' : 'neutral', icon: summary.verified ? 'check-decagram' : 'circle-outline',
    text: summary.verified ? 'Verified profile' : 'Profile not verified', title: summary.verified ? 'Verified profile' : 'Profile not verified',
    body: summary.verified ? verifiedProfileExplainer(role) : 'Email or mobile not confirmed yet, so this profile cannot apply for public shifts.',
  }];
  for (const row of compact ? rows.filter(r => r.state === 'verified') : rows) {
    items.push({ key: row.code, tone: row.tone, icon: STATE_ICON[row.state], title: `${row.label}: ${row.stateLabel}`, body: row.explainer,
      text: row.state === 'verified' ? row.label : `${row.label} · ${row.stateLabel}` });
  }
  if (compact && others.length) {
    items.push({ key: 'others', tone: 'neutral', icon: 'circle-outline', text: `${others.length} not verified`, title: `${others.length} not verified`,
      body: `${others.map(row => row.label).join(', ')}. Open the profile to see why, or check these yourself after you match.` });
  }
  if (summary.overseas) {
    items.push({ key: 'overseas', tone: 'neutral', icon: 'earth', text: 'Overseas', title: 'Overseas',
      body: VERIFICATION_GUIDE.items.find(item => item.term === 'Overseas')?.text || '' });
  }
  const selected = items.find(item => item.key === open);
  return (
    <View style={styles.wrap} accessibilityLabel="Verification badges">
      <View style={styles.row}>
        {items.map(item => {
          const look = TONES[item.tone];
          return (
            <Pressable key={item.key} onPress={() => setOpen(open === item.key ? null : item.key)} accessibilityRole="button"
              accessibilityState={{ expanded: open === item.key }} accessibilityLabel={`${item.title}. ${item.body}`} hitSlop={6}
              style={[styles.pill, { backgroundColor: look.bg, borderColor: look.border }]}>
              <MaterialCommunityIcons name={item.icon} size={15} color={look.fg} />
              <Text style={[styles.pillText, { color: look.fg }]}>{item.text}</Text>
            </Pressable>
          );
        })}
      </View>
      {selected ? <Text style={styles.explainer} accessibilityLiveRegion="polite"><Text style={styles.explainerTitle}>{selected.title}. </Text>{selected.body}</Text> : null}
    </View>
  );
}

/** Small state icon inside a certificate skill's chip; skills without a certificate show none. */
export function SkillEvidenceIcon({ state, audience = 'employer' }: { state: EvidenceState | null; audience?: BadgeAudience }) {
  if (!state) return null;
  return <MaterialCommunityIcons name={STATE_ICON[state]} size={14} color={TONES[STATE_TONE[state]].fg}
    accessibilityLabel={`${evidenceStateLabel(state)}. ${evidenceExplainer(state, audience)}`} />;
}

/** "What do badges mean?" on every employer screen that shows badges. */
export function BadgeGuideButton() {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Button mode="text" icon="information-outline" compact onPress={() => setVisible(true)} accessibilityLabel={VERIFICATION_GUIDE.title}>
        {VERIFICATION_GUIDE.title}
      </Button>
      <Portal>
        <Dialog visible={visible} onDismiss={() => setVisible(false)}>
          <Dialog.Title>{VERIFICATION_GUIDE.title}</Dialog.Title>
          <Dialog.ScrollArea style={styles.guideScroll}>
            <View style={styles.guide}>
              <Text style={styles.guideIntro}>{VERIFICATION_GUIDE.intro}</Text>
              {VERIFICATION_GUIDE.items.map(item => {
                const look = TONES[item.tone];
                return (
                  <View key={item.term} style={styles.guideItem}>
                    <View style={[styles.pill, styles.guideTerm, { backgroundColor: look.bg, borderColor: look.border }]}>
                      <Text style={[styles.pillText, { color: look.fg }]}>{item.term}</Text>
                    </View>
                    <Text style={styles.guideText}>{item.text}</Text>
                  </View>
                );
              })}
              <Text style={styles.guideIntro}>{VERIFICATION_GUIDE.footnote}</Text>
            </View>
          </Dialog.ScrollArea>
          <Dialog.Actions><Button onPress={() => setVisible(false)}>Close</Button></Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 30, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  pillText: { fontSize: 12.5, fontWeight: '600' },
  explainer: { fontSize: 13, lineHeight: 19, color: '#06214A', backgroundColor: '#F5F8FC', borderRadius: 12, padding: 10 },
  explainerTitle: { fontWeight: '600' },
  guideScroll: { paddingHorizontal: 0, maxHeight: 460 },
  guide: { paddingHorizontal: 24, paddingVertical: 8, gap: 12 },
  guideIntro: { fontSize: 13.5, lineHeight: 20, color: '#445474' },
  guideItem: { gap: 4 },
  guideTerm: { alignSelf: 'flex-start' },
  guideText: { fontSize: 13.5, lineHeight: 20, color: '#06214A' },
});
