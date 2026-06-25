import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Chip, IconButton, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Candidate } from '../types';

const formatDate = (date: string) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export default function TalentCardV2({
  candidate,
  onViewCalendar,
  onRequestBooking,
  onToggleLike,
  canViewAvailability,
  canRequestBooking,
}: {
  candidate: Candidate;
  onViewCalendar: (candidate: Candidate) => void;
  onRequestBooking: (candidate: Candidate) => void;
  onToggleLike: (candidate: Candidate) => void;
  canViewAvailability?: boolean;
  canRequestBooking?: boolean;
}) {
  const availableDateLabels = (candidate.availableDates || []).map(formatDate).filter(Boolean);
  const visibleDateLabels = availableDateLabels.slice(0, 3);
  const remainingDates = Math.max(availableDateLabels.length - visibleDateLabels.length, 0);
  const showCalendarButton = (candidate.availableDates || []).length > 0;
  const isFullTimeApplication = Boolean(candidate.isFullTimeApplication || candidate.postKind === 'FULL_TIME_APPLICATION');
  const travelStateLabel =
    candidate.willingToTravel && (candidate.travelStates || []).length > 0
      ? `Open to Travel: ${(candidate.travelStates || []).join(', ')}`
      : candidate.willingToTravel
        ? 'Open to Travel'
        : candidate.coverageRadius;
  const roleLower = (candidate.role || '').toLowerCase();
  const isStudentLike = roleLower.includes('student') || roleLower.includes('intern');
  const isPharmacist = roleLower.includes('pharmacist');
  const iconColor = isStudentLike ? '#16A34A' : isPharmacist ? '#4F46E5' : '#D97706';
  const avatarBg = isStudentLike ? '#ECFDF3' : isPharmacist ? '#EEF2FF' : '#FFFBEB';
  const avatarBorder = isStudentLike ? '#86EFAC' : isPharmacist ? '#C7D2FE' : '#FDE68A';
  const roleIconName = isStudentLike ? 'school-outline' : isPharmacist ? 'pill' : 'briefcase-outline';

  return (
    <Card mode="outlined" style={styles.card}>
      <View style={styles.topBar}>
        <View style={styles.topRow}>
          <Text variant="bodyMedium" style={styles.cityText}>{candidate.city || candidate.state}</Text>
          <Text style={styles.ref}>{candidate.refId}</Text>
        </View>
        <View style={styles.topMetaRow}>
          <Chip compact style={styles.travelChip}>{travelStateLabel}</Chip>
        </View>
      </View>

      <Card.Content style={styles.content}>
        <View style={styles.identityRow}>
          <View style={styles.identityLeft}>
            <View style={[styles.avatarCircle, { backgroundColor: avatarBg, borderColor: avatarBorder }]}>
              <MaterialCommunityIcons name={roleIconName as any} size={28} color={iconColor} />
            </View>
            <View style={styles.roleBlock}>
              <View style={styles.roleRow}>
                <Text variant="titleMedium" style={styles.role}>{candidate.role}</Text>
                {candidate.experienceBadge ? <Chip compact>{candidate.experienceBadge}</Chip> : null}
              </View>
            </View>
          </View>
          <Text style={styles.rating}>★ {candidate.ratingAverage.toFixed(1)} ({candidate.ratingCount})</Text>
        </View>

        <View>
          <Text variant="bodySmall" style={styles.subtle}>{candidate.headline}</Text>
        </View>
        {candidate.pitch ? <Text style={styles.pitch}>"{candidate.pitch}"</Text> : null}

        <View style={styles.detailsCol}>
          <View style={styles.headerMetaRow}>
            <View style={styles.engagementRow}>
            <Chip compact style={styles.engagementChip}>
              Engagement: {candidate.workTypes.length ? candidate.workTypes.join(', ') : '-'}
            </Chip>
          </View>
          </View>

          <View style={styles.availabilityBox}>
            <View style={styles.availabilityHeader}>
              <Text variant="bodyMedium">{isFullTimeApplication ? 'Open to Opportunities' : 'Availability'}</Text>
              {!isFullTimeApplication && showCalendarButton && canViewAvailability !== false ? (
                <Button compact onPress={() => onViewCalendar(candidate)} textColor="#4F46E5">View Calendar</Button>
              ) : null}
            </View>

            {isFullTimeApplication ? (
              <Text variant="bodySmall" style={styles.subtle}>Open anytime</Text>
            ) : showCalendarButton ? (
              <Text variant="bodySmall" style={styles.subtle}>
                Dates: {visibleDateLabels.join(', ')}{remainingDates > 0 ? ` +${remainingDates}` : ''}
              </Text>
            ) : (
              <Text variant="bodySmall" style={styles.subtle}>No dates shared yet</Text>
            )}
          </View>

          {!candidate.isExplorer ? (
            <View style={styles.skillsBlock}>
              <Text style={styles.skillTitle}>Clinical Services: {candidate.clinicalServices.length ? candidate.clinicalServices.join(', ') : '--'}</Text>
              <Text style={styles.skillTitle}>Dispense Software: {candidate.dispenseSoftware.length ? candidate.dispenseSoftware.join(', ') : '--'}</Text>
              <Text style={styles.skillTitle}>Expanded Scope: {candidate.expandedScope.length ? candidate.expandedScope.join(', ') : '--'}</Text>
            </View>
          ) : null}
        </View>

        {isFullTimeApplication && canRequestBooking ? (
          <View style={styles.bookingRow}>
            <Button mode="contained" onPress={() => onRequestBooking(candidate)} buttonColor="#4F46E5" textColor="#FFFFFF">
              Propose Shift
            </Button>
          </View>
        ) : null}
        {!isFullTimeApplication && showCalendarButton && canRequestBooking ? (
          <View style={styles.bookingRow}>
            <Button mode="contained" onPress={() => onViewCalendar(candidate)} buttonColor="#4F46E5" textColor="#FFFFFF">
              Request Booking
            </Button>
          </View>
        ) : null}
      </Card.Content>

      <View style={styles.actions}>
        <View />
        <View style={styles.likeWrap}>
          <IconButton
            icon={candidate.isLikedByMe ? 'heart' : 'heart-outline'}
            iconColor={candidate.isLikedByMe ? '#DC2626' : '#6B7280'}
            onPress={() => onToggleLike(candidate)}
            size={20}
          />
          <Text style={styles.subtle}>{candidate.likeCount}</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, backgroundColor: '#FFFFFF' },
  topBar: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 6,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topMetaRow: { alignItems: 'flex-start' },
  cityText: { fontWeight: '600', color: '#111827' },
  ref: { color: '#9CA3AF', fontFamily: 'monospace', fontSize: 11, letterSpacing: 0.3 },
  travelChip: { backgroundColor: '#F9FAFB' },
  content: { gap: 10 },
  identityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  identityLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleBlock: { flex: 1, gap: 6 },
  detailsCol: { gap: 8 },
  headerMetaRow: { alignItems: 'flex-start' },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  role: { fontWeight: '700' },
  subtle: { color: '#6B7280' },
  pitch: { color: '#6B7280', fontStyle: 'italic' },
  rating: { color: '#111827', fontWeight: '700' },
  engagementRow: { alignItems: 'flex-start' },
  engagementChip: { backgroundColor: '#EEF2FF' },
  availabilityBox: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 10, gap: 4 },
  availabilityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bookingRow: { marginTop: 4, alignItems: 'flex-end' },
  skillsBlock: { gap: 4 },
  skillTitle: { color: '#4B5563', fontSize: 12 },
  actions: { paddingHorizontal: 8, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  likeWrap: { flexDirection: 'row', alignItems: 'center' },
});
