import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Text, Surface, Avatar, Button, Chip, Divider, List } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getWorkerShiftRequests, approveWorkerShiftRequest, rejectWorkerShiftRequest } from '@chemisttasker/shared-core';

interface Application {
    id: number;
    pharmacist_name: string;
    pharmacist_email?: string;
    pharmacist_phone?: string;
    ahpra_number?: string;
    experience_years?: number;
    rating?: number;
    cover_letter?: string;
    applied_date: string;
    status: string;
}

export default function ShiftApplicationsScreen() {
    const { id } = useLocalSearchParams();
    const [applications, setApplications] = useState<Application[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchApplications = useCallback(async () => {
        try {
            setError('');
            const response = await getWorkerShiftRequests({});
            const list = Array.isArray((response as any)?.results)
                ? (response as any).results
                : Array.isArray(response)
                    ? (response as any)
                    : [];
            const filtered = list.filter((req: any) => {
                const shiftId = (req as any).shift_id ?? (req as any).shift ?? (req as any).shift?.id;
                return String(shiftId) === String(id);
            });
            setApplications(filtered as any);
        } catch (err: any) {
            console.error('Error fetching applications:', err);
            setError('Failed to load applications');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void fetchApplications();
    }, [fetchApplications]);

    const handleAccept = (applicationId: number) => {
        Alert.alert(
            'Accept Application',
            'Are you sure you want to accept this application?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Accept',
                    onPress: async () => {
                        try {
                            await approveWorkerShiftRequest(applicationId);
                            fetchApplications();
                            Alert.alert('Success', 'Application accepted!');
                        } catch (err: any) {
                            console.error('Failed to accept application', err);
                            Alert.alert('Error', 'Failed to accept application');
                        }
                    },
                },
            ]
        );
    };

    const handleReject = (applicationId: number) => {
        Alert.alert(
            'Reject Application',
            'Are you sure you want to reject this application?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reject',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await rejectWorkerShiftRequest(applicationId);
                            fetchApplications();
                        } catch (err: any) {
                            console.error('Failed to reject application', err);
                            Alert.alert('Error', 'Failed to reject application');
                        }
                    },
                },
            ]
        );
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase();
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['left', 'right']}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#1976d2" />
                    <Text style={styles.loadingText}>Loading applications...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <View style={styles.header}>
                <Text variant="headlineSmall" style={styles.title}>
                    Applications ({applications.length})
                </Text>
                <Text variant="bodyMedium" style={styles.subtitle}>
                    Review and manage shift applications
                </Text>
            </View>

            {error ? (
                <Surface style={styles.errorContainer} elevation={1}>
                    <Text style={styles.errorText}>{error}</Text>
                    <Button onPress={fetchApplications}>Retry</Button>
                </Surface>
            ) : null}

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                {applications.length === 0 ? (
                    <Surface style={styles.emptyContainer} elevation={0}>
                        <Text variant="titleMedium" style={styles.emptyTitle}>
                            No Applications Yet
                        </Text>
                        <Text variant="bodyMedium" style={styles.emptyText}>
                            Qualified pharmacists will be able to apply once your shift is posted
                        </Text>
                    </Surface>
                ) : (
                    applications.map((application) => (
                        <Surface key={application.id} style={styles.card} elevation={2}>
                            {/* Header */}
                            <View style={styles.cardHeader}>
                                <View style={styles.applicantInfo}>
                                    <Avatar.Text
                                        size={50}
                                        label={getInitials(application.pharmacist_name)}
                                        style={styles.avatar}
                                    />
                                    <View style={styles.applicantDetails}>
                                        <Text variant="titleMedium" style={styles.applicantName}>
                                            {application.pharmacist_name}
                                        </Text>
                                        <View style={styles.badges}>
                                            {application.rating && (
                                                <Chip icon="star" style={styles.ratingChip} compact>
                                                    {application.rating.toFixed(1)}
                                                </Chip>
                                            )}
                                            {application.experience_years && (
                                                <Chip icon="briefcase" compact>
                                                    {application.experience_years} yrs
                                                </Chip>
                                            )}
                                        </View>
                                    </View>
                                </View>
                            </View>

                            <Divider style={styles.divider} />

                            {/* Details */}
                            <List.Section style={styles.details}>
                                {application.ahpra_number && (
                                    <List.Item
                                        title="AHPRA Number"
                                        description={application.ahpra_number}
                                        left={props => <List.Icon {...props} icon="certificate" />}
                                    />
                                )}
                                <List.Item
                                    title="Applied"
                                    description={formatDate(application.applied_date)}
                                    left={props => <List.Icon {...props} icon="calendar" />}
                                />
                                {application.pharmacist_email && (
                                    <List.Item
                                        title="Email"
                                        description={application.pharmacist_email}
                                        left={props => <List.Icon {...props} icon="email" />}
                                    />
                                )}
                            </List.Section>

                            {/* Cover Letter */}
                            {application.cover_letter && (
                                <>
                                    <Divider style={styles.divider} />
                                    <View style={styles.coverLetterContainer}>
                                        <Text variant="labelMedium" style={styles.coverLetterLabel}>
                                            Cover Letter
                                        </Text>
                                        <Text variant="bodyMedium" style={styles.coverLetter}>
                                            {application.cover_letter}
                                        </Text>
                                    </View>
                                </>
                            )}

                            {/* Actions */}
                            {application.status === 'PENDING' && (
                                <>
                                    <Divider style={styles.divider} />
                                    <View style={styles.actions}>
                                        <Button
                                            mode="outlined"
                                            textColor="#d32f2f"
                                            onPress={() => handleReject(application.id)}
                                            style={styles.actionButton}
                                        >
                                            Reject
                                        </Button>
                                        <Button
                                            mode="contained"
                                            onPress={() => handleAccept(application.id)}
                                            style={[styles.actionButton, styles.acceptButton]}
                                        >
                                            Accept
                                        </Button>
                                    </View>
                                </>
                            )}

                            {application.status !== 'PENDING' && (
                                <>
                                    <Divider style={styles.divider} />
                                    <Chip
                                        icon={application.status === 'ACCEPTED' ? 'check-circle' : 'close-circle'}
                                        style={[
                                            styles.statusChipBottom,
                                            application.status === 'ACCEPTED' ? styles.acceptedChip : styles.rejectedChip
                                        ]}
                                    >
                                        {application.status}
                                    </Chip>
                                </>
                            )}
                        </Surface>
                    ))
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    loadingText: {
        color: '#666',
    },
    header: {
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    title: {
        fontWeight: 'bold',
        marginBottom: 4,
    },
    subtitle: {
        color: '#666',
    },
    errorContainer: {
        margin: 16,
        padding: 16,
        backgroundColor: '#ffebee',
        borderRadius: 8,
        alignItems: 'center',
        gap: 12,
    },
    errorText: {
        color: '#c62828',
        textAlign: 'center',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },
    card: {
        padding: 16,
        borderRadius: 12,
        backgroundColor: '#fff',
        marginBottom: 16,
    },
    cardHeader: {
        marginBottom: 8,
    },
    applicantInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    avatar: {
        backgroundColor: '#1976d2',
    },
    applicantDetails: {
        flex: 1,
    },
    applicantName: {
        fontWeight: 'bold',
        marginBottom: 4,
    },
    badges: {
        flexDirection: 'row',
        gap: 8,
    },
    ratingChip: {
        backgroundColor: '#fff3e0',
    },
    divider: {
        marginVertical: 12,
    },
    details: {
        marginVertical: -8,
    },
    coverLetterContainer: {
        padding: 12,
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
    },
    coverLetterLabel: {
        color: '#666',
        marginBottom: 8,
    },
    coverLetter: {
        lineHeight: 20,
        color: '#424242',
    },
    actions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 4,
    },
    actionButton: {
        flex: 1,
    },
    acceptButton: {
        flex: 1.5,
    },
    statusChipBottom: {
        alignSelf: 'flex-start',
    },
    acceptedChip: {
        backgroundColor: '#e8f5e9',
    },
    rejectedChip: {
        backgroundColor: '#ffebee',
    },
    emptyContainer: {
        alignItems: 'center',
        padding: 40,
        marginTop: 40,
    },
    emptyTitle: {
        fontWeight: 'bold',
        marginBottom: 8,
    },
    emptyText: {
        color: '#666',
        textAlign: 'center',
    },
});
