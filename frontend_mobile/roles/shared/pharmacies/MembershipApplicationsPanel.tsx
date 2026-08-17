// Membership Applications Panel - Mobile
// Displays and manages pending membership applications

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import {
    Card,
    Text,
    Button,
    ActivityIndicator,
    Menu,
} from 'react-native-paper';
import {
    fetchMembershipApplicationsService,
    approveMembershipApplicationService,
    rejectMembershipApplicationService,
    type MembershipApplication,
    type MembershipDTO,
} from '@chemisttasker/shared-core';
import { surfaceTokens } from './types';

const getFirstErrorMessage = (value: unknown): string | null => {
    if (Array.isArray(value)) {
        return typeof value[0] === 'string' ? value[0] : null;
    }
    return null;
};

type ApplicationCategory = 'FULL_PART_TIME' | 'LOCUM_CASUAL';

const deriveLocumEmploymentType = (role?: string) =>
    String(role || '').toUpperCase() === 'PHARMACIST' ? 'LOCUM' : 'SHIFT_HERO';

const readMembershipValue = (membership: MembershipDTO, camelKey: string, snakeKey: string) =>
    (membership as any)?.[camelKey] ?? (membership as any)?.[snakeKey] ?? '';

const membershipDisplayName = (membership: MembershipDTO) => {
    const userDetails = (membership as any).userDetails ?? (membership as any).user_details ?? {};
    const first = userDetails.firstName ?? userDetails.first_name;
    const last = userDetails.lastName ?? userDetails.last_name;
    return (
        readMembershipValue(membership, 'invitedName', 'invited_name') ||
        (membership as any).name ||
        [first, last].filter(Boolean).join(' ') ||
        'Invited team member'
    );
};

const membershipEmail = (membership: MembershipDTO) => {
    const userDetails = (membership as any).userDetails ?? (membership as any).user_details ?? {};
    return userDetails.email || (membership as any).email || '';
};

export function PendingDirectInvitationsPanel({
    memberships,
    title,
}: {
    memberships: MembershipDTO[];
    title: string;
}) {
    const pendingMemberships = memberships.filter((membership) => {
        const status = String((membership as any).status || '').toUpperCase();
        const active = ((membership as any).is_active ?? (membership as any).isActive) !== false;
        return status === 'PENDING' || (!status && !active);
    });

    if (!pendingMemberships.length) {
        return null;
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>{title}</Text>
            {pendingMemberships.map((membership) => {
                const role = String((membership as any).role || '').replace(/_/g, ' ');
                const workType = String(readMembershipValue(membership, 'employmentType', 'employment_type') || '').replace(/_/g, ' ');
                const jobTitle = readMembershipValue(membership, 'jobTitle', 'job_title');
                return (
                    <Card key={membership.id} style={styles.card}>
                        <Card.Content>
                            <Text style={styles.applicantName}>{membershipDisplayName(membership)}</Text>
                            {membershipEmail(membership) ? <Text style={styles.applicantEmail}>{membershipEmail(membership)}</Text> : null}
                            <View style={styles.details}>
                                {role ? <Text style={styles.detailText}>Role: {role}</Text> : null}
                                {workType ? <Text style={styles.detailText}>Work type: {workType}</Text> : null}
                                {jobTitle ? <Text style={styles.detailText}>Job title: {jobTitle}</Text> : null}
                                <Text style={styles.detailText}>Waiting for team member response</Text>
                            </View>
                        </Card.Content>
                    </Card>
                );
            })}
        </View>
    );
}

interface MembershipApplicationsPanelProps {
    pharmacyId: string;
    category: ApplicationCategory;
    title?: string;
    allowedEmploymentTypes?: string[];
    defaultEmploymentType?: string;
    onApproved?: () => void;
    onNotification?: (message: string, severity: 'success' | 'error') => void;
}

export default function MembershipApplicationsPanel({
    pharmacyId,
    category,
    title = 'Pending Applications',
    allowedEmploymentTypes = ['FULL_TIME', 'PART_TIME', 'CASUAL'],
    defaultEmploymentType = 'CASUAL',
    onApproved,
    onNotification,
}: MembershipApplicationsPanelProps) {
    const [applications, setApplications] = useState<MembershipApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [processingId, setProcessingId] = useState<string | number | null>(null);
    const [employmentMenuVisible, setEmploymentMenuVisible] = useState<string | number | null>(null);
    const [selectedEmployment, setSelectedEmployment] = useState<Record<string | number, string>>({});

    const readValue = (app: MembershipApplication, camelKey: string, snakeKey: string) =>
        (app as any)?.[camelKey] ?? (app as any)?.[snakeKey] ?? '';

    const loadApplications = async () => {
        setLoading(true);
        setLoadError('');
        try {
            const results = await fetchMembershipApplicationsService({ status: 'PENDING' });
            const filtered = results.filter(
                (app: MembershipApplication) =>
                    String(app.pharmacy) === String(pharmacyId) && app.category === category
            );
            setApplications(filtered);
        } catch (error: any) {
            console.error('Failed to load applications', error);
            const detail = error?.response?.data?.detail || error?.message || 'Failed to load pending applications.';
            setLoadError(detail);
            onNotification?.(detail, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadApplications();
    }, [pharmacyId, category]);

    const handleApprove = async (app: MembershipApplication, employment?: string) => {
        const applicationId = app.id;
        setProcessingId(applicationId);
        try {
            const employmentType =
                app.category === 'LOCUM_CASUAL'
                    ? deriveLocumEmploymentType(app.role)
                    : employment || selectedEmployment[applicationId] || defaultEmploymentType;

            await approveMembershipApplicationService(String(applicationId), {
                employment_type: employmentType,
            });

            onNotification?.('Application approved', 'success');
            onApproved?.();
            await loadApplications();
        } catch (error: any) {
            const data = error?.response?.data;
            const firstFieldError =
                data && typeof data === 'object'
                    ? Object.values(data as Record<string, unknown>)
                        .map(getFirstErrorMessage)
                        .find((value): value is string => Boolean(value))
                    : null;
            const detail = data?.detail || firstFieldError || error?.message;
            onNotification?.(detail || 'Failed to approve application', 'error');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (applicationId: string | number) => {
        setProcessingId(applicationId);
        try {
            await rejectMembershipApplicationService(String(applicationId));
            onNotification?.('Application rejected', 'success');
            await loadApplications();
        } catch (error: any) {
            const data = error?.response?.data;
            const detail = data?.detail || error?.message;
            onNotification?.(detail || 'Failed to reject application', 'error');
        } finally {
            setProcessingId(null);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={surfaceTokens.primary} />
                <Text>Loading applications...</Text>
            </View>
        );
    }

    if (loadError) {
        return (
            <View style={styles.container}>
                <Text style={styles.errorText}>{loadError}</Text>
            </View>
        );
    }

    if (applications.length === 0) {
        return null; // Don't show panel if no applications
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>{title}</Text>
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                {applications.map((app) => {
                    const applicantName =
                        [app.firstName, app.lastName].filter(Boolean).join(' ') || 'Applicant';
                    const username = readValue(app, 'username', 'username');
                    const jobTitle = readValue(app, 'jobTitle', 'job_title');
                    const mobileNumber = readValue(app, 'mobileNumber', 'mobile_number');
                    const classification =
                        readValue(app, 'pharmacistAwardLevel', 'pharmacist_award_level') ||
                        readValue(app, 'otherstaffClassificationLevel', 'otherstaff_classification_level') ||
                        readValue(app, 'internHalf', 'intern_half') ||
                        readValue(app, 'studentYear', 'student_year');

                    return (
                        <Card key={app.id} style={styles.card}>
                            <Card.Content>
                                <View style={styles.cardHeader}>
                                    <View style={styles.applicantInfo}>
                                        <Text style={styles.applicantName}>{applicantName}</Text>
                                        <Text style={styles.applicantEmail}>{app.email}</Text>
                                    </View>
                                </View>

                                <View style={styles.details}>
                                    <Text style={styles.detailText}>Role: {app.role || 'N/A'}</Text>
                                    {username ? <Text style={styles.detailText}>Username: {username}</Text> : null}
                                    {jobTitle ? <Text style={styles.detailText}>Job title: {jobTitle}</Text> : null}
                                    {mobileNumber ? <Text style={styles.detailText}>Mobile: {mobileNumber}</Text> : null}
                                    {classification ? <Text style={styles.detailText}>Classification: {classification}</Text> : null}
                                </View>

                                {category === 'FULL_PART_TIME' && (
                                    <View style={styles.employmentSelector}>
                                        <Text style={styles.label}>Employment Type:</Text>
                                        <Menu
                                            visible={employmentMenuVisible === app.id}
                                            onDismiss={() => setEmploymentMenuVisible(null)}
                                            anchor={
                                                <Button
                                                    mode="outlined"
                                                    onPress={() => setEmploymentMenuVisible(app.id)}
                                                    compact
                                                >
                                                    {selectedEmployment[app.id] || defaultEmploymentType}
                                                </Button>
                                            }
                                        >
                                            {allowedEmploymentTypes.map((type) => (
                                                <Menu.Item
                                                    key={type}
                                                    onPress={() => {
                                                        setSelectedEmployment((prev) => ({ ...prev, [app.id]: type }));
                                                        setEmploymentMenuVisible(null);
                                                    }}
                                                    title={type.replace('_', ' ')}
                                                />
                                            ))}
                                        </Menu>
                                    </View>
                                )}

                                <View style={styles.actions}>
                                    <Button
                                        mode="contained"
                                        onPress={() => handleApprove(app)}
                                        loading={processingId === app.id}
                                        disabled={!!processingId}
                                        compact
                                    >
                                        Approve
                                    </Button>
                                    <Button
                                        mode="outlined"
                                        onPress={() => handleReject(app.id)}
                                        disabled={!!processingId}
                                        compact
                                        textColor={surfaceTokens.error}
                                    >
                                        Reject
                                    </Button>
                                </View>
                            </Card.Content>
                        </Card>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginTop: 24,
        padding: 16,
        backgroundColor: surfaceTokens.bgDark,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 16,
    },
    loadingContainer: {
        padding: 32,
        alignItems: 'center',
        gap: 12,
    },
    list: {
        maxHeight: 400,
    },
    listContent: {
        paddingBottom: 16,
    },
    card: {
        marginBottom: 12,
        backgroundColor: surfaceTokens.bg,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    applicantInfo: {
        flex: 1,
    },
    applicantName: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    applicantEmail: {
        fontSize: 14,
        color: surfaceTokens.textMuted,
    },
    statusChip: {
        height: 28,
    },
    details: {
        marginBottom: 12,
    },
    detailText: {
        fontSize: 14,
        marginBottom: 4,
    },
    employmentSelector: {
        marginBottom: 12,
    },
    label: {
        fontSize: 14,
        marginBottom: 8,
        color: surfaceTokens.textMuted,
    },
    actions: {
        flexDirection: 'row',
        gap: 8,
    },
    errorText: {
        color: surfaceTokens.error,
        fontSize: 14,
    },
});
