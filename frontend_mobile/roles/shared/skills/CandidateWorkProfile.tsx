import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Chip, Text } from 'react-native-paper';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import { groupWorkProfileSkills, skillLabel, workProfileSkillVerification, dispensaryQualifications, type ShiftWorkProfile } from '@chemisttasker/shared-core';
import { SkillIcon } from '../../../components/SkillIcon';

export function CandidateWorkProfile({ profile }: { profile?: ShiftWorkProfile | null }) {
  if (!profile) return null;
  const groups = groupWorkProfileSkills(registry as any, profile.skills || []);
  const role = [profile.roleLabel, profile.classification].filter(Boolean).join(' · ');
  const qualification = dispensaryQualifications.find(item => item.value === profile.dispensaryQualification);
  const checks = [profile.verified && 'Profile verified', profile.ahpraVerified && 'Registration verified', profile.govIdVerified && 'ID verified', profile.abnVerified && 'ABN verified'].filter(Boolean) as string[];
  return <View style={styles.profile}>
    {role ? <Text>{role}</Text> : null}
    {[profile.suburb, profile.state].filter(Boolean).length ? <Text>{[profile.suburb, profile.state].filter(Boolean).join(', ')}</Text> : null}
    {profile.yearsExperience ? <Text>{profile.yearsExperience} years experience</Text> : null}
    {profile.registeredSince ? <Text>Registered since {profile.registeredSince}</Text> : null}
    {qualification ? <Text>{qualification.label} · {profile.dispensaryQualificationVerified ? 'Verified' : 'Claimed · not verified'}</Text> : null}
    {checks.length ? <View style={styles.chips}>{checks.map(label => <Chip key={label} compact>{label}</Chip>)}</View> : null}
    {Object.entries(groups).map(([group, codes]) => <View key={group}>
      <Text style={styles.title}>{group === 'Software & Digital' ? 'Software' : group === 'other' ? 'Skills to review' : group}</Text>
      <View style={styles.chips}>{codes.map(code => <Chip key={code} compact icon={() => <SkillIcon skill={code} size={18} />}>{[skillLabel(registry as any, code),workProfileSkillVerification(registry as any,profile,code)].filter(Boolean).join(' · ')}</Chip>)}</View>
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  profile: { gap: 10, marginTop: 10 },
  title: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
