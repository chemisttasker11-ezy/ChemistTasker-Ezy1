import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, Button, Chip, Divider, List, Surface, Text } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    acceptShiftCandidateService,
    fetchShiftInterests,
    revealShiftInterestService,
    type ShiftInterest,
} from '@chemisttasker/shared-core';

function formatDateTime(value?: string | null) {
    if (!value) return 'Not recorded';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function isAnonymousInterest(interest: ShiftInterest) {
    if (interest.revealed || interest.userDetail) return false;
    const userLabel = typeof interest.user === 'string' ? interest.user : '';
    return userLabel === 'Anonymous Interest User' || interest.displayName === 'Anonymous Interest User';
}

function candidateName(interest: ShiftInterest) {
    if (isAnonymousInterest(interest)) return 'Anonymous candidate';

    const detail = interest.userDetail;
    if (detail) {
        const fullName = [detail.firstName, detail.lastName].filter(Boolean).join(' ').trim();
        if (fullName) return fullName;
    }

    if (typeof interest.user === 'string' && interest.user.trim()) return interest.user;
    return interest.displayName || 'Candidate';
}

function initials(name: string) {
    if (name === 'Anonymous candidate') return '?';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || 'C';
}

export default function ShiftApplicationsScreen() {
    const { id } = useLocalSearchParams<{ id?: string }>();
    const [interests, setInterests] = useState<ShiftInterest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionKey, setActionKey] = useState<string | null>(null);

    const shiftId = Number(id);

    const fetchCandidates = useCallback(async () => {
        if (!Number.isFinite(shiftId)) {
            setError('Invalid shift.');
            setLoading(false);
            return;
        }

        try {
            setError('');
            const response = await fetchShiftInterests({ shiftId });
            setInterests(response);
        } catch (err) {
            console.error('Error fetching shift interests:', err);
            setError('Failed to load candidate responses.');
        } finally {
            setLoading(false);
        }
    }, [shiftId]);

    useEffect(() => {
        void fetchCandidates();
    }, [fetchCandidates]);

    const handleReveal = async (interest: ShiftInterest) => {
        if (interest.userId == null || !Number.isFinite(shiftId)) {
            Alert.alert('Unable to reveal', 'This candidate response is missing its worker identity.');
            return;
        }

        const key = `reveal_${interest.id}`;
        setActionKey(key);
        try {
            await revealShiftInterestService(shiftId, {
                userId: interest.userId,
                slotId: interest.slotId ?? null,
            });
            await fetchCandidates();
        } catch (err) {
            console.error('Failed to reveal candidate:', err);
            Alert.alert('Error', 'Failed to reveal candidate.');
        } finally {
            setActionKey(null);
        }
    };

    const handleSendOffer = (interest: ShiftInterest) => {
        if (interest.userId == null || !Number.isFinite(shiftId)) {
            Alert.alert('Unable to continue', 'This candidate response is missing its worker identity.');
            return;
        }

        Alert.alert(
            'Send offer',
            `Send an offer to ${candidateName(interest)} for this shift?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Send offer',
                    onPress: async () => {
                        const key = `offer_${interest.id}`;
                        setActionKey(key);
                        try {
                            await acceptShiftCandidateService(shiftId, {
                                userId: interest.userId as number,
                                slotId: interest.slotId ?? null,
                            });
                            await fetchCandidates();
                            Alert.alert('Offer sent', 'Waiting for the candidate to confirm the offer.');
                        } catch (err) {
                            console.error('Failed to send candidate offer:', err);
                            Alert.alert('Error', 'Failed to send offer.');
                        } finally {
                            setActionKey(null);
                        }
                    },
                },
            ],
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['left', 'right']}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#1976d2" />
                    <Text style={styles.loadingText}>Loading candidate responses...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <View style={styles.header}>
                <Text variant="headlineSmall" style={styles.title}>
                    Candidate responses ({interests.length})
                </Text>
                <Text variant="bodyMedium" style={styles.subtitle}>
                    Review expressions of interest and send offers from the live shift workflow.
                </Text>
            </View>

            {error ? (
                <Surface style={styles.errorContainer} elevation={1}>
                    <Text style={styles.errorText}>{error}</Text>
                    <Button onPress={fetchCandidates}>Retry</Button>
                </Surface>
            ) : null}

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                {interests.length === 0 ? (
                    <Surface style={styles.emptyContainer} elevation={0}>
                        <Text variant="titleMedium" style={styles.emptyTitle}>
                            No candidate responses yet
                        </Text>
                        <Text variant="bodyMedium" style={styles.emptyText}>
                            Expressions of interest will appear here when workers respond to this shift.
                        </Text>
                    </Surface>
                ) : (
                    interests.map((interest) => {
                        const name = candidateName(interest);
                        const anonymous = isAnonymousInterest(interest);
                        const pendingConfirmation = Boolean(interest.pendingConfirmation);
                        const awaitingPayment = Boolean(interest.awaitingPayment);
                        const busyReveal = actionKey === `reveal_${interest.id}`;
                        const busyOffer = actionKey === `offer_${interest.id}`;

                        return (
                            <Surface key={interest.id} style={styles.card} elevation={2}>
                                <View style={styles.cardHeader}>
                                    <View style={styles.applicantInfo}>
                                        <Avatar.Text
                                            size={50}
                                            label={initials(name)}
                                            style={styles.avatar}
                                        />
                                        <View style={styles.applicantDetails}>
                                            <Text variant="titleMedium" style={styles.applicantName}>
                                                {name}
                                            </Text>
                                            <View style={styles.badges}>
                                                {awaitingPayment ? (
                                                    <Chip compact style={styles.awaitingPaymentChip}>Awaiting payment</Chip>
                                                ) : pendingConfirmation ? (
                                                    <Chip compact style={styles.pendingChip}>Offer pending</Chip>
                                                ) : (
                                                    <Chip compact style={styles.interestedChip}>Interested</Chip>
                                                )}
                                            </View>
                                        </View>
                                    </View>
                                </View>

                                <Divider style={styles.divider} />

                                <List.Section style={styles.details}>
                                    <List.Item
                                        title="Requested slot"
                                        description={interest.slotTime || 'Whole shift'}
                                        left={props => <List.Icon {...props} icon="calendar-clock" />}
                                    />
                                    <List.Item
                                        title="Expressed interest"
                                        description={formatDateTime(interest.expressedAt)}
                                        left={props => <List.Icon {...props} icon="clock-outline" />}
                                    />
                                    {interest.userDetail?.email ? (
                                        <List.Item
                                            title="Email"
                                            description={interest.userDetail.email}
                                            left={props => <List.Icon {...props} icon="email" />}
                                        />
                                    ) : null}
                                </List.Section>

                                {interest.shortBio ? (
                                    <>
                                        <Divider style={styles.divider} />
                                        <View style={styles.bioContainer}>
                                            <Text variant="labelMedium" style={styles.bioLabel}>Profile</Text>
                                            <Text variant="bodyMedium" style={styles.bioText}>{interest.shortBio}</Text>
                                        </View>
                                    </>
                                ) : null}

                                <Divider style={styles.divider} />
                                <View style={styles.actions}>
                                    {anonymous ? (
                                        <Button
                                            mode="contained"
                                            onPress={() => void handleReveal(interest)}
                                            loading={busyReveal}
                                            disabled={actionKey !== null}
                                            style={styles.primaryAction}
                                        >
                                            Reveal candidate
                                        </Button>
                                    ) : pendingConfirmation || awaitingPayment ? (
                                        <Text style={styles.statusText}>
                                            {awaitingPayment
                                                ? 'Candidate accepted the offer. Payment is required to finalise the shift.'
                                                : 'Offer sent. Waiting for candidate confirmation.'}
                                        </Text>
                                    ) : (
                                        <Button
                                            mode="contained"
                                            onPress={() => handleSendOffer(interest)}
                                            loading={busyOffer}
                                            disabled={actionKey !== null}
                                            style={styles.primaryAction}
                                        >
                                            Send offer
                                        </Button>
                                    )}
                                </View>
                            </Surface>
                        );
                    })
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
        marginBottom: 6,
    },
    badges: {
        flexDirection: 'row',
        gap: 8,
    },
    interestedChip: {
        backgroundColor: '#e3f2fd',
    },
    pendingChip: {
        backgroundColor: '#fff8e1',
    },
    awaitingPaymentChip: {
        backgroundColor: '#f3e5f5',
    },
    divider: {
        marginVertical: 12,
    },
    details: {
        marginVertical: -8,
    },
    bioContainer: {
        padding: 12,
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
    },
    bioLabel: {
        color: '#666',
        marginBottom: 8,
    },
    bioText: {
        lineHeight: 20,
        color: '#424242',
    },
    actions: {
        marginTop: 4,
    },
    primaryAction: {
        alignSelf: 'stretch',
    },
    statusText: {
        color: '#555',
        lineHeight: 20,
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
