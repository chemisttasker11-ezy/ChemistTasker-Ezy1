// Pharmacy Overview Container - Mobile
// Orchestrates pharmacy list, detail views, and form modals
// Identical to web's OwnerOverviewContainer.tsx with exact same hooks and API calls

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { View as RNView, StyleSheet } from 'react-native';
import { Appbar, Button, Dialog, FAB, Portal, Snackbar, Text, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, usePathname } from 'expo-router';
import {
    fetchPharmaciesService,
    fetchMembershipsByPharmacy,
    fetchPharmacyAdminsService,
    deletePharmacy,
    getPharmacyClaims,
    type MembershipDTO,
    type PharmacyAdminDTO,
    type PharmacyDTO,
    updatePharmacyClaim,
} from '@chemisttasker/shared-core';
import { useAuth } from '../../../context/AuthContext';
import PharmaciesListView from './PharmaciesListView';
import PharmacyForm from './PharmacyForm';
import PharmacyDetailView from './PharmacyDetailView';
import { surfaceTokens } from './types';

type ViewType = 'list' | 'form-create' | 'form-edit' | 'detail';
type ClaimStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

type OwnerClaimRequest = {
    id: number;
    status: ClaimStatus;
    status_display?: string;
    message?: string | null;
    response_message?: string | null;
    pharmacy: {
        id: number;
        name: string;
        email: string | null;
    };
    organization: {
        id: number;
        name?: string | null;
    } | null;
    created_at: string;
    responded_at: string | null;
};

type OwnerClaimDialogState = {
    open: boolean;
    claim: OwnerClaimRequest | null;
    action: ClaimStatus | null;
    note: string;
};

type ClaimAwarePharmacy = PharmacyDTO & {
    claimed?: boolean;
    claim_status?: string | null;
    claimStatus?: string | null;
    organization?: number | { id: number; name?: string | null } | null;
    organization_id?: number | null;
    organizationId?: number | null;
};

const initialOwnerClaimDialog: OwnerClaimDialogState = {
    open: false,
    claim: null,
    action: null,
    note: '',
};

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
    const [ownerClaims, setOwnerClaims] = useState<OwnerClaimRequest[]>([]);
    const [ownerClaimsLoading, setOwnerClaimsLoading] = useState(false);
    const [ownerClaimError, setOwnerClaimError] = useState<string | null>(null);
    const [ownerClaimsExpanded, setOwnerClaimsExpanded] = useState(false);
    const [ownerClaimDialog, setOwnerClaimDialog] = useState<OwnerClaimDialogState>(initialOwnerClaimDialog);
    const [respondingToClaim, setRespondingToClaim] = useState(false);

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
    const claimedPharmacyCount = useMemo(
        () =>
            pharmacies.filter((pharmacy) => {
                const candidate = pharmacy as ClaimAwarePharmacy;
                const status = String(candidate.claim_status ?? candidate.claimStatus ?? '').toUpperCase();
                return Boolean(
                    candidate.claimed ||
                    candidate.organization ||
                    candidate.organization_id ||
                    candidate.organizationId ||
                    status === 'ACCEPTED'
                );
            }).length,
        [pharmacies]
    );
    const ownerClaimCounts = useMemo(() => {
        const pending = ownerClaims.filter((item) => item.status === 'PENDING').length;
        const accepted = ownerClaims.filter((item) => item.status === 'ACCEPTED').length;
        return { pending, accepted };
    }, [ownerClaims]);

    const loadOwnerClaims = useCallback(async () => {
        if (!isOwner) {
            setOwnerClaims([]);
            setOwnerClaimError(null);
            return;
        }
        setOwnerClaimsLoading(true);
        try {
            const res = await getPharmacyClaims({ owned_by_me: true });
            const data = Array.isArray((res as any)?.results)
                ? (res as any).results
                : Array.isArray(res as any)
                    ? (res as any)
                    : [];
            setOwnerClaims(data);
            setOwnerClaimError(null);
        } catch (error: any) {
            const detail = error?.response?.data?.detail || error?.message || 'Failed to load claim requests.';
            setOwnerClaimError(detail);
        } finally {
            setOwnerClaimsLoading(false);
        }
    }, [isOwner]);

    useEffect(() => {
        if (!isOwner || claimedPharmacyCount <= 0) {
            setOwnerClaimsExpanded(false);
            return;
        }
        void loadOwnerClaims();
    }, [claimedPharmacyCount, isOwner, loadOwnerClaims]);

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

    const handleOpenOwnerClaimDialog = (claim: OwnerClaimRequest, action: ClaimStatus) => {
        setOwnerClaimDialog({ open: true, claim, action, note: '' });
    };

    const handleCloseOwnerClaimDialog = () => {
        if (respondingToClaim) return;
        setOwnerClaimDialog(initialOwnerClaimDialog);
    };

    const handleRespondToOwnerClaim = async () => {
        if (!ownerClaimDialog.claim || !ownerClaimDialog.action) return;
        setRespondingToClaim(true);
        try {
            await updatePharmacyClaim(ownerClaimDialog.claim.id, {
                status: ownerClaimDialog.action,
                response_message: ownerClaimDialog.note.trim() || undefined,
            });
            setSnackbar({
                message: ownerClaimDialog.action === 'ACCEPTED' ? 'Claim accepted.' : 'Claim rejected.',
                visible: true,
            });
            setOwnerClaimDialog(initialOwnerClaimDialog);
            await loadOwnerClaims();
        } catch (error: any) {
            const detail = error?.response?.data?.detail || error?.message || 'Failed to update the claim.';
            setOwnerClaimError(detail);
        } finally {
            setRespondingToClaim(false);
        }
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
                        showOwnerClaimsSection={isOwner && claimedPharmacyCount > 0}
                        ownerClaims={ownerClaims}
                        ownerClaimsLoading={ownerClaimsLoading}
                        ownerClaimError={ownerClaimError}
                        ownerClaimCounts={ownerClaimCounts}
                        ownerClaimsExpanded={ownerClaimsExpanded}
                        onToggleOwnerClaims={() => setOwnerClaimsExpanded((prev) => !prev)}
                        onRespondToClaim={handleOpenOwnerClaimDialog}
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

            <Portal>
                <Dialog visible={ownerClaimDialog.open} onDismiss={handleCloseOwnerClaimDialog}>
                    <Dialog.Title>
                        {ownerClaimDialog.action === 'ACCEPTED' ? 'Approve claim request' : 'Reject claim request'}
                    </Dialog.Title>
                    <Dialog.Content>
                        <Text variant="bodyMedium" style={styles.dialogText}>
                            {ownerClaimDialog.claim?.organization?.name || 'This organization'} requested access to{' '}
                            {ownerClaimDialog.claim?.pharmacy?.name || 'this pharmacy'}.
                        </Text>
                        <TextInput
                            mode="outlined"
                            label="Optional note"
                            value={ownerClaimDialog.note}
                            onChangeText={(value) => setOwnerClaimDialog((prev) => ({ ...prev, note: value }))}
                            multiline
                            numberOfLines={4}
                            style={styles.dialogInput}
                        />
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={handleCloseOwnerClaimDialog} disabled={respondingToClaim}>Cancel</Button>
                        <Button mode="contained" onPress={handleRespondToOwnerClaim} loading={respondingToClaim} disabled={respondingToClaim}>
                            Confirm
                        </Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>
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
    dialogText: {
        color: surfaceTokens.text,
        marginBottom: 12,
    },
    dialogInput: {
        backgroundColor: surfaceTokens.bg,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
    },
});
