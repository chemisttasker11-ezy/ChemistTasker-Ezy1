import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Surface, Text } from 'react-native-paper';
import { startDirectMessageByMembership, type MembershipDTO } from '@chemisttasker/shared-core';
import { fetchMembershipsForPharmacy } from '@/roles/shared/pharmacies/membershipApi';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useRouter } from 'expo-router';
import LocumManager from '@/roles/shared/pharmacies/LocumManager';
import { surfaceTokens } from '@/roles/shared/pharmacies/types';
import { getMessageDetailRoute } from '@/utils/chatRoutes';

const LOCUM_TYPES = new Set(['LOCUM', 'SHIFT_HERO']);
const getEmploymentType = (membership: MembershipDTO) =>
    String(((membership as any).employment_type ?? (membership as any).employmentType ?? '')).toUpperCase();

export default function ManageLocumsScreen() {
    const router = useRouter();
    const { selectedPharmacyId, selectedPharmacyName } = useWorkspace();
    const [memberships, setMemberships] = useState<MembershipDTO[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>('');
    const [messagingMemberId, setMessagingMemberId] = useState<string | number | null>(null);

    const loadData = useCallback(async () => {
        if (!selectedPharmacyId) {
            setMemberships([]);
            setError('Select a pharmacy scope to view locums.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');
        try {
            const membershipData = await fetchMembershipsForPharmacy(selectedPharmacyId);
            setMemberships(Array.isArray(membershipData) ? (membershipData as MembershipDTO[]) : []);
        } catch (e) {
            console.error('Failed to load locum memberships', e);
            setError('Failed to load locums.');
            setMemberships([]);
        } finally {
            setLoading(false);
        }
    }, [selectedPharmacyId]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const locumMemberships = useMemo(
        () => memberships.filter((membership) => LOCUM_TYPES.has(getEmploymentType(membership))),
        [memberships]
    );

    const handleMessageMember = useCallback(async (memberId: string | number) => {
        const membership = memberships.find((item) => String(item.id) === String(memberId));
        if (!membership) return;
        setMessagingMemberId(memberId);
        try {
            const room = await startDirectMessageByMembership(memberId, selectedPharmacyId ?? null);
            const userDetails = (membership as any).userDetails ?? (membership as any).user_details;
            const fullName = [userDetails?.firstName ?? userDetails?.first_name, userDetails?.lastName ?? userDetails?.last_name]
                .filter(Boolean)
                .join(' ');
            const invitedName = (membership as any).invitedName ?? (membership as any).invited_name;
            const name =
                invitedName ||
                fullName ||
                userDetails?.username ||
                'Chat';
            router.push({
                pathname: getMessageDetailRoute('OWNER', (room as any).id) as any,
                params: { id: (room as any).id, name },
            });
        } catch (e) {
            console.error('Failed to start locum chat', e);
        } finally {
            setMessagingMemberId(null);
        }
    }, [memberships, router, selectedPharmacyId]);

    if (loading) {
        return (
            <SafeAreaView style={styles.centered} edges={['left', 'right']}>
                <ActivityIndicator size="large" />
                <Text style={styles.helperText}>Loading locums...</Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <View style={styles.header}>
                <Text variant="headlineSmall" style={styles.title}>Manage Locums</Text>
                <Text variant="bodyMedium" style={styles.subtitle}>
                    {selectedPharmacyName || 'Selected pharmacy'}
                </Text>
            </View>

            {error ? (
                <Surface style={styles.errorBox} elevation={1}>
                    <Text style={styles.errorText}>{error}</Text>
                    <Button onPress={() => void loadData()}>Retry</Button>
                </Surface>
            ) : null}

            {!selectedPharmacyId ? null : (
                <>
                    <View style={styles.managerSection}>
                        <LocumManager
                            pharmacyId={String(selectedPharmacyId)}
                            memberships={locumMemberships}
                            onMembershipsChanged={loadData}
                            loading={loading}
                            pharmacyName={selectedPharmacyName || undefined}
                            onMessageMember={handleMessageMember}
                            messagingMemberId={messagingMemberId}
                        />
                    </View>
                </>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: surfaceTokens.bgDark,
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        backgroundColor: surfaceTokens.bgDark,
    },
    header: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 4,
    },
    title: {
        fontWeight: '700',
        color: surfaceTokens.text,
    },
    subtitle: {
        color: surfaceTokens.textMuted,
    },
    helperText: {
        color: surfaceTokens.textMuted,
    },
    managerSection: {
        flex: 1,
    },
    errorBox: {
        marginHorizontal: 16,
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#FEF2F2',
    },
    errorText: {
        color: '#B91C1C',
        marginBottom: 4,
    },
});
