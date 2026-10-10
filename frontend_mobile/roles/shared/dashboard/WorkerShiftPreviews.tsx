import React from 'react';
import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Card, IconButton, Text } from 'react-native-paper';
import getShiftPharmacyName from '../shifts/utils/getShiftPharmacyName';

export type DashboardWorkerShift = {
  id: number;
  pharmacy_name?: string;
  date?: string;
  startDatetime?: string;
  start_datetime?: string;
  status?: string;
  reason?: string | null;
};

type PreviewStyles = {
  shiftPreviewCard: StyleProp<ViewStyle>;
  shiftPreviewContent: StyleProp<ViewStyle>;
  shiftPreviewLeft: StyleProp<ViewStyle>;
  shiftIconContainer: StyleProp<ViewStyle>;
  shiftPharmacyName: StyleProp<TextStyle>;
  shiftRole: StyleProp<TextStyle>;
};

// Preserve each dashboard's existing card styles and route adapter. The API's related
// work includes applications/offers, so label its status rather than implying booking.
export default function WorkerShiftPreviews({ shifts, styles, formatDate, onOpen }: {
  shifts: DashboardWorkerShift[];
  styles: PreviewStyles;
  formatDate: (value?: string | null) => string;
  onOpen: (id: number) => void;
}) {
  return <>{shifts.slice(0, 3).map(shift => (
    <Card key={shift.id} style={styles.shiftPreviewCard} onPress={() => onOpen(shift.id)}>
      <Card.Content style={styles.shiftPreviewContent}>
        <View style={styles.shiftPreviewLeft}>
          <View style={styles.shiftIconContainer}>
            <IconButton icon="calendar-clock" size={20} iconColor="#6366F1" />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text variant="labelMedium" style={styles.shiftPharmacyName}>{getShiftPharmacyName(shift)}</Text>
            <Text variant="bodySmall" style={styles.shiftRole}>{formatDate(shift.date || shift.startDatetime || shift.start_datetime)}</Text>
            {shift.status ? <Text variant="bodySmall" style={styles.shiftRole}>{shift.status}</Text> : null}
            {shift.reason ? <Text variant="bodySmall" style={styles.shiftRole}>{shift.reason}</Text> : null}
          </View>
        </View>
        <IconButton icon="chevron-right" size={20} iconColor="#9CA3AF" />
      </Card.Content>
    </Card>
  ))}</>;
}
