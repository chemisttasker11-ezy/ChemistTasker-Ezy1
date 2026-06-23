import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, SegmentedButtons } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useWorkspace } from '../../context/WorkspaceContext';

// Shared components
import PublicShiftsView from '@/roles/shared/shifts/PublicShiftsView';
import CommunityShiftsView from '@/roles/shared/shifts/CommunityShiftsView';
import WorkerConfirmedShiftsView from '@/roles/shared/shifts/WorkerConfirmedShiftsView';
import WorkerHistoryShiftsView from '@/roles/shared/shifts/WorkerHistoryShiftsView';

// Tabs change based on workspace
const getTabsForWorkspace = (workspace: 'internal' | 'platform') => {
  if (workspace === 'internal') {
    return [
      { value: 'community', label: 'Community' },
      { value: 'confirmed', label: 'Confirmed' },
      { value: 'history', label: 'History' },
    ];
  } else {
    return [
      { value: 'public', label: 'Public' },
      { value: 'confirmed', label: 'Confirmed' },
      { value: 'history', label: 'History' },
    ];
  }
};

export default function OtherStaffShiftsScreen() {
  const params = useLocalSearchParams<{ tab?: string; shift_id?: string; offer_id?: string }>();
  const { workspace, canUsePlatform } = useWorkspace();
  const effectiveWorkspace: 'internal' | 'platform' =
    workspace === 'platform' && canUsePlatform ? 'platform' : 'internal';
  const incomingTab = typeof params.tab === 'string' ? params.tab.toLowerCase() : null;
  const boardTabOverride = incomingTab === 'accepted' ? 'accepted' : undefined;
  const [activeTab, setActiveTab] = useState('public');

  const tabs = useMemo(() => getTabsForWorkspace(effectiveWorkspace), [effectiveWorkspace]);

  // Update active tab when workspace changes to avoid invalid states
  useEffect(() => {
    if (effectiveWorkspace === 'internal' && activeTab === 'public') {
      setActiveTab('community');
    } else if (effectiveWorkspace === 'platform' && activeTab === 'community') {
      setActiveTab('public');
    }
  }, [effectiveWorkspace, activeTab]);

  useEffect(() => {
    if (incomingTab !== 'accepted') return;
    setActiveTab(effectiveWorkspace === 'internal' ? 'community' : 'public');
  }, [incomingTab, effectiveWorkspace]);

  const subtitle = useMemo(() => {
    switch (activeTab) {
      case 'community':
        return 'Internal or network shifts shared with you.';
      case 'confirmed':
        return 'Shifts you have accepted.';
      case 'history':
        return 'Completed shifts and history.';
      case 'public':
        return 'Open marketplace shifts available to claim.';
      default:
        return 'Browse available shifts.';
    }
  }, [activeTab]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text variant="headlineMedium" style={styles.headerTitle}>Shift Centre</Text>
            <Text variant="bodyMedium" style={styles.headerSubtitle}>{subtitle}</Text>
          </View>
        </View>
      </View>

      <View style={styles.tabsContainer}>
        <SegmentedButtons
          value={activeTab}
          onValueChange={setActiveTab}
          buttons={tabs.map((tab) => ({
            value: tab.value,
            label: tab.label,
            style: styles.segmentButton,
          }))}
          theme={{ colors: { secondaryContainer: '#EEF2FF', onSecondaryContainer: '#6366F1' } }}
        />
      </View>

      <View style={styles.content}>
        {activeTab === 'public' && <PublicShiftsView activeTabOverride={boardTabOverride} />}
        {activeTab === 'community' && <CommunityShiftsView activeTabOverride={boardTabOverride} />}
        {activeTab === 'confirmed' && <WorkerConfirmedShiftsView />}
        {activeTab === 'history' && <WorkerHistoryShiftsView invoiceRoute="/otherstaff/invoice/new" />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    color: '#6B7280',
    marginTop: 4,
  },
  tabsContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  segmentButton: {
    borderColor: '#E5E7EB',
  },
  content: {
    flex: 1,
  },
});
