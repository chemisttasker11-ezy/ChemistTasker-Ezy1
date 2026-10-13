import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Chip, Text } from 'react-native-paper';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import { groupWorkProfileSkills, skillLabel, dispensaryQualifications, normalizeVerification, skillEvidenceState, type ShiftWorkProfile } from '@chemisttasker/shared-core';
import { SkillIcon } from '../../../components/SkillIcon';
import { BadgeGuideButton, SkillEvidenceIcon, VerificationBadges } from './VerificationBadges';

export function CandidateWorkProfile({ profile }: { profile?: ShiftWorkProfile | null }) {
  if (!profile) return null;
  const groups = groupWorkProfileSkills(registry as any, profile.skills || []);
  const role = [profile.roleLabel, profile.classification].filter(Boolean).join(' · ');
  const qualification = dispensaryQualifications.find(item => item.value === profile.dispensaryQualification);
  const verification = normalizeVerification(profile.verification);
  return <View style={styles.profile}>
    {role ? <Text>{role}</Text> : null}
    {[profile.suburb, profile.state].filter(Boolean).length ? <Text>{[profile.suburb, profile.state].filter(Boolean).join(', ')}</Text> : null}
    {profile.yearsExperience ? <Text>{profile.yearsExperience} years experience</Text> : null}
    {profile.registeredSince ? <Text>Registered since {profile.registeredSince}</Text> : null}
    {qualification ? <Text>Dispensing training: {qualification.label}</Text> : null}
    {verification ? <View>
      <View style={styles.heading}><Text style={styles.title}>Verification</Text><BadgeGuideButton /></View>
      <VerificationBadges summary={verification} role={profile.skillRole} />
    </View> : null}
    {Object.entries(groups).map(([group, codes]) => <View key={group}>
      <Text style={styles.title}>{group === 'Software & Digital' ? 'Software' : group === 'other' ? 'Skills to review' : group}</Text>
      <View style={styles.chips}>{codes.map(code => <Chip key={code} compact icon={() => <SkillIcon skill={code} size={18} />}>{skillLabel(registry as any, code)} <SkillEvidenceIcon state={skillEvidenceState(verification, code)} /></Chip>)}</View>
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  profile: { gap: 10, marginTop: 10 },
  title: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
