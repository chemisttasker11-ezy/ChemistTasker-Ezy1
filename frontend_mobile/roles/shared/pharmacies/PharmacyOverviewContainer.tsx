// Pharmacy Overview Container - Mobile
// Orchestrates pharmacy list, detail views, and form modals
// Identical to web's OwnerOverviewContainer.tsx with exact same hooks and API calls

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { View as RNView, StyleSheet } from 'react-native';
import { Appbar, FAB, Snackbar, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, usePathname } from 'expo-router';
import {
    fetchPharmaciesService,
    fetchMembershipsByPharmacy,
    fetchPharmacyAdminsService,
    deletePharmacy,
    type MembershipDTO,
    type PharmacyAdminDTO,
    type PharmacyDTO,
} from '@chemisttasker/shared-core';
import { useAuth } from '../../../context/AuthContext';
import PharmaciesListView from './PharmaciesListView';
import PharmacyForm from './PharmacyForm';
import PharmacyDetailView from './PharmacyDetailView';
import { surfaceTokens } from './types';

type ViewType = 'list' | 'form-create' | 'form-edit' | 'detail';

export default function PharmacyOverviewContainer() {
    const navigation = useNavigation();
    const pathname = usePathname();
    const isOwner = pathname?.startsWith('/owner') ?? false;
    const { user } = useAuth();

    // State
    const [view, setView] = useState<ViewType>('list');
    const [pharmacies, setPharmacies] = useState<PharmacyDTO[]>([]);
    const [membershipsByPharmacy, setMembershipsByPharmacy] = useState<Record<string, MembershipDTO[]>>({});
    const [adminAssignmentsByPharmacy, setAdminAssignmentsByPharmacy] = useState<Record<string, PharmacyAdminDTO[]>>({});
    const [selectedPharmacy, setSelectedPharmacy] = useState<PharmacyDTO | null>(null);
    const [loading, setLoading] = useState(true);
    const [snackbar, setSnackbar] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });

    // Admin scope - TODO: Will be implemented when admin context is added to mobile
    const scopedPharmacyId = null;

    // Fetch memberships for a pharmacy
    const fetchMemberships = useCallback(
        async (pharmacyId: string) => fetchMembershipsByPharmacy(Number(pharmacyId)),
        []
    );

    // Fetch admins for a pharmacy
    const fetchAdmins = useCallback(
        async (pharmacyId: string) => {
            const admins = await fetchPharmacyAdminsService({ pharmacy: pharmacyId });
            return admins;
        },
        []
    );

    // Reload pharmacy memberships
    const reloadPharmacyMemberships = useCallback(
        async (pharmacyId: string) => {
            try {
                const [memberships, admins] = await Promise.all([
                    fetchMemberships(pharmacyId),
                    fetchAdmins(pharmacyId),
                ]);
                setMembershipsByPharmacy((prev) => ({ ...prev, [pharmacyId]: memberships }));
                setAdminAssignmentsByPharmacy((prev) => ({ ...prev, [pharmacyId]: admins }));
            } catch (error) {
                console.error('Failed to reload memberships', error);
            }
        },
        [fetchMemberships, fetchAdmins]
    );

    // Load all pharmacies and their memberships
    const loadPharmacies = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchPharmaciesService({});

            // Normalize pharmacies
            const normalizedPharmacies: PharmacyDTO[] = res.map((item: any) => ({
                ...item,
                id: String(item.id),
            }));

            // Filter for admin scope
            const scopedPharmacies =
                scopedPharmacyId != null
                    ? normalizedPharmacies.filter((pharmacy) => Number(pharmacy.id) === scopedPharmacyId)
                    : normalizedPharmacies;

            setPharmacies(scopedPharmacies);

            // Load memberships for each pharmacy
            const memberMap: Record<string, MembershipDTO[]> = {};
            const adminMap: Record<string, PharmacyAdminDTO[]> = {};

            await Promise.all(
                scopedPharmacies.map(async (p) => {
                    const [memberships, admins] = await Promise.all([
                        fetchMemberships(p.id),
                        fetchAdmins(p.id),
                    ]);
                    memberMap[p.id] = memberships;
                    adminMap[p.id] = admins;
                })
            );

            setMembershipsByPharmacy(memberMap);
            setAdminAssignmentsByPharmacy(adminMap);
        } catch (e) {
            console.error('PharmacyOverviewContainer fetch error:', e);
            setSnackbar({ message: 'Failed to load pharmacies', visible: true });
        } finally {
            setLoading(false);
        }
    }, [fetchMemberships, fetchAdmins, scopedPharmacyId]);

    // Load on mount
    useEffect(() => {
        void loadPharmacies();
    }, [loadPharmacies]);

    // Calculate staff counts
    const staffCounts = useMemo(
        () => Object.fromEntries(pharmacies.map((p) => [p.id, (membershipsByPharmacy[p.id] || []).length])),
        [pharmacies, membershipsByPharmacy]
    );

    // Handlers
    const handleOpenPharmacy = (pharmacyId: string) => {
        const pharmacy = pharmacies.find((p) => p.id === pharmacyId);
        if (pharmacy) {
            setSelectedPharmacy(pharmacy);
            setView('detail');
            void reloadPharmacyMemberships(pharmacyId);
        }
    };

    const handleEditPharmacy = (pharmacy: PharmacyDTO) => {
        setSelectedPharmacy(pharmacy);
        setView('form-edit');
    };

    const handleDeletePharmacy = async (pharmacyId: string) => {
        try {
            await deletePharmacy(pharmacyId);
            setSnackbar({ message: 'Pharmacy deleted successfully', visible: true });
            await loadPharmacies();
        } catch (error: any) {
            const detail = error?.response?.data?.detail || error?.message;
            setSnackbar({ message: detail || 'Failed to delete pharmacy', visible: true });
        }
    };

    const handleAddPharmacy = () => {
        setSelectedPharmacy(null);
        setView('form-create');
    };

    const handleFormSuccess = async () => {
        setView('list');
        setSelectedPharmacy(null);
        await loadPharmacies();
        setSnackbar({ message: 'Pharmacy saved successfully', visible: true });
    };

    const handleFormCancel = () => {
        setView('list');
        setSelectedPharmacy(null);
    };

    const handleBack = () => {
        if (view === 'detail' || view === 'form-create' || view === 'form-edit') {
            setView('list');
            setSelectedPharmacy(null);
        }
    };

    useLayoutEffect(() => {
        if (!isOwner) return;
        const headerTitle =
            view === 'form-create' ? 'Add Pharmacy' :
                view === 'form-edit' ? 'Edit Pharmacy' :
                    view === 'detail' ? (selectedPharmacy?.name || 'Pharmacy') :
                        'Pharmacies';
        navigation.setOptions({
            headerTitle: () => (
                <Text numberOfLines={1} ellipsizeMode="tail" style={styles.headerTitle}>
                    {headerTitle}
                </Text>
            ),
        });
    }, [isOwner, navigation, selectedPharmacy?.name, view]);

    // Render current view
    const renderContent = () => {
        switch (view) {
            case 'form-create':
                return (
                    <PharmacyForm
                        key="pharmacy-form-create"
                        mode="create"
                        onSuccess={handleFormSuccess}
                        onCancel={handleFormCancel}
                    />
                );

            case 'form-edit':
                return (
                    <PharmacyForm
                        key={`pharmacy-form-edit-${selectedPharmacy?.id ?? 'unknown'}`}
                        mode="edit"
                        pharmacyId={selectedPharmacy?.id}
                        onSuccess={handleFormSuccess}
                        onCancel={handleFormCancel}
                    />
                );

            case 'detail':
                if (!selectedPharmacy) {
                    return (
                        <RNView style={styles.placeholder}>
                            <Text>No pharmacy selected</Text>
                        </RNView>
                    );
                }
                return (
                    <PharmacyDetailView
                        pharmacy={selectedPharmacy}
                        memberships={membershipsByPharmacy[selectedPharmacy.id] || []}
                        adminAssignments={adminAssignmentsByPharmacy[selectedPharmacy.id] || []}
                        onMembershipsChanged={() => reloadPharmacyMemberships(selectedPharmacy.id)}
                        onAdminsChanged={() => reloadPharmacyMemberships(selectedPharmacy.id)}
                        loading={loading}
                    />
                );

            case 'list':
            default:
                return (
                    <PharmaciesListView
                        pharmacies={pharmacies}
                        staffCounts={staffCounts}
                        loading={loading}
                        onOpenPharmacy={handleOpenPharmacy}
                        onEditPharmacy={handleEditPharmacy}
                        onDeletePharmacy={handleDeletePharmacy}
                    />
                );
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            {/* Header */}
            {!isOwner && (
                <Appbar.Header elevated>
                    {view !== 'list' && (
                        <Appbar.BackAction onPress={handleBack} />
                    )}
                    <Appbar.Content
                        title={
                            view === 'form-create' ? 'Add Pharmacy' :
                                view === 'form-edit' ? 'Edit Pharmacy' :
                                    view === 'detail' ? selectedPharmacy?.name || 'Pharmacy' :
                                        'My Pharmacies'
                        }
                    />
                </Appbar.Header>
            )}

            {/* Content */}
            {renderContent()}

            {/* FAB for adding pharmacy (only on list view) */}
            {view === 'list' && !scopedPharmacyId && (
                <FAB
                    icon="plus"
                    style={styles.fab}
                    onPress={handleAddPharmacy}
                    label="Add Pharmacy"
                />
            )}

            {/* Snackbar for notifications */}
            <Snackbar
                visible={snackbar.visible}
                onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
                duration={3000}
                action={{
                    label: 'Dismiss',
                    onPress: () => setSnackbar({ ...snackbar, visible: false }),
                }}
            >
                {snackbar.message}
            </Snackbar>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: surfaceTokens.bgDark,
    },
    placeholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    fab: {
        position: 'absolute',
        right: 16,
        bottom: 16,
        backgroundColor: surfaceTokens.primary,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
    },
});
