// ShiftBoardTabsPage - Mobile wrapper with tabs
// Simple wrapper that doesn't fetch data, just provides tab UI

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import the actual Views that have data fetching
import PublicShiftsView from './PublicShiftsView';
import CommunityShiftsView from './CommunityShiftsView';
import { useWorkspace } from '../../../context/WorkspaceContext';

type ShiftBoardTab = 'browse' | 'saved' | 'interested' | 'rejected' | 'accepted';

const TABS = [
    { value: 'browse' as ShiftBoardTab, label: 'Browse' },
    { value: 'saved' as ShiftBoardTab, label: 'Saved' },
    { value: 'interested' as ShiftBoardTab, label: 'Interested' },
    { value: 'rejected' as ShiftBoardTab, label: 'Rejected' },
    { value: 'accepted' as ShiftBoardTab, label: 'Offers' },
];

export default function ShiftBoardTabsPage() {
    const { workspace, canUsePlatform } = useWorkspace();
    const effectiveWorkspace: 'internal' | 'platform' =
        workspace === 'platform' && canUsePlatform ? 'platform' : 'internal';
    const [activeTab, setActiveTab] = useState<ShiftBoardTab>('browse');

    // Use the appropriate view based on workspace
    const ShiftsView = effectiveWorkspace === 'internal' ? CommunityShiftsView : PublicShiftsView;

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            {/* Tabs */}
            <View style={styles.tabsContainer}>
                <SegmentedButtons
                    value={activeTab}
                    onValueChange={(value) => setActiveTab(value as ShiftBoardTab)}
                    buttons={TABS.map((tab) => ({
                        value: tab.value,
                        label: tab.label,
                        style: styles.segmentButton,
                    }))}
                    theme={{
                        colors: {
                            secondaryContainer: '#EEF2FF',
                            onSecondaryContainer: '#6366F1',
                        },
                    }}
                />
            </View>

            {/* Content - Pass tab to the view */}
            <View style={styles.content}>
                <ShiftsView
                    activeTabOverride={activeTab}
                    onActiveTabChange={(tab) => setActiveTab(tab as ShiftBoardTab)}
                    hideTabs
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    tabsContainer: {
        paddingHorizontal: 16,
        paddingTop: 12,
        marginBottom: 16,
    },
    segmentButton: {
        borderColor: '#E5E7EB',
    },
    content: {
        flex: 1,
    },
});
