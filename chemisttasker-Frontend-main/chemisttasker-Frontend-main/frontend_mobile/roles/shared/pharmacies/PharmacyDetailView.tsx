// Pharmacy Detail View - Mobile
// Integrates Staff Manager, Locum Manager, and Pharmacy Admins

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator, HelperText, SegmentedButtons, Switch, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type MembershipDTO, type PharmacyAdminDTO, type PharmacyDTO } from '@chemisttasker/shared-core';
import StaffManager from './StaffManager';
import LocumManager from './LocumManager';
import PharmacyAdmins from './PharmacyAdmins';
import { surfaceTokens } from './types';

type Tab = 'staff' | 'locums' | 'admins';

interface PharmacyDetailViewProps {
    pharmacy: PharmacyDTO;
    memberships: MembershipDTO[];
    adminAssignments: PharmacyAdminDTO[];
    onMembershipsChanged: () => void;
    onAdminsChanged: () => void;
    loading?: boolean;
    autoPublishWorkerRequests?: boolean;
    onToggleAutoPublishWorkerRequests?: (nextValue: boolean) => Promise<void> | void;
    autoPublishSaving?: boolean;
    autoPublishError?: string;
}

export default function PharmacyDetailView({
    pharmacy,
    memberships,
    adminAssignments,
    onMembershipsChanged,
    onAdminsChanged,
    loading = false,
    autoPublishWorkerRequests = false,
    onToggleAutoPublishWorkerRequests,
    autoPublishSaving = false,
    autoPublishError = '',
}: PharmacyDetailViewProps) {
    const [activeTab, setActiveTab] = useState<Tab>('staff');

    // Filter memberships by type
    // Any employment type that is NOT strictly a locum/casual type is considered general staff
    // This handles FULL_TIME, PART_TIME, CASUAL, STUDENT, and any new types safely
    const locumTypes = ['LOCUM', 'SHIFT_HERO'];

    const staffMemberships = memberships.filter((m) =>
        !locumTypes.includes(m.employment_type || '')
    );

    const locumMemberships = memberships.filter((m) =>
        locumTypes.includes(m.employment_type || '')
    );
    const pendingAdminMemberships = memberships.filter((membership: any) => {
        const status = String(membership.status || '').toUpperCase();
        const active = (membership.is_active ?? membership.isActive) !== false;
        return (membership.is_pharmacy_admin ?? membership.isPharmacyAdmin) && (status === 'PENDING' || (!status && !active));
    });

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <View style={styles.automationSection}>
                <View style={styles.automationHeader}>
                    <View style={styles.automationCopy}>
                        <Text style={styles.automationTitle}>Staff Request Publishing</Text>
                        <Text style={styles.automationDescription}>
                            Allow pharmacy staff shift cover requests and swap requests to be published to your team automatically?
                        </Text>
                    </View>
                    <View style={styles.automationToggle}>
                        {autoPublishSaving ? <ActivityIndicator size="small" /> : null}
                        <Text style={styles.automationState}>{autoPublishWorkerRequests ? 'Enabled' : 'Disabled'}</Text>
                        <Switch
                            value={autoPublishWorkerRequests}
                            onValueChange={(value) => onToggleAutoPublishWorkerRequests?.(value)}
                            disabled={!onToggleAutoPublishWorkerRequests || autoPublishSaving}
                        />
                    </View>
                </View>
                {autoPublishError ? <HelperText type="error">{autoPublishError}</HelperText> : null}
            </View>

            {/* Tab Selector */}
            <View style={styles.tabContainer}>
                <SegmentedButtons
                    value={activeTab}
                    onValueChange={(value) => setActiveTab(value as Tab)}
                    buttons={[
                        {
                            value: 'staff',
                            label: `Staff (${staffMemberships.length})`,
                        },
                        {
                            value: 'locums',
                            label: `Locums (${locumMemberships.length})`,
                        },
                        {
                            value: 'admins',
                            label: `Admins (${adminAssignments.length})`,
                        },
                    ]}
                    style={styles.segmentedButton}
                />
            </View>

            {/* Content */}
            <View style={styles.content}>
                {activeTab === 'staff' && (
                    <StaffManager
                        pharmacyId={pharmacy.id}
                        memberships={staffMemberships}
                        onMembershipsChanged={onMembershipsChanged}
                        loading={loading}
                        pharmacyName={pharmacy.name}
                    />
                )}

                {activeTab === 'locums' && (
                    <LocumManager
                        pharmacyId={pharmacy.id}
                        memberships={locumMemberships}
                        onMembershipsChanged={onMembershipsChanged}
                        loading={loading}
                        pharmacyName={pharmacy.name}
                    />
                )}

                {activeTab === 'admins' && (
                    <PharmacyAdmins
                        pharmacyId={pharmacy.id}
                        admins={adminAssignments}
                        pendingAdminMemberships={pendingAdminMemberships}
                        onAdminsChanged={onAdminsChanged}
                        loading={loading}
                        pharmacyName={pharmacy.name}
                    />
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: surfaceTokens.bgDark,
    },
    quickActions: {
        padding: 16,
    },
    actionCard: {
        backgroundColor: surfaceTokens.bg,
    },
    actionTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 12,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    tabContainer: {
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    segmentedButton: {
        backgroundColor: surfaceTokens.bg,
    },
    content: {
        flex: 1,
    },
    automationSection: {
        marginHorizontal: 16,
        marginTop: 16,
        marginBottom: 16,
        padding: 16,
        borderRadius: 16,
        backgroundColor: surfaceTokens.bg,
    },
    automationHeader: {
        gap: 12,
    },
    automationCopy: {
        gap: 6,
    },
    automationTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    automationDescription: {
        color: surfaceTokens.textMuted,
        lineHeight: 20,
    },
    automationToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    automationState: {
        fontWeight: '600',
        color: surfaceTokens.textMuted,
    },
});
