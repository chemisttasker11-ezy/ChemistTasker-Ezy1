// Pharmacy List View - Mobile
// Displays grid of pharmacy cards with Open, Edit, Delete actions

import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Card, Text, Button, Surface, IconButton, ActivityIndicator, Chip, Divider } from 'react-native-paper';
import { PharmacyDTO, surfaceTokens } from './types';

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

interface PharmaciesListViewProps {
    pharmacies: PharmacyDTO[];
    staffCounts: Record<string, number>;
    loading?: boolean;
    showOwnerClaimsSection?: boolean;
    ownerClaims?: OwnerClaimRequest[];
    ownerClaimsLoading?: boolean;
    ownerClaimError?: string | null;
    ownerClaimCounts?: { pending: number; accepted: number };
    ownerClaimsExpanded?: boolean;
    onToggleOwnerClaims?: () => void;
    onRespondToClaim?: (claim: OwnerClaimRequest, action: ClaimStatus) => void;
    onOpenPharmacy: (pharmacyId: string) => void;
    onEditPharmacy?: (pharmacy: PharmacyDTO) => void;
    onDeletePharmacy?: (pharmacyId: string) => void;
    onAddPharmacy?: () => void;
}

export default function PharmaciesListView({
    pharmacies,
    staffCounts,
    loading = false,
    showOwnerClaimsSection = false,
    ownerClaims = [],
    ownerClaimsLoading = false,
    ownerClaimError = null,
    ownerClaimCounts = { pending: 0, accepted: 0 },
    ownerClaimsExpanded = false,
    onToggleOwnerClaims,
    onRespondToClaim,
    onOpenPharmacy,
    onEditPharmacy,
    onDeletePharmacy,
    onAddPharmacy,
}: PharmaciesListViewProps) {
    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={surfaceTokens.primary} />
                <Text style={styles.loadingText}>Loading pharmacies...</Text>
            </View>
        );
    }

    if (pharmacies.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <IconButton icon="domain" size={64} iconColor={surfaceTokens.border} />
                <Text style={styles.emptyTitle}>No pharmacies yet</Text>
                <Text style={styles.emptyText}>Add your first pharmacy to get started</Text>
                {onAddPharmacy && (
                    <Button mode="contained" onPress={onAddPharmacy} style={styles.addButton}>
                        Add Pharmacy
                    </Button>
                )}
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
        >
            {showOwnerClaimsSection && (
                <Card style={styles.claimSectionCard} mode="outlined">
                    <Card.Content style={styles.claimSectionContent}>
                        <Text style={styles.claimSectionTitle}>Organization claim requests</Text>
                        <Text style={styles.claimSectionSubtitle}>
                            Organizations can request access to manage your pharmacies. Review and respond here.
                        </Text>
                        <View style={styles.claimCountRow}>
                            <Chip compact style={styles.pendingChip}>Pending: {ownerClaimCounts.pending}</Chip>
                            <Chip compact style={styles.acceptedChip}>Accepted: {ownerClaimCounts.accepted}</Chip>
                        </View>
                        <Button
                            mode="contained"
                            onPress={onToggleOwnerClaims}
                            style={styles.claimToggleButton}
                        >
                            {ownerClaimsExpanded ? 'Hide Requests' : 'View Requests'}
                        </Button>

                        {ownerClaimsExpanded && (
                            <View style={styles.claimList}>
                                {ownerClaimError ? (
                                    <Text style={styles.claimErrorText}>{ownerClaimError}</Text>
                                ) : ownerClaimsLoading ? (
                                    <View style={styles.claimLoadingRow}>
                                        <ActivityIndicator size="small" color={surfaceTokens.primary} />
                                        <Text style={styles.claimLoadingText}>Loading claim requests...</Text>
                                    </View>
                                ) : ownerClaims.length === 0 ? (
                                    <Text style={styles.claimEmptyText}>No claim requests at the moment.</Text>
                                ) : (
                                    ownerClaims.map((claim, index) => (
                                        <View key={claim.id}>
                                            <View style={styles.claimItem}>
                                                <View style={styles.claimItemHeader}>
                                                    <View style={styles.claimItemInfo}>
                                                        <Text style={styles.claimItemTitle}>{claim.pharmacy?.name || 'Untitled Pharmacy'}</Text>
                                                        <Text style={styles.claimItemMeta}>
                                                            Requested by {claim.organization?.name || 'Unknown organization'}
                                                        </Text>
                                                        <Text style={styles.claimItemMeta}>
                                                            {new Date(claim.created_at).toLocaleString()}
                                                        </Text>
                                                    </View>
                                                    <Chip
                                                        compact
                                                        style={[
                                                            styles.claimStatusChip,
                                                            claim.status === 'ACCEPTED'
                                                                ? styles.acceptedChip
                                                                : claim.status === 'REJECTED'
                                                                    ? styles.rejectedChip
                                                                    : styles.pendingChip,
                                                        ]}
                                                    >
                                                        {claim.status_display || claim.status}
                                                    </Chip>
                                                </View>

                                                {claim.message ? (
                                                    <Text style={styles.claimMessage}>"{claim.message}"</Text>
                                                ) : null}

                                                {claim.status !== 'PENDING' && claim.response_message ? (
                                                    <Text style={styles.claimResponseText}>Your response: {claim.response_message}</Text>
                                                ) : null}

                                                {claim.status === 'PENDING' && onRespondToClaim ? (
                                                    <View style={styles.claimActionRow}>
                                                        <Button mode="contained" onPress={() => onRespondToClaim(claim, 'ACCEPTED')}>
                                                            Approve
                                                        </Button>
                                                        <Button mode="outlined" textColor={surfaceTokens.error} onPress={() => onRespondToClaim(claim, 'REJECTED')}>
                                                            Reject
                                                        </Button>
                                                    </View>
                                                ) : null}
                                            </View>
                                            {index < ownerClaims.length - 1 ? <Divider style={styles.claimDivider} /> : null}
                                        </View>
                                    ))
                                )}
                            </View>
                        )}
                    </Card.Content>
                </Card>
            )}

            {pharmacies.map((pharmacy) => {
                const address = [pharmacy.street_address, pharmacy.suburb]
                    .filter(Boolean)
                    .join(', ');
                const staffCount = staffCounts[pharmacy.id] || 0;

                return (
                    <Card key={pharmacy.id} style={styles.card} mode="outlined">
                        <Card.Content style={styles.cardContent}>
                            {/* Icon */}
                            <Surface style={styles.iconContainer} elevation={0}>
                                <IconButton
                                    icon="domain"
                                    size={24}
                                    iconColor={surfaceTokens.primary}
                                />
                            </Surface>

                            {/* Info */}
                            <View style={styles.infoContainer}>
                                <Text style={styles.pharmacyName}>{pharmacy.name}</Text>
                                <Text style={styles.address}>
                                    {address}, {pharmacy.state} {pharmacy.postcode}
                                </Text>
                                {staffCount > 0 && (
                                    <Text style={styles.staffCount}>Staff: {staffCount}</Text>
                                )}
                            </View>

                            {/* Actions */}
                            <View style={styles.actionsContainer}>
                                <Button
                                    mode="outlined"
                                    compact
                                    onPress={() => onOpenPharmacy(pharmacy.id)}
                                    style={styles.actionButton}
                                >
                                    Open
                                </Button>
                                {onEditPharmacy && (
                                    <Button
                                        mode="outlined"
                                        compact
                                        onPress={() => onEditPharmacy(pharmacy)}
                                        style={styles.actionButton}
                                    >
                                        Edit
                                    </Button>
                                )}
                                {onDeletePharmacy && (
                                    <Button
                                        mode="text"
                                        compact
                                        textColor={surfaceTokens.error}
                                        onPress={() => onDeletePharmacy(pharmacy.id)}
                                        style={styles.actionButton}
                                    >
                                        Delete
                                    </Button>
                                )}
                            </View>
                        </Card.Content>
                    </Card>
                );
            })}

            {onAddPharmacy && (
                <Button
                    mode="contained"
                    onPress={onAddPharmacy}
                    style={styles.fabButton}
                    icon="plus"
                >
                    Add Pharmacy
                </Button>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: surfaceTokens.bgDark,
    },
    content: {
        padding: 16,
        paddingBottom: 32,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: surfaceTokens.bgDark,
        gap: 12,
    },
    loadingText: {
        color: surfaceTokens.textMuted,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: surfaceTokens.bgDark,
        padding: 32,
        gap: 12,
    },
    emptyTitle: {
        fontWeight: '600',
        color: '#111827',
        fontSize: 18,
    },
    emptyText: {
        color: surfaceTokens.textMuted,
        textAlign: 'center',
        fontSize: 14,
    },
    addButton: {
        marginTop: 16,
    },
    card: {
        marginBottom: 12,
        backgroundColor: surfaceTokens.bg,
        borderColor: surfaceTokens.border,
        borderRadius: 12,
    },
    claimSectionCard: {
        marginBottom: 16,
        backgroundColor: surfaceTokens.bg,
        borderColor: surfaceTokens.border,
        borderRadius: 12,
    },
    claimSectionContent: {
        gap: 12,
    },
    claimSectionTitle: {
        fontWeight: '700',
        color: '#111827',
        fontSize: 18,
    },
    claimSectionSubtitle: {
        color: surfaceTokens.textMuted,
        fontSize: 13,
        lineHeight: 18,
    },
    claimCountRow: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    claimToggleButton: {
        alignSelf: 'flex-start',
    },
    claimList: {
        gap: 12,
    },
    claimLoadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    claimLoadingText: {
        color: surfaceTokens.textMuted,
    },
    claimErrorText: {
        color: surfaceTokens.error,
        fontSize: 13,
    },
    claimEmptyText: {
        color: surfaceTokens.textMuted,
        fontSize: 13,
    },
    claimItem: {
        gap: 8,
        paddingVertical: 4,
    },
    claimItemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 8,
    },
    claimItemInfo: {
        flex: 1,
        gap: 3,
    },
    claimItemTitle: {
        fontWeight: '600',
        color: '#111827',
        fontSize: 15,
    },
    claimItemMeta: {
        color: surfaceTokens.textMuted,
        fontSize: 12,
    },
    claimStatusChip: {
        alignSelf: 'flex-start',
    },
    claimMessage: {
        color: '#374151',
        fontSize: 13,
        fontStyle: 'italic',
    },
    claimResponseText: {
        color: surfaceTokens.textMuted,
        fontSize: 13,
    },
    claimActionRow: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    claimDivider: {
        marginVertical: 4,
    },
    acceptedChip: {
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
    },
    pendingChip: {
        backgroundColor: 'rgba(245, 158, 11, 0.12)',
    },
    rejectedChip: {
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: 16,
    },
    iconContainer: {
        backgroundColor: surfaceTokens.hover,
        borderRadius: 8,
        padding: 4,
    },
    infoContainer: {
        flex: 1,
        gap: 4,
    },
    pharmacyName: {
        fontWeight: '600',
        color: '#111827',
        fontSize: 16,
    },
    address: {
        color: surfaceTokens.textMuted,
        fontSize: 13,
    },
    staffCount: {
        color: surfaceTokens.textMuted,
        fontSize: 12,
    },
    actionsContainer: {
        flexDirection: 'column',
        gap: 8,
        alignItems: 'flex-end',
    },
    actionButton: {
        minWidth: 70,
    },
    fabButton: {
        marginTop: 16,
    },
});
