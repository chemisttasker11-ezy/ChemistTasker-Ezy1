import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SegmentTabs, tabPanelProps } from '@/components/ui';
import { colors, space } from '@/constants/tokens';
import PublicShiftsView from '@/roles/shared/shifts/PublicShiftsView';
import CommunityShiftsView from '@/roles/shared/shifts/CommunityShiftsView';

type Board = 'public' | 'community';

const boards = [
  { value: 'public' as const, label: 'Public' },
  { value: 'community' as const, label: 'Community' },
];

/** Explorer Shifts tab: web's Public and Community boards (Shifts > Public Shifts / Community Shifts). */
export default function ExplorerShiftsScreen() {
  const [board, setBoard] = useState<Board>('public');
  return (
    <View style={styles.page}>
      <SegmentTabs tabs={boards} value={board} onChange={setBoard} label="Shift boards" idPrefix="explorer-shifts" style={styles.tabs} />
      <View style={styles.content} {...tabPanelProps('explorer-shifts', board)}>
        {board === 'public' ? <PublicShiftsView /> : <CommunityShiftsView />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  tabs: { marginHorizontal: space.lg, marginTop: space.md, marginBottom: space.md },
  content: { flex: 1 },
});
