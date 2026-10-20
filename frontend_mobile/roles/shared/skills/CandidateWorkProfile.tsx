// A worker's profile as a manager sees it, the same as web CandidateProfile: in Review, after Reveal, and for booked
// workers in Confirmed and History. Photo, role, verification, bio, location, experience, rates and skills. Never contact
// details here; Confirmed adds them below (WorkerProfileDialog).
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Avatar, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { dispensaryQualifications, normalizeVerification, type ShiftWorkProfile } from '@chemisttasker/shared-core';
import { BadgeGuideButton, VerificationBadges } from './VerificationBadges';
import { WorkerSkillRows } from './WorkerSkillRows';

const RATES: [key: keyof NonNullable<ShiftWorkProfile['ratePreference']>, label: string][] = [['weekday', 'Weekday'], ['saturday', 'Saturday'], ['sunday', 'Sunday'], ['publicHoliday', 'Public holiday']];

const yearsSince = (iso?: string | null) => {
  if (!iso) return null;
  const years = Math.floor((Date.now() - new Date(iso).getTime()) / (365.25 * 86_400_000));
  return years >= 1 ? `${years} ${years === 1 ? 'year' : 'years'} registered` : 'Registered this year';
};

function Fact({ icon, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }) {
  return (
    <View style={styles.fact}>
      <MaterialCommunityIcons name={icon} size={16} color="#6B7A93" style={{ marginTop: 2 }} />
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

export function CandidateWorkProfile({ profile, name, bio }: { profile?: ShiftWorkProfile | null; name?: string; bio?: string | null }) {
  const p: Partial<ShiftWorkProfile> = profile || {};
  const role = [p.roleLabel, p.classification].filter(Boolean).join(' · ');
  const verification = normalizeVerification(p.verification, p.ahpra);
  const place = [p.suburb, p.state].filter(Boolean).join(', ');
  const travel = p.openToTravel
    ? `Open to travel${p.coverageRadiusKm ? ` up to ${p.coverageRadiusKm} km` : ''}${p.travelStates?.length ? ` · ${p.travelStates.join(', ')}` : ''}`
    : null;
  const experience = p.yearsExperience ? `${p.yearsExperience} years experience` : yearsSince(p.registeredSince);
  const rates = RATES.map(([key, label]) => (p.ratePreference?.[key] ? `${label} $${p.ratePreference[key]}/h` : null)).filter(Boolean);
  const qualification = dispensaryQualifications.find(item => item.value === p.dispensaryQualification);
  const initials = (name || '?').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();

  return (
    <View style={styles.profile}>
      {name ? (
        <View style={styles.header}>
          {p.profilePhoto ? <Image source={{ uri: p.profilePhoto }} style={styles.photo} accessibilityIgnoresInvertColors />
            : <Avatar.Text size={56} label={initials} style={{ backgroundColor: '#EEE8FC' }} color="#3C18A8" />}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{name}</Text>
            {role ? <Text style={styles.muted}>{role}</Text> : null}
          </View>
        </View>
      ) : role ? <Text style={styles.muted}>{role}</Text> : null}

      {verification ? (
        <View style={{ gap: 6 }}>
          <View style={styles.heading}><Text style={styles.title}>Verification</Text><BadgeGuideButton /></View>
          <VerificationBadges summary={verification} role={p.skillRole} />
        </View>
      ) : null}

      {bio ? <Text style={styles.bio}>{bio}</Text> : null}

      {place || travel ? <Fact icon="map-marker-outline" text={[place, travel].filter(Boolean).join(' · ')} /> : null}
      {experience ? <Fact icon="briefcase-outline" text={experience} /> : null}
      {rates.length ? <Fact icon="wallet-outline" text={`Preferred rates: ${rates.join(' · ')}`} /> : null}
      {qualification ? <Fact icon="school-outline" text={`Dispensing training: ${qualification.label}`} /> : null}

      <WorkerSkillRows skills={Array.isArray(p.skills) ? p.skills : []} verification={verification} />
    </View>
  );
}

const styles = StyleSheet.create({
  profile: { gap: 12, marginTop: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  photo: { width: 56, height: 56, borderRadius: 28 },
  name: { fontSize: 19, fontWeight: '600', color: '#06214A' },
  muted: { fontSize: 13.5, lineHeight: 20, color: '#445474', flexShrink: 1 },
  bio: { fontSize: 14.5, lineHeight: 22, color: '#06214A' },
  fact: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  title: { fontSize: 13, fontWeight: '800', color: '#06214A' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
