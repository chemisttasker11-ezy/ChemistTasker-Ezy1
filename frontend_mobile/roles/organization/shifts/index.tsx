import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';
import ActiveShiftsView from '@/roles/shared/shifts/ActiveShiftsPage';
import ConfirmedShiftsView from '@/roles/shared/shifts/ConfirmedShiftsView';
import HistoryShiftsView from '@/roles/shared/shifts/HistoryShiftsView';

export default function OrganizationShiftCenter() {
  const [activeTab, setActiveTab] = useState<'active' | 'confirmed' | 'history'>('active');

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall" style={styles.title}>Shift Center</Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Active, confirmed, and historical shifts
          </Text>
        </View>
      </View>

      <View style={styles.tabsContainer}>
        {[
          { key: 'active', label: 'Active' },
          { key: 'confirmed', label: 'Confirmed' },
          { key: 'history', label: 'History' },
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.activeTab]}
            onPress={() => setActiveTab(tab.key as 'active' | 'confirmed' | 'history')}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'active' ? (
        <ActiveShiftsView />
      ) : activeTab === 'confirmed' ? (
        <ConfirmedShiftsView />
      ) : (
        <HistoryShiftsView />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontWeight: 'bold', color: '#111827' },
  subtitle: { color: '#6B7280' },
  tabsContainer: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 16, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: '#6366F1' },
  tabText: { color: '#6B7280', fontWeight: '600' },
  activeTabText: { color: '#6366F1' },
});
