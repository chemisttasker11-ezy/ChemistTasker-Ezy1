// Verification badges for Expo, drawn like web (shared/VerificationBadges.tsx): the badge subject in the skill-symbol
// style (PNG from the same artwork) with a status medallion: green tick verified, blue clock pending, soft slate "!"
// not verified. States come from the backend; labels and explanations from shared-core.
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  VERIFICATION_GUIDE,
  evidenceExplainer,
  evidenceStateLabel,
  verificationRows,
  verifiedProfileExplainer,
  type BadgeAudience,
  type EvidenceState,
  type VerificationSummary,
} from '@chemisttasker/shared-core';
import { BADGE_SYMBOLS } from '../../../assets/skill-symbols';

type Mark = 'verified' | 'pending' | 'open';
const markOf = (state: EvidenceState): Mark => (state === 'verified' ? 'verified' : state === 'pending' ? 'pending' : 'open');
// Same fills as web MARK_COLORS.
const MARK: Record<Mark, { color: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = {
  verified: { color: '#12A150', icon: 'check-bold' },
  pending: { color: '#0B83D9', icon: 'clock-outline' },
  open: { color: '#7C889E', icon: 'exclamation-thick' },
};
const NOTE_COLOR: Record<Mark, string> = { verified: '#17663A', pending: '#0063A8', open: '#445474' };

/** The status medallion alone (also inside certificate-skill chips). */
export function StatusMark({ state, size = 12 }: { state: EvidenceState; size?: number }) {
  const look = MARK[markOf(state)];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: look.color, borderWidth: 1.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      <MaterialCommunityIcons name={look.icon} size={Math.round(size * 0.62)} color="#FFFFFF" />
    </View>
  );
}

/** A badge subject with its status medallion on the lower right. */
export function BadgeGlyph({ subject, state, size = 22 }: { subject: string; state?: EvidenceState; size?: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Image source={BADGE_SYMBOLS[subject] ?? BADGE_SYMBOLS.ID} style={{ width: size, height: size }} resizeMode="contain" accessible={false} />
      {state ? <View style={{ position: 'absolute', right: -size * 0.22, bottom: -size * 0.18 }}><StatusMark state={state} size={Math.round(size * 0.58)} /></View> : null}
    </View>
  );
}

type Item = { key: string; subject?: string; state?: EvidenceState; text: string; note?: string; title: string; body: string };

/** The person's badges. Tap one to read why; cards use `compact` (verified ones, the rest as "N not verified"). */
export function VerificationBadges({ summary, role, audience = 'employer', compact = false }: {
  summary: VerificationSummary | null; role?: string | null; audience?: BadgeAudience; compact?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!summary) return null;
  const rows = verificationRows(summary, audience);
  const others = rows.filter(row => row.state !== 'verified');
  const profileTitle = summary.verified ? 'Verified profile' : 'Profile not verified';
  const items: Item[] = [{
    key: 'profile', subject: 'PROFILE', state: summary.verified ? 'verified' : 'not_supplied', text: profileTitle, title: profileTitle,
    body: summary.verified ? verifiedProfileExplainer(role) : 'Email or mobile not confirmed yet, so this profile cannot apply for public shifts.',
  }];
  for (const row of compact ? rows.filter(r => r.state === 'verified') : rows) {
    items.push({ key: row.code, subject: row.code, state: row.state, title: `${row.label}: ${row.stateLabel}`, body: row.explainer,
      text: row.label, note: row.state === 'verified' ? undefined : row.stateLabel });
  }
  if (compact && others.length) {
    items.push({ key: 'others', state: 'not_supplied', text: `${others.length} not verified`, title: `${others.length} not verified`,
      body: `${others.map(row => row.label).join(', ')}. Open the profile to see why, or check these yourself after you match.` });
  }
  if (summary.overseas) {
    items.push({ key: 'overseas', subject: 'OVERSEAS', text: 'Overseas', title: 'Overseas',
      body: VERIFICATION_GUIDE.items.find(item => item.term === 'Overseas')?.text || '' });
  }
  if (summary.under18) {
    items.push({ key: 'under18', subject: 'UNDER_18', text: 'Under 18', title: 'Under 18',
      body: VERIFICATION_GUIDE.items.find(item => item.term === 'Under 18')?.text || '' });
  }
  const selected = items.find(item => item.key === open);
  return (
    <View style={styles.wrap} accessibilityLabel="Verification badges">
      <View style={styles.row}>
        {items.map(item => (
          <Pressable key={item.key} onPress={() => setOpen(open === item.key ? null : item.key)} accessibilityRole="button"
            accessibilityState={{ expanded: open === item.key }} accessibilityLabel={`${item.title}. ${item.body}`} hitSlop={6}
            style={({ pressed }) => [styles.pill, (pressed || open === item.key) && styles.pillActive]}>
            {item.subject ? <BadgeGlyph subject={item.subject} state={item.state} /> : item.state ? <StatusMark state={item.state} size={16} /> : null}
            <Text style={styles.pillText}>{item.text}{item.note && item.state
              ? <Text style={[styles.pillNote, { color: NOTE_COLOR[markOf(item.state)] }]}> · {item.note}</Text> : null}</Text>
          </Pressable>
        ))}
      </View>
      {selected ? <Text style={styles.explainer} accessibilityLiveRegion="polite"><Text style={styles.explainerTitle}>{selected.title}. </Text>{selected.body}</Text> : null}
    </View>
  );
}

/** A document's state with its explanation written out (worker screens, where the reason is the point). */
export function EvidenceStatus({ label, state, explainer, code }: { label: string; state: EvidenceState; explainer: string; code?: string }) {
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`${label}: ${evidenceStateLabel(state)}. ${explainer}`}>
      <View style={[styles.pill, { alignSelf: 'flex-start' }]}>
        <BadgeGlyph subject={code ?? 'ID'} state={state} />
        <Text style={styles.pillText}>{label}{state === 'verified' ? null
          : <Text style={[styles.pillNote, { color: NOTE_COLOR[markOf(state)] }]}> · {evidenceStateLabel(state)}</Text>}</Text>
      </View>
      <Text style={{ fontSize: 12.5, lineHeight: 18, color: '#445474' }}>{explainer}</Text>
    </View>
  );
}

/** Small state icon inside a certificate skill's chip; skills without a certificate show none. */
export function SkillEvidenceIcon({ state, audience = 'employer' }: { state: EvidenceState | null; audience?: BadgeAudience }) {
  if (!state) return null;
  return (
    <View accessible accessibilityLabel={`${evidenceStateLabel(state)}. ${evidenceExplainer(state, audience)}`}>
      <StatusMark state={state} size={14} />
    </View>
  );
}

// Guide sample per term: the same artwork people meet on the cards.
const GUIDE_SAMPLE: Record<string, { subject: string; state?: EvidenceState }> = {
  'Verified profile': { subject: 'PROFILE', state: 'verified' },
  Verified: { subject: 'ID', state: 'verified' },
  'Check pending': { subject: 'ID', state: 'pending' },
  'Not verified': { subject: 'ID', state: 'not_supplied' },
  Overseas: { subject: 'OVERSEAS' },
  'Under 18': { subject: 'UNDER_18' },
};

/** "What do badges mean?" on every employer screen that shows badges. */
export function BadgeGuideButton({ label = VERIFICATION_GUIDE.title }: { label?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Button mode="text" icon="information-outline" compact onPress={() => setVisible(true)} accessibilityLabel={label}>
        {label}
      </Button>
      <Portal>
        <Dialog visible={visible} onDismiss={() => setVisible(false)}>
          <Dialog.Title>{VERIFICATION_GUIDE.title}</Dialog.Title>
          <Dialog.ScrollArea style={styles.guideScroll}>
            <View style={styles.guide}>
              <Text style={styles.guideIntro}>{VERIFICATION_GUIDE.intro}</Text>
              {VERIFICATION_GUIDE.items.map(item => {
                const sample = GUIDE_SAMPLE[item.term];
                return (
                  <View key={item.term} style={styles.guideItem}>
                    <View style={styles.guideGlyph}>{sample ? <BadgeGlyph subject={sample.subject} state={sample.state} size={26} /> : null}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.guideTerm}>{item.term}</Text>
                      <Text style={styles.guideText}>{item.text}</Text>
                    </View>
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
  pill: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 34, paddingLeft: 7, paddingRight: 12, borderRadius: 999,
    borderWidth: 1, borderColor: '#DCE3EE', backgroundColor: '#FFFFFF' },
  pillActive: { borderColor: '#8A97AD' },
  pillText: { fontSize: 12.5, fontWeight: '600', color: '#06214A' },
  pillNote: { fontWeight: '500' },
  explainer: { fontSize: 13, lineHeight: 19, color: '#06214A', backgroundColor: '#F5F8FC', borderRadius: 12, padding: 10 },
  explainerTitle: { fontWeight: '600' },
  guideScroll: { paddingHorizontal: 0, maxHeight: 460 },
  guide: { paddingHorizontal: 24, paddingVertical: 8, gap: 12 },
  guideIntro: { fontSize: 13.5, lineHeight: 20, color: '#445474' },
  guideItem: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  guideGlyph: { width: 30, paddingTop: 2 },
  guideTerm: { fontSize: 13.5, fontWeight: '600', color: '#06214A' },
  guideText: { fontSize: 13, lineHeight: 19, color: '#445474', marginTop: 2 },
});
